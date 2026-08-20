// Số tương tác Facebook cho các bài đã đăng qua hệ thống.
// Không dùng worker/cron — mỗi lần user mở trang, server component tự kiểm cache,
// nếu snapshot cũ hơn TTL_MINUTES phút thì gọi Graph API kéo về, upsert bảng
// hr_fb_post_metrics rồi merge trả về.
//
// Rate limit an toàn:
//   - Cache TTL 15 phút → 1 lần thực gọi Graph mỗi 15 phút cho cùng danh sách bài.
//   - Mỗi lần refresh chỉ đụng tối đa MAX_PER_RUN bài cũ nhất (mặc định 20) — tránh
//     đốt quota Graph nếu Page có nhiều bài; các bài còn lại đợi lượt sau.
//   - Batch phần công khai (like/comment/share) theo lô 45 id/request.
//   - Insights (impressions/reach/click) gọi lẻ, concurrency 5, có Promise.allSettled.
//
// Quyền token: `pages_read_engagement` là đủ cho phần công khai. `read_insights` cần thêm
// nếu muốn có reach/impressions/click — thiếu quyền thì hàm tự lùi, không throw.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostMetrics } from '../app/post-list-client';

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const DEFAULT_TTL_MINUTES = Number(process.env.HR_FB_METRICS_TTL_MINUTES) || 15;
const DEFAULT_MAX_PER_RUN = Number(process.env.HR_FB_METRICS_MAX_PER_RUN) || 20;
const BATCH_SIZE = 45;
const CONCURRENCY = 5;

type MetricsRow = PostMetrics & { fb_post_id: string };

type PublicFields = {
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
};

type InsightsResponse = {
  data?: Array<{ name: string; values?: Array<{ value: number }> }>;
  error?: { message: string };
};

async function fetchPublicBatch(ids: string[], token: string): Promise<Record<string, PublicFields>> {
  if (ids.length === 0) return {};
  const url = new URL(`https://graph.facebook.com/${VERSION}/`);
  url.searchParams.set('ids', ids.join(','));
  // .limit(0) — chỉ lấy summary.total_count, không kéo list reaction/comment thật.
  url.searchParams.set('fields', 'reactions.summary(true).limit(0),comments.summary(true).limit(0),shares');
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  const json = (await res.json()) as Record<string, PublicFields> & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message || `Graph HTTP ${res.status}`);
  return json;
}

async function fetchInsights(fbPostId: string, token: string): Promise<{
  impressions: number | null; reach: number | null; clicks: number | null;
  available: boolean; err: string | null;
}> {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${fbPostId}/insights`);
  url.searchParams.set('metric', 'post_impressions,post_impressions_unique,post_clicks');
  url.searchParams.set('access_token', token);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const json = (await res.json()) as InsightsResponse;
    if (!res.ok || json.error) {
      return { impressions: null, reach: null, clicks: null, available: false, err: json.error?.message || `HTTP ${res.status}` };
    }
    const map: Record<string, number> = {};
    for (const item of json.data || []) {
      const v = item.values?.[0]?.value;
      if (typeof v === 'number') map[item.name] = v;
    }
    return {
      impressions: map['post_impressions'] ?? null,
      reach: map['post_impressions_unique'] ?? null,
      clicks: map['post_clicks'] ?? null,
      available: true, err: null,
    };
  } catch (err) {
    return { impressions: null, reach: null, clicks: null, available: false, err: err instanceof Error ? err.message : String(err) };
  }
}

// Đọc snapshot có sẵn (không gọi Graph). Dùng cho /bao-cao khi chỉ cần số cũ.
export async function loadFbMetricsMap(
  client: SupabaseClient,
  fbPostIds: string[]
): Promise<Map<string, PostMetrics>> {
  const map = new Map<string, PostMetrics>();
  const ids = fbPostIds.filter((id): id is string => !!id);
  if (ids.length === 0) return map;
  const { data, error } = await client
    .from('hr_fb_post_metrics')
    .select('fb_post_id, reactions, comments, shares, impressions, reach, clicks, insights_available, fetched_at')
    .in('fb_post_id', ids);
  if (error || !data) return map;
  for (const row of data as MetricsRow[]) {
    map.set(row.fb_post_id, {
      reactions: row.reactions, comments: row.comments, shares: row.shares,
      impressions: row.impressions, reach: row.reach, clicks: row.clicks,
      insights_available: row.insights_available, fetched_at: row.fetched_at,
    });
  }
  return map;
}

// Kéo mới nếu snapshot cũ hơn TTL, tối đa maxPerRun bài mỗi lần. Trả map đầy đủ (cũ + mới).
// jobPostMap: fb_post_id -> job_post_id để upsert có FK.
export async function refreshStaleMetrics(
  client: SupabaseClient,
  jobPostMap: Map<string, string>,
  opts: { ttlMinutes?: number; maxPerRun?: number } = {}
): Promise<Map<string, PostMetrics>> {
  const ttlMinutes = opts.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const maxPerRun = opts.maxPerRun ?? DEFAULT_MAX_PER_RUN;

  const fbIds = [...jobPostMap.keys()];
  const cached = await loadFbMetricsMap(client, fbIds);

  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) return cached; // Chưa cấu hình token thì trả cache có gì trả nấy.

  // Xác định bài stale: chưa có snapshot, hoặc fetched_at cũ hơn cutoff.
  const cutoffMs = Date.now() - ttlMinutes * 60 * 1000;
  const stale: string[] = [];
  for (const id of fbIds) {
    const row = cached.get(id);
    if (!row) { stale.push(id); continue; }
    if (new Date(row.fetched_at).getTime() < cutoffMs) stale.push(id);
  }
  if (stale.length === 0) return cached;

  // Ưu tiên bài chưa có snapshot trước, sau đó bài cũ nhất; giới hạn maxPerRun.
  stale.sort((a, b) => {
    const ra = cached.get(a); const rb = cached.get(b);
    const ta = ra ? new Date(ra.fetched_at).getTime() : 0;
    const tb = rb ? new Date(rb.fetched_at).getTime() : 0;
    return ta - tb;
  });
  const todo = stale.slice(0, maxPerRun);

  // 1) Batch phần công khai theo lô 45.
  const publicMap: Record<string, PublicFields> = {};
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    try {
      Object.assign(publicMap, await fetchPublicBatch(batch, token));
    } catch {
      // Batch hỏng: bỏ qua lô này, tiếp lô sau. Cache cũ vẫn được trả về.
    }
  }

  // 2) Insights per-post, concurrency 5.
  const insights: Record<string, Awaited<ReturnType<typeof fetchInsights>>> = {};
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const slice = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((id) => fetchInsights(id, token)));
    slice.forEach((id, idx) => { insights[id] = results[idx]; });
  }

  // 3) Gộp thành row upsert, merge vào map trả về.
  const now = new Date().toISOString();
  const rows: Array<MetricsRow & { job_post_id: string }> = [];
  for (const id of todo) {
    const pub = publicMap[id];
    const ins = insights[id];
    if (!pub && !ins?.available) continue; // Cả hai fail — giữ cache cũ.
    const row: MetricsRow & { job_post_id: string } = {
      fb_post_id: id,
      job_post_id: jobPostMap.get(id) as string,
      reactions: pub?.reactions?.summary?.total_count ?? 0,
      comments: pub?.comments?.summary?.total_count ?? 0,
      shares: pub?.shares?.count ?? 0,
      impressions: ins?.impressions ?? null,
      reach: ins?.reach ?? null,
      clicks: ins?.clicks ?? null,
      insights_available: !!ins?.available,
      fetched_at: now,
    };
    rows.push(row);
    cached.set(id, {
      reactions: row.reactions, comments: row.comments, shares: row.shares,
      impressions: row.impressions, reach: row.reach, clicks: row.clicks,
      insights_available: row.insights_available, fetched_at: row.fetched_at,
    });
  }

  if (rows.length > 0) {
    try {
      await client.from('hr_fb_post_metrics').upsert(rows, { onConflict: 'fb_post_id' });
      await client.from('run_log').insert({
        task: 'hr.fb_metrics', status: 'ok',
        detail: { refreshed: rows.length, stale: stale.length, ttl_minutes: ttlMinutes },
      });
    } catch {
      // Upsert hỏng không nên chặn render trang.
    }
  }
  return cached;
}
