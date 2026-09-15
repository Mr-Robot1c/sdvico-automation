// lib/channel-posts.ts — DANH SÁCH BÀI ĐÃ ĐĂNG THEO TỪNG NỀN TẢNG kèm số mới nhất (15/9, Thanh: "bấm
// được xem bài đăng / tổng view / tổng cmt của từng nền tảng: bài gì, ngày nào, mấy giờ, lượt view").
// Dùng chung cho /kenh/<nền tảng>, /video/da-dang, và dashboard tuần theo kênh.
//
// Luật số liệu (giữ nguyên các chốt cũ):
//   - Facebook: chỉ bài KÊNH CHÍNH (brief.fb_real_url hoặc import từ page chính — page-origin.mjs isOtherPage).
//   - TikTok: bài ghép tay không có mkt_posts -> lấy từ snapshot mkt_metrics có createTime; CHỈ video còn trên
//     kênh hiện tại (@sdvico_tbtauca) — lọc theo danh sách id video của kênh (Display API) hoặc mốc nối kênh.
//   - Số = snapshot mkt_metrics mới nhất của (bài, nguồn).
import type { getServerClient } from './supabase-server';
import { isCurrentTikTokMetric, TIKTOK_CONNECTED_AT } from './tiktok-username';
// @ts-ignore — module JS thuần
import { isOtherPage } from './page-origin.mjs';

type Client = ReturnType<typeof getServerClient>;
export type Channel = 'facebook' | 'youtube' | 'tiktok';
export type ChannelPost = {
  cid: string; channel: Channel; title: string; product: string; kind: string;
  publishedAt: string | null; url: string | null; isVideo: boolean;
  views: number; reactions: number; comments: number; shares: number; engagement: number; reach: number | null; watchSec: number | null;
  metricAt: string | null;
};

const productOf = (brief: any): string => {
  const g = String(brief?.rotation_group || '');
  if (brief?.post_kind === 'content' || g === 'Bài content') return 'Bài content';
  return g.replace(/^\s*\d+\.\s*/, '').trim() || String(brief?.keyword || '').slice(0, 48);
};

export async function loadChannelPosts(
  client: Client,
  channel: Channel,
  opts: { limit?: number; sinceIso?: string | null; untilIso?: string | null; tiktokIds?: Set<string> | null } = {}
): Promise<ChannelPost[]> {
  const limit = opts.limit ?? 300;
  let q = client.from('mkt_posts').select('content_id, channel, external_url, published_at').eq('status', 'published').is('deleted_at', null).eq('channel', channel).order('published_at', { ascending: false }).limit(limit);
  if (opts.sinceIso) q = q.gte('published_at', opts.sinceIso);
  if (opts.untilIso) q = q.lt('published_at', opts.untilIso);
  const { data: postRows } = await q;
  const posts = (postRows || []) as any[];
  const byCid = new Map<string, { url: string | null; publishedAt: string | null }>();
  const connectedIso = new Date(TIKTOK_CONNECTED_AT + 'T00:00:00+07:00').toISOString();
  for (const p of posts) {
    const cid = String(p.content_id || '');
    if (!cid || byCid.has(cid)) continue;
    // TikTok: dòng mkt_posts thời Direct Post của kênh cũ (trước ngày nối kênh mới) bỏ — kênh đó đã mất.
    if (channel === 'tiktok' && p.published_at && String(p.published_at) < connectedIso) continue;
    byCid.set(cid, { url: p.external_url || null, publishedAt: p.published_at || null });
  }

  // TikTok ghép tay: thêm từ snapshot có createTime.
  let metricRows: any[] = [];
  if (channel === 'tiktok') {
    const { data } = await client.from('mkt_metrics').select('entity_ref, metrics, created_at').eq('source', 'tiktok').order('created_at', { ascending: false }).limit(900);
    metricRows = (data || []) as any[];
    for (const r of metricRows) {
      const cid = String(r.entity_ref || ''); const m = r.metrics || {};
      if (!cid || cid.startsWith('__') || byCid.has(cid) || !m.createTime) continue;
      if (!isCurrentTikTokMetric(m, opts.tiktokIds ?? null)) continue;
      const iso = new Date(Number(m.createTime) * 1000).toISOString();
      if (opts.sinceIso && iso < opts.sinceIso) continue;
      if (opts.untilIso && iso >= opts.untilIso) continue;
      byCid.set(cid, { url: m.shareUrl ? String(m.shareUrl) : null, publishedAt: iso });
    }
  }
  const cids = [...byCid.keys()];
  if (!cids.length) return [];
  const [{ data: contents }, metricsRes] = await Promise.all([
    client.from('mkt_content').select('id, title, kind, brief, deleted_at').in('id', cids.slice(0, 500)),
    channel === 'tiktok' ? Promise.resolve({ data: metricRows }) : client.from('mkt_metrics').select('entity_ref, metrics, created_at').eq('source', channel).in('entity_ref', cids.slice(0, 500)).order('created_at', { ascending: false }).limit(1500),
  ]);
  const latest = new Map<string, { m: any; at: string }>();
  for (const r of ((metricsRes as any).data || []) as any[]) {
    const k = String(r.entity_ref || '');
    if (!latest.has(k)) {
      if (channel === 'tiktok' && !isCurrentTikTokMetric(r.metrics || {}, opts.tiktokIds ?? null)) continue;
      latest.set(k, { m: r.metrics || {}, at: String(r.created_at) });
    }
  }
  const out: ChannelPost[] = [];
  for (const c of (contents || []) as any[]) {
    if (c.deleted_at) continue;
    const cid = String(c.id); const brief = c.brief || {}; const p = byCid.get(cid)!;
    let url = p.url;
    if (channel === 'facebook') {
      const real = String(brief.fb_real_url || '');
      if (!real && !(isOtherPage as (u: string, b: any) => boolean)(String(p.url || ''), brief)) continue; // page phụ: bỏ
      if (real) url = real;
    }
    if (channel === 'youtube' && latest.get(cid)?.m?.videoId) url = `https://youtube.com/shorts/${latest.get(cid)!.m.videoId}`;
    if (channel === 'tiktok' && latest.get(cid)?.m?.shareUrl) url = String(latest.get(cid)!.m.shareUrl);
    if (url && String(url).startsWith('tiktok:')) url = null;
    const lm = latest.get(cid); const m = lm?.m || {};
    const reactions = Number(m.reactions) || 0, comments = Number(m.comments) || 0, shares = Number(m.shares) || 0;
    out.push({
      cid, channel, title: String(c.title || '(không tên)'), product: productOf(brief), kind: String(c.kind || ''),
      publishedAt: p.publishedAt, url, isVideo: c.kind === 'video' || !!brief.assets?.video || !!brief.assets?.video_v || channel !== 'facebook',
      views: Number(m.views) || 0, reactions, comments, shares, engagement: Number(m.engagement) || reactions + comments + shares,
      reach: m.reach != null ? Number(m.reach) : null, watchSec: m.watchSec != null ? Number(m.watchSec) : null, metricAt: lm?.at || null,
    });
  }
  return out.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}

export function sumChannel(rows: ChannelPost[]) {
  return rows.reduce((s, r) => ({ posts: s.posts + 1, views: s.views + r.views, comments: s.comments + r.comments, engagement: s.engagement + r.engagement, shares: s.shares + r.shares }), { posts: 0, views: 0, comments: 0, engagement: 0, shares: 0 });
}

// Điểm chất lượng bài (cùng hệ số lib/week-report.ts scoreOf) + xếp hạng tương đối trong nhóm.
export function qualityOf(r: ChannelPost): number {
  return Math.round(r.engagement * 1 + r.views * 0.1 + (r.watchSec || 0) * 0.02 + (r.reach || 0) * 0.05);
}
export function qualityLabel(score: number, all: number[]): { text: string; cls: string } {
  if (!all.length || all.every((x) => x === 0)) return { text: 'chưa có số', cls: 'tone-default' };
  const sorted = [...all].sort((a, b) => b - a);
  const idx = sorted.indexOf(score);
  const p = idx / Math.max(1, sorted.length - 1);
  if (score === 0) return { text: 'chưa có số', cls: 'tone-default' };
  if (p <= 0.33) return { text: 'Tốt', cls: 'tone-ok' };
  if (p <= 0.66) return { text: 'Khá', cls: 'tone-demo' };
  return { text: 'Yếu', cls: 'tone-no' };
}
