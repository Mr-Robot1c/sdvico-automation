import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '../../../lib/supabase-server';
import { getAccessToken as getYouTubeAccessToken } from '../../../lib/youtube-publish';

// Nhap lai lich su bai FB + YT sau khi user lo bam Xoa (deleteContent cu HARD DELETE 4 bang
// mat luon lich su Like/View). User 26/8: "ve nhung du lieu da mat, m len ytb va facebook
// doc va ghi lai duoc khong?" -> co, route nay lam viec do.
// Chay tren Vercel de dung env vars co san (FACEBOOK_PAGE_TOKEN, YOUTUBE_REFRESH_TOKEN).
// Auth qua ?secret=CRON_SECRET (hoac Bearer). GET tien loi cho user mo browser 1 phat.
//
// Idempotent theo external_url: bai da co skip, chua co tao lai mkt_content + mkt_posts + mkt_metrics.
// Chi snapshot HIEN TAI lam baseline (khong co timeline).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const bearer = (req.headers.get('authorization') || '') === `Bearer ${secret}`;
    const query = url.searchParams.get('secret') === secret;
    if (!bearer && !query) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sinceParam = new URL(req.url).searchParams.get('since');
  const sinceMs = sinceParam ? new Date(sinceParam).getTime() : Date.now() - 90 * 24 * 3600 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const client = getServerClient();

  const fb = await importFacebook(client, sinceIso).catch((e) => ({ added: 0, skipped: 0, errors: [String(e?.message || e)] }));
  const yt = await importYouTube(client, sinceIso).catch((e) => ({ added: 0, skipped: 0, errors: [String(e?.message || e)] }));

  try {
    await client.from('run_log').insert({
      task: 'mkt.reimport_history', actor: 'user', status: 'ok',
      detail: { fb_added: fb.added, fb_skipped: fb.skipped, yt_added: yt.added, yt_skipped: yt.skipped, since: sinceIso }
    });
  } catch { /* bo qua */ }

  return NextResponse.json({
    ok: true,
    since: sinceIso,
    facebook: fb,
    youtube: yt,
    message: `Facebook: thêm ${fb.added} bài mới, skip ${fb.skipped} bài đã có. YouTube: thêm ${yt.added} video mới, skip ${yt.skipped} video đã có.`
  });
}

async function importFacebook(client: any, sinceIso: string): Promise<{ added: number; skipped: number; errors: string[] }> {
  const pageId = (process.env.FACEBOOK_PAGE_ID || '').trim();
  const token = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!pageId || !token) return { added: 0, skipped: 0, errors: ['Thiếu FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN'] };
  let added = 0, skipped = 0;
  const errors: string[] = [];
  const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
  let url: string | null = `https://graph.facebook.com/${version}/${pageId}/posts?` + new URLSearchParams({
    since: String(sinceSec),
    fields: 'id,message,created_time,permalink_url,reactions.summary(true).limit(0),comments.summary(true).limit(0),shares',
    limit: '50',
    access_token: token
  });
  let pages = 0;
  while (url && pages++ < 20) {
    const r = await fetch(url);
    const j: any = await r.json();
    if (j.error) { errors.push('FB list: ' + j.error.message); break; }
    for (const p of (j.data || [])) {
      try {
        const permalink = String(p.permalink_url || `https://www.facebook.com/${p.id}`);
        const { data: existing } = await client.from('mkt_posts')
          .select('id, content_id').eq('external_url', permalink).eq('channel', 'facebook').maybeSingle();
        if (existing?.content_id) {
          // Bai da co, chi insert metric neu chua co (fix cho run lan truoc thieu metric_date).
          const { data: exMetric } = await client.from('mkt_metrics')
            .select('id').eq('source', 'facebook').eq('entity_ref', existing.content_id).limit(1).maybeSingle();
          if (exMetric) { skipped++; continue; }
          const backfillMetrics = {
            reactions: p.reactions?.summary?.total_count || 0,
            comments: p.comments?.summary?.total_count || 0,
            shares: p.shares?.count || 0,
            views: 0
          };
          const { error: eBM } = await client.from('mkt_metrics').insert({
            source: 'facebook', entity_ref: existing.content_id, metrics: backfillMetrics,
            metric_date: new Date().toISOString().slice(0, 10),
            created_at: new Date().toISOString()
          });
          if (eBM) errors.push(`backfill metric ${p.id}: ${eBM.message}`);
          added++;
          continue;
        }
        const message = String(p.message || '').trim();
        const title = message.slice(0, 100) || `Bài FB ${p.id}`;
        const contentId = randomUUID();
        const publishedAt = p.created_time || new Date().toISOString();
        const { error: eC } = await client.from('mkt_content').insert({
          id: contentId, kind: 'social', title, draft: message, status: 'published',
          brief: { source: 'reimport_facebook', fb_post_id: p.id }, created_at: publishedAt
        });
        if (eC) { errors.push(`content ${p.id}: ${eC.message}`); continue; }
        const { error: eP } = await client.from('mkt_posts').insert({
          content_id: contentId, channel: 'facebook', status: 'published',
          published_at: publishedAt, external_url: permalink
        });
        if (eP) errors.push(`post ${p.id}: ${eP.message}`);
        const metrics = {
          reactions: p.reactions?.summary?.total_count || 0,
          comments: p.comments?.summary?.total_count || 0,
          shares: p.shares?.count || 0,
          views: 0
        };
        const { error: eM } = await client.from('mkt_metrics').insert({
          source: 'facebook', entity_ref: contentId, metrics,
          metric_date: new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString()
        });
        if (eM) errors.push(`metric ${p.id}: ${eM.message}`);
        added++;
      } catch (e: any) { errors.push(`FB ${p.id}: ${e?.message || e}`); }
    }
    url = j.paging?.next || null;
  }
  return { added, skipped, errors: errors.slice(0, 8) };
}

async function importYouTube(client: any, sinceIso: string): Promise<{ added: number; skipped: number; errors: string[] }> {
  let token: string;
  try { token = await getYouTubeAccessToken(); }
  catch (e: any) { return { added: 0, skipped: 0, errors: [String(e?.message || e)] }; }
  const auth = { Authorization: `Bearer ${token}` };
  const chR = await fetch('https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: auth });
  const ch: any = await chR.json();
  const uploadsId = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return { added: 0, skipped: 0, errors: ['YT: không tìm được uploads playlist.'] };
  let added = 0, skipped = 0;
  const errors: string[] = [];
  let pageToken = '';
  const sinceMs = new Date(sinceIso).getTime();
  let pages = 0;
  outer: while (pages++ < 10) {
    const plR = await fetch(`https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: auth });
    const pl: any = await plR.json();
    const items = pl.items || [];
    const videoIds = items.map((i: any) => i.contentDetails?.videoId).filter(Boolean);
    if (!videoIds.length) break;
    const statsR = await fetch(`https://youtube.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}`, { headers: auth });
    const stats: any = await statsR.json();
    const byId = new Map<string, any>((stats.items || []).map((v: any) => [v.id, v]));
    for (const it of items) {
      const vid = it.contentDetails?.videoId;
      const v = byId.get(vid);
      if (!v) continue;
      const publishedAt = v.snippet?.publishedAt || it.snippet?.publishedAt;
      if (publishedAt && new Date(publishedAt).getTime() < sinceMs) break outer;
      const url = `https://www.youtube.com/watch?v=${vid}`;
      const { data: existing } = await client.from('mkt_posts')
        .select('id, content_id').eq('external_url', url).eq('channel', 'youtube').maybeSingle();
      if (existing?.content_id) {
        const { data: exMetric } = await client.from('mkt_metrics')
          .select('id').eq('source', 'youtube').eq('entity_ref', existing.content_id).limit(1).maybeSingle();
        if (exMetric) { skipped++; continue; }
        const backfillMetrics = {
          views: Number(v.statistics?.viewCount || 0),
          reactions: Number(v.statistics?.likeCount || 0),
          comments: Number(v.statistics?.commentCount || 0),
          shares: 0
        };
        const { error: eBM } = await client.from('mkt_metrics').insert({
          source: 'youtube', entity_ref: existing.content_id, metrics: backfillMetrics,
          metric_date: new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString()
        });
        if (eBM) errors.push(`backfill metric ${vid}: ${eBM.message}`);
        added++;
        continue;
      }
      const title = String(v.snippet?.title || '').slice(0, 100) || `Video YT ${vid}`;
      const contentId = randomUUID();
      const { error: eC } = await client.from('mkt_content').insert({
        id: contentId, kind: 'video', title,
        draft: String(v.snippet?.description || '').slice(0, 1000), status: 'published',
        brief: { source: 'reimport_youtube', yt_video_id: vid }, created_at: publishedAt || new Date().toISOString()
      });
      if (eC) { errors.push(`content ${vid}: ${eC.message}`); continue; }
      const { error: eP } = await client.from('mkt_posts').insert({
        content_id: contentId, channel: 'youtube', status: 'published',
        published_at: publishedAt || new Date().toISOString(), external_url: url
      });
      if (eP) errors.push(`post ${vid}: ${eP.message}`);
      const metrics = {
        views: Number(v.statistics?.viewCount || 0),
        reactions: Number(v.statistics?.likeCount || 0),
        comments: Number(v.statistics?.commentCount || 0),
        shares: 0
      };
      const { error: eM } = await client.from('mkt_metrics').insert({
        source: 'youtube', entity_ref: contentId, metrics,
        metric_date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString()
      });
      if (eM) errors.push(`metric ${vid}: ${eM.message}`);
      added++;
    }
    pageToken = pl.nextPageToken || '';
    if (!pageToken) break;
  }
  return { added, skipped, errors: errors.slice(0, 8) };
}
