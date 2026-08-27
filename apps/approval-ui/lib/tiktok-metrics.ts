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

// 27/8 (user "khong keo so lieu tiktok"): user bo TikTok API 26/8, dung ExportTiktokButton
// (tai video + copy caption + mo tab TikTok Upload dang tay). Thoi diem dang thuc te tren
// TikTok co the lech RAT NHIEU voi published_at trong mkt_posts (user tai xuong luc A, dang
// tay luc B). Noi 10 phut -> 6 tieng de bat duoc phan lon truong hop nay.
const MATCH_WINDOW_SEC = 6 * 60 * 60; // ±6 giờ

export async function pullTikTokMetrics(client: Client): Promise<{ pulled: number; matched: number; errors: string[] }> {
  const errors: string[] = [];
  let accessToken: string;
  try {
    const t = await getValidTikTokToken(client);
    accessToken = t.accessToken;
  } catch (e: any) {
    return { pulled: 0, matched: 0, errors: ['token: ' + String(e?.message || e)] };
  }

  // 1. Danh sách video mới nhất trên TikTok (20 cái đầu — TikTok giới hạn max_count 1..20,
  //    truyền 30 se 400 invalid_params). share_url = link mở video công khai.
  let videos: Array<{ id: string; create_time: number; view_count: number; like_count: number; comment_count: number; share_count: number; title?: string; share_url?: string }> = [];
  try {
    const r = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count,like_count,comment_count,share_count,title,share_url',
      { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 20 }) }
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

  // 2a. Ưu tiên MATCH TAY (27/8): brief.tiktok_video_id user chọn qua UI /noi-dung. Match
  //     kiểu này CHÍNH XÁC, không lệch thời gian.
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data: manualMatchRows } = await client
    .from('mkt_content')
    .select('id, brief')
    .not('brief->>tiktok_video_id', 'is', null)
    .gte('created_at', since);
  const manualMap = new Map<string, string>(); // videoId -> contentId
  for (const c of manualMatchRows || []) {
    const brief = (c as any).brief || {};
    const vid = String(brief.tiktok_video_id || '');
    if (vid) manualMap.set(vid, String((c as any).id));
  }

  // 2b. Bài TikTok đã đăng gần nhất trong hệ thống (30 ngày) — cho MATCH BY TIME fallback.
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: postRows } = await client
    .from('mkt_posts')
    .select('content_id, external_url, published_at')
    .eq('channel', 'tiktok')
    .eq('status', 'published')
    .gte('published_at', since30)
    .order('published_at', { ascending: false })
    .limit(60);
  const posts = (postRows || []).filter((p: any) => p.content_id && p.published_at);

  // 3. Khớp video ↔ content_id: ưu tiên manual map, fallback time-match.
  const matched: Array<{ contentId: string; video: typeof videos[number]; deltaSec: number; via: 'manual' | 'time' }> = [];
  const usedVideos = new Set<string>();

  for (const v of videos) {
    const manualCid = manualMap.get(v.id);
    if (manualCid) {
      matched.push({ contentId: manualCid, video: v, deltaSec: 0, via: 'manual' });
      usedVideos.add(v.id);
    }
  }

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
      matched.push({ contentId: p.content_id, video: best.video, deltaSec: best.delta, via: 'time' });
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
      shareUrl: video.share_url || null,
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

// User 27/8: bỏ TikTok API 26/8 dùng ExportTiktokButton -> match by time không đủ (video đăng
// tay lệch giờ). Thêm cơ chế MATCH TAY: user chọn video TikTok tương ứng với bài trong UI,
// lưu vào mkt_content.brief.tiktok_video_id. Hàm này pull video profile để user chọn.
export type TikTokVideo = {
  id: string;
  create_time: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  title?: string;
  share_url?: string;
};

export async function getTikTokRecentVideos(client: Client): Promise<{ videos: TikTokVideo[]; error?: string }> {
  let accessToken: string;
  try {
    const t = await getValidTikTokToken(client);
    accessToken = t.accessToken;
  } catch (e: any) {
    return { videos: [], error: 'token: ' + String(e?.message || e) };
  }
  try {
    const r = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count,like_count,comment_count,share_count,title,share_url',
      { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 20 }) }
    );
    const j: any = await r.json();
    if (!r.ok) return { videos: [], error: 'video/list: HTTP ' + r.status };
    return { videos: j.data?.videos || [] };
  } catch (e: any) {
    return { videos: [], error: 'fetch: ' + String(e?.message || e) };
  }
}
