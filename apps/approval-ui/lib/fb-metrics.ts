import { getServerClient } from './supabase-server';

// Kéo số liệu từng bài Facebook về mkt_metrics.
// - Cơ bản (reactions/like, comments, shares): chỉ cần pages_read_engagement.
// - Lượt xem (impressions / video views) + số giây xem (video): CẦN quyền read_insights trên
//   token Page. Thiếu quyền thì các chỉ số này để trống, số cơ bản vẫn lấy được. Mỗi chỉ số
//   insights gọi RIÊNG + try/catch để một metric lỗi không làm mất chỉ số khác.
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
  const targets: { cid: string; objId: string; isVideo: boolean }[] = [];
  for (const p of posts || []) {
    const cid = (p as any).content_id as string | null;
    const url = (p as any).external_url as string | null;
    const objId = objectIdFromUrl(url);
    if (!cid || !objId || seen.has(cid)) continue;
    seen.add(cid);
    targets.push({ cid, objId, isVideo: /\/videos\//.test(url || '') });
  }

  const day = todayVN();

  // Gọi Graph API song song (tối đa 8 việc cùng lúc), mỗi request có timeout riêng.
  const results = await mapPool(targets, 8, async ({ cid, objId, isVideo }) => {
    try {
      const j = await fetchJsonWithTimeout(
        `https://graph.facebook.com/${VERSION}/${objId}?fields=reactions.summary(total_count),comments.summary(total_count),shares`,
        TOKEN
      );
      if (j?.error) return { contentId: cid, objId, error: j.error.message } as any;
      const reactions = j?.reactions?.summary?.total_count ?? 0;
      const comments = j?.comments?.summary?.total_count ?? 0;
      const shares = j?.shares?.count ?? 0;
      const metrics: any = { reactions, comments, shares, engagement: reactions + comments + shares };

      // Chỉ số CẦN read_insights: lượt xem + số giây xem. Gọi RIÊNG + try/catch từng cái để một
      // metric lỗi (thiếu quyền / sai tên) không làm mất chỉ số khác. Thiếu quyền -> để trống.
      const insightErr: string[] = [];
      const valOf = (r: any, name: string): number | null => {
        const d = Array.isArray(r?.data) ? r.data.find((x: any) => x?.name === name) : null;
        const v = d?.values?.[0]?.value;
        return v == null ? null : Number(v);
      };
      const grab = async (path: string, key: string, pick: (r: any) => number | null) => {
        try {
          const r = await fetchJsonWithTimeout(`https://graph.facebook.com/${VERSION}/${path}`, TOKEN, 6000);
          if (r?.error) { insightErr.push(`${key}: ${r.error.message}`); return; }
          const v = pick(r);
          if (v != null && !Number.isNaN(v)) metrics[key] = v;
        } catch (e: any) {
          insightErr.push(`${key}: ${String(e?.message || e)}`);
        }
      };
      if (isVideo) {
        // Lượt xem video + tổng thời gian xem (ms -> giây) + số NGƯỜI xem (unique = reach).
        await grab(`${objId}/video_insights?metric=total_video_views`, 'views', (r) => valOf(r, 'total_video_views'));
        await grab(`${objId}/video_insights?metric=total_video_view_total_time`, 'watchSec', (r) => {
          const ms = valOf(r, 'total_video_view_total_time');
          return ms == null ? null : Math.round(ms / 1000);
        });
        await grab(`${objId}/video_insights?metric=total_video_views_unique`, 'reach', (r) => valOf(r, 'total_video_views_unique'));
      } else {
        // Bài ảnh/chữ: lượt hiển thị (impressions) = "lượt xem"; số NGƯỜI thấy (unique) = "người xem" (reach).
        await grab(`${objId}/insights?metric=post_impressions`, 'views', (r) => valOf(r, 'post_impressions'));
        await grab(`${objId}/insights?metric=post_impressions_unique`, 'reach', (r) => valOf(r, 'post_impressions_unique'));
      }

      return { contentId: cid, objId, metrics, insightErr: insightErr.length ? insightErr : undefined } as any;
    } catch (e: any) {
      return { contentId: cid, objId, error: String(e?.message || e) } as any;
    }
  });

  // Gộp mọi số liệu lấy được thành MỘT insert (thay vì insert từng dòng).
  const rows = results
    .filter((r: any) => r && r.metrics)
    .map((r: any) => ({ source: 'facebook', entity_ref: r.contentId, metric_date: day, metrics: r.metrics }));
  if (rows.length) await client.from('mkt_metrics').insert(rows);

  // Số NGƯỜI THEO DÕI Trang (page-level). Lưu 1 dòng entity_ref='__page__' để trang Đo lường hiện
  // "X follower" làm mốc so với reach từng bài. followers_count/fan_count là field cơ bản của Page
  // (không cần read_insights). Với Page token, /me chính là Trang.
  try {
    const pj = await fetchJsonWithTimeout(
      `https://graph.facebook.com/${VERSION}/me?fields=followers_count,fan_count,name`,
      TOKEN
    );
    if (pj && !pj.error) {
      const followers = Number(pj.followers_count) || Number(pj.fan_count) || 0;
      const fans = Number(pj.fan_count) || 0;
      if (followers || fans) {
        await client.from('mkt_metrics').insert({
          source: 'facebook',
          entity_ref: '__page__',
          metric_date: day,
          metrics: { followers, fans, name: pj.name || null }
        });
      }
    }
  } catch { /* bỏ qua lỗi lấy follower */ }

  return { pulled: rows.length, results };
}
