// lib/youtube-metrics.ts — kéo số liệu YouTube Shorts về mkt_metrics (user 21/8:
// "đo lường sẽ có thêm số liệu từ youtube shorts").
//
// Nguồn: YouTube Data API v3 videos.list part=statistics (1 unit mỗi lần gọi, quota
// 10.000 đơn vị/ngày — cron 30 phút chỉ tốn ~48/ngày). Ghi cùng quy ước Facebook:
// source='youtube', entity_ref = content_id, mkt_metrics là chuỗi snapshot (chỗ đọc
// tự lấy bản mới nhất). Chưa cấu hình YOUTUBE_* thì trả lỗi mềm, không ném.

import { getServerClient } from './supabase-server';
import { getAccessToken } from './youtube-publish';

type Client = ReturnType<typeof getServerClient>;

function todayVN(): string {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

export async function pullYouTubeMetrics(client: Client): Promise<{ pulled: number; errors: string[] }> {
  const errors: string[] = [];
  const configured = !!(
    (process.env.YOUTUBE_CLIENT_ID || '').trim() &&
    (process.env.YOUTUBE_CLIENT_SECRET || '').trim() &&
    (process.env.YOUTUBE_REFRESH_TOKEN || '').trim()
  );
  if (!configured) return { pulled: 0, errors: ['chưa cấu hình YOUTUBE_*'] };

  const { data: posts } = await client
    .from('mkt_posts')
    .select('content_id, external_url')
    .eq('channel', 'youtube')
    .eq('status', 'published')
    .not('external_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(100);

  // videoId lấy từ external_url dạng https://youtube.com/shorts/<id> (hoặc watch?v=<id>).
  const cidByVideo = new Map<string, string>();
  for (const p of posts || []) {
    const url = String((p as any).external_url || '');
    const m = url.match(/shorts\/([\w-]{6,})/) || url.match(/[?&]v=([\w-]{6,})/);
    const cid = (p as any).content_id as string | null;
    if (m && cid && !cidByVideo.has(m[1])) cidByVideo.set(m[1], cid);
  }
  if (!cidByVideo.size) return { pulled: 0, errors: [] };

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (e: any) {
    return { pulled: 0, errors: [String(e?.message || e)] };
  }

  const ids = [...cidByVideo.keys()];
  const day = todayVN();
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50).join(',');
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const j: any = await r.json();
      if (!r.ok) { errors.push(j?.error?.message || `HTTP ${r.status}`); continue; }
      for (const it of j.items || []) {
        const cid = cidByVideo.get(String(it.id));
        if (!cid) continue;
        const st = it.statistics || {};
        rows.push({
          source: 'youtube',
          entity_ref: cid,
          metric_date: day,
          metrics: {
            views: Number(st.viewCount) || 0,
            reactions: Number(st.likeCount) || 0,
            comments: Number(st.commentCount) || 0,
            engagement: (Number(st.likeCount) || 0) + (Number(st.commentCount) || 0),
            videoId: String(it.id)
          }
        });
      }
    } catch (e: any) {
      errors.push(String(e?.message || e).slice(0, 160));
    }
  }

  if (rows.length) {
    const { error } = await client.from('mkt_metrics').insert(rows);
    if (error) { errors.push(error.message); return { pulled: 0, errors }; }
  }
  return { pulled: rows.length, errors };
}
