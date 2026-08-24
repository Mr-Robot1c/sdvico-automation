// lib/tiktok-metrics.ts — kéo view/like/comment/share TikTok về mkt_metrics.
//
// TikTok /v2/video/list/ trả các video công khai của user (cần scope video.list). Chỉ dùng
// được cho tài khoản đã ADD vào Target Users của sandbox (SDVICO đã bật 24/8).
//
// KHỚP với mkt_posts: TikTok Direct Post trả `publish_id` (v_pub_file~v2-...), không phải
// `video_id` thật; nên external_url ở mkt_posts (dạng `tiktok:<publish_id>`) không match
// trực tiếp với id trả về ở /video/list/. Khớp bằng THỜI GIAN: tìm mkt_posts channel=tiktok
// có published_at gần create_time của video ± 10 phút, gán content_id đó.
//
// Nếu vẫn khớp không được (video đăng qua kênh khác), bỏ qua. Không gây lỗi.

import type { getServerClient } from './supabase-server';
import { getValidTikTokToken } from './tiktok';

type Client = ReturnType<typeof getServerClient>;

const MATCH_WINDOW_SEC = 10 * 60; // ±10 phút

export async function pullTikTokMetrics(client: Client): Promise<{ pulled: number; matched: number; errors: string[] }> {
  const errors: string[] = [];
  let accessToken: string;
  try {
    const t = await getValidTikTokToken(client);
    accessToken = t.accessToken;
  } catch (e: any) {
    return { pulled: 0, matched: 0, errors: ['token: ' + String(e?.message || e)] };
  }

  // 1. Danh sách video mới nhất trên TikTok (30 cái đầu, đủ 1-2 tuần đăng).
  let videos: Array<{ id: string; create_time: number; view_count: number; like_count: number; comment_count: number; share_count: number; title?: string }> = [];
  try {
    const r = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count,like_count,comment_count,share_count,title',
      { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 30 }) }
    );
    const j: any = await r.json();
    if (!r.ok || j.error?.code && j.error.code !== 'ok') {
      errors.push('video/list: ' + JSON.stringify(j.error || { status: r.status }).slice(0, 300));
      return { pulled: 0, matched: 0, errors };
    }
    videos = j.data?.videos || [];
  } catch (e: any) {
    errors.push('fetch video/list: ' + String(e?.message || e));
    return { pulled: 0, matched: 0, errors };
  }
  if (!videos.length) return { pulled: 0, matched: 0, errors };

  // 2. Bài TikTok đã đăng gần nhất trong hệ thống (30 ngày, thừa cửa sổ khớp).
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: postRows } = await client
    .from('mkt_posts')
    .select('content_id, external_url, published_at')
    .eq('channel', 'tiktok')
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(60);
  const posts = (postRows || []).filter((p: any) => p.content_id && p.published_at);
  if (!posts.length) return { pulled: 0, matched: 0, errors };

  // 3. Khớp video ↔ post theo thời gian, giữ cặp lệch ít nhất.
  const matched: Array<{ contentId: string; video: typeof videos[number]; deltaSec: number }> = [];
  const usedVideos = new Set<string>();
  for (const p of posts as any[]) {
    const postTs = Math.floor(new Date(p.published_at).getTime() / 1000);
    let best: { video: typeof videos[number]; delta: number } | null = null;
    for (const v of videos) {
      if (usedVideos.has(v.id)) continue;
      const delta = Math.abs(v.create_time - postTs);
      if (delta > MATCH_WINDOW_SEC) continue;
      if (!best || delta < best.delta) best = { video: v, delta };
    }
    if (best) {
      matched.push({ contentId: p.content_id, video: best.video, deltaSec: best.delta });
      usedVideos.add(best.video.id);
    }
  }
  if (!matched.length) return { pulled: 0, matched: 0, errors };

  // 4. Upsert mkt_metrics (mỗi cặp = 1 snapshot mới; source='tiktok').
  const now = new Date().toISOString();
  const rows = matched.map(({ contentId, video }) => ({
    source: 'tiktok',
    entity_ref: contentId,
    metric_date: now.slice(0, 10),
    metrics: {
      videoId: video.id,
      views: video.view_count || 0,
      reactions: video.like_count || 0,
      comments: video.comment_count || 0,
      shares: video.share_count || 0,
      engagement: (video.like_count || 0) + (video.comment_count || 0) + (video.share_count || 0),
    },
    created_at: now,
  }));
  const { error } = await client.from('mkt_metrics').insert(rows);
  if (error) errors.push('insert: ' + error.message);
  return { pulled: rows.length, matched: matched.length, errors };
}
