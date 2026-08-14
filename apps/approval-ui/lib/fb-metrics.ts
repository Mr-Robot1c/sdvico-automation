import { getServerClient } from './supabase-server';

// Kéo số liệu tương tác từng bài Facebook (reactions/comments/shares) về mkt_metrics.
// Token FB có pages_read_engagement là đủ (không cần read_insights cho mấy chỉ số này).
//
// Hiệu năng: gọi Graph API SONG SONG (pool giới hạn) + timeout từng request + GỘP insert một
// lần. Bản cũ gọi tuần tự từng bài rồi insert từng dòng nên tới 50 vòng chờ nối tiếp, dễ treo.
type Client = ReturnType<typeof getServerClient>;

function objectIdFromUrl(u: string | null): string | null {
  if (!u) return null;
  const seg = u.split('?')[0].split('/').filter(Boolean);
  return seg.length ? seg[seg.length - 1] : null;
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Chạy fn cho từng phần tử, tối đa `limit` việc chạy cùng lúc. Nhanh hơn tuần tự nhiều lần.
async function mapPool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker));
  return out;
}

// fetch có timeout: FB chậm/treo một bài không được làm kẹt cả lượt cập nhật.
async function fetchJsonWithTimeout(url: string, token: string, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function pullFacebookMetrics(client: Client): Promise<{ pulled: number; results: any[] }> {
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!TOKEN) return { pulled: 0, results: [{ error: 'chưa cấu hình FACEBOOK_PAGE_ACCESS_TOKEN' }] };

  const { data: posts } = await client
    .from('mkt_posts')
    .select('content_id, external_url')
    .eq('channel', 'facebook')
    .eq('status', 'published')
    .not('external_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(80);

  // Khử trùng theo bài (một bài có thể đăng nhiều lần) — chỉ lấy bản mới nhất, đỡ gọi thừa.
  const seen = new Set<string>();
  const targets: { cid: string; objId: string }[] = [];
  for (const p of posts || []) {
    const cid = (p as any).content_id as string | null;
    const objId = objectIdFromUrl((p as any).external_url as string | null);
    if (!cid || !objId || seen.has(cid)) continue;
    seen.add(cid);
    targets.push({ cid, objId });
  }

  const day = todayVN();

  // Gọi Graph API song song (tối đa 8 việc cùng lúc), mỗi request có timeout riêng.
  const results = await mapPool(targets, 8, async ({ cid, objId }) => {
    try {
      const j = await fetchJsonWithTimeout(
        `https://graph.facebook.com/${VERSION}/${objId}?fields=reactions.summary(total_count),comments.summary(total_count),shares`,
        TOKEN
      );
      if (j?.error) return { contentId: cid, objId, error: j.error.message } as any;
      const reactions = j?.reactions?.summary?.total_count ?? 0;
      const comments = j?.comments?.summary?.total_count ?? 0;
      const shares = j?.shares?.count ?? 0;
      return { contentId: cid, objId, metrics: { reactions, comments, shares, engagement: reactions + comments + shares } } as any;
    } catch (e: any) {
      return { contentId: cid, objId, error: String(e?.message || e) } as any;
    }
  });

  // Gộp mọi số liệu lấy được thành MỘT insert (thay vì insert từng dòng).
  const rows = results
    .filter((r: any) => r && r.metrics)
    .map((r: any) => ({ source: 'facebook', entity_ref: r.contentId, metric_date: day, metrics: r.metrics }));
  if (rows.length) await client.from('mkt_metrics').insert(rows);

  return { pulled: rows.length, results };
}
