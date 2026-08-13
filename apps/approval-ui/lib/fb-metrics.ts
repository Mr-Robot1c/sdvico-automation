import { getServerClient } from './supabase-server';

// Kéo số liệu tương tác từng bài Facebook (reactions/comments/shares) về mkt_metrics.
// Token FB có pages_read_engagement là đủ (không cần read_insights cho mấy chỉ số này).
type Client = ReturnType<typeof getServerClient>;

function objectIdFromUrl(u: string | null): string | null {
  if (!u) return null;
  const seg = u.split('?')[0].split('/').filter(Boolean);
  return seg.length ? seg[seg.length - 1] : null;
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
    .limit(50);

  const day = todayVN();
  const results: any[] = [];
  for (const p of posts || []) {
    const cid = (p as any).content_id as string | null;
    const objId = objectIdFromUrl((p as any).external_url as string | null);
    if (!cid || !objId) continue;
    try {
      const r = await fetch(
        `https://graph.facebook.com/${VERSION}/${objId}?fields=reactions.summary(total_count),comments.summary(total_count),shares`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
      const j: any = await r.json();
      if (j?.error) {
        results.push({ contentId: cid, objId, error: j.error.message });
        continue;
      }
      const reactions = j?.reactions?.summary?.total_count ?? 0;
      const comments = j?.comments?.summary?.total_count ?? 0;
      const shares = j?.shares?.count ?? 0;
      const metrics = { reactions, comments, shares, engagement: reactions + comments + shares };
      await client.from('mkt_metrics').insert({ source: 'facebook', entity_ref: cid, metric_date: day, metrics });
      results.push({ contentId: cid, objId, metrics });
    } catch (e: any) {
      results.push({ contentId: cid, objId, error: String(e?.message || e) });
    }
  }
  return { pulled: results.length, results };
}
