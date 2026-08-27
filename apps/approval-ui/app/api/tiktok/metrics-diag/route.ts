import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';

// Diag route: cho user hiểu chính xác vì sao /do-luong TikTok trống dù bấm Cập nhật.
// Dump: mkt_content nào có brief.tiktok_video_id + mkt_metrics source='tiktok' gần nhất
// + video list gọi Display API. So sánh để biết bước nào fail.
//
// /api/tiktok/metrics-diag?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = getServerClient();

  // 1. Bài có brief.tiktok_video_id (user đã ghép qua UI).
  const { data: contentRows } = await client
    .from('mkt_content')
    .select('id, title, brief')
    .gte('created_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
    .limit(500);
  const linked = (contentRows || [])
    .filter((c: any) => c.brief?.tiktok_video_id)
    .map((c: any) => ({
      content_id: c.id,
      title: (c.title || '').slice(0, 80),
      tiktok_video_id: c.brief.tiktok_video_id,
      tiktok_share_url: c.brief.tiktok_share_url || null,
    }));

  // 2. mkt_metrics source='tiktok' gần nhất (10 row).
  const { data: metricsRows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'tiktok')
    .order('created_at', { ascending: false })
    .limit(10);

  // 3. Video list từ Display API để so.
  let videos: any[] = [];
  let apiError: string | null = null;
  try {
    const { getTikTokRecentVideos } = await import('../../../../lib/tiktok-metrics');
    const r = await (getTikTokRecentVideos as any)(client);
    videos = r.videos || [];
    apiError = r.error || null;
  } catch (e: any) {
    apiError = String(e?.message || e).slice(0, 200);
  }

  // 4. Match check
  const linkedVideoIds = new Set(linked.map((l) => l.tiktok_video_id));
  const profileVideoIds = new Set(videos.map((v) => v.id));
  const linkedFoundOnProfile = linked.filter((l) => profileVideoIds.has(l.tiktok_video_id));
  const linkedNotOnProfile = linked.filter((l) => !profileVideoIds.has(l.tiktok_video_id));

  // 5. run_log gần nhất
  const { data: runLogs } = await client
    .from('run_log')
    .select('task, status, detail, created_at')
    .in('task', ['mkt.metrics_pull', 'mkt.metrics_pull_manual'])
    .order('created_at', { ascending: false })
    .limit(5);

  return NextResponse.json({
    ok: true,
    api_error: apiError,
    stats: {
      linked_content_count: linked.length,
      tiktok_metrics_row_count: metricsRows?.length || 0,
      profile_video_count: videos.length,
      linked_found_on_profile: linkedFoundOnProfile.length,
      linked_not_on_profile: linkedNotOnProfile.length,
    },
    diagnosis: linked.length === 0
      ? '❌ CHƯA CÓ bài nào có brief.tiktok_video_id. User chưa ghép qua UI hoặc save fail.'
      : videos.length === 0
      ? `❌ TikTok Display API không trả video (${apiError || 'unknown'}). Kiểm tra scope video.list.`
      : linkedFoundOnProfile.length === 0
      ? '❌ Video user ghép KHÔNG có trong 20 video gần nhất profile - có thể video đã cũ (>20 video mới hơn) hoặc video_id sai.'
      : metricsRows?.length === 0
      ? '⚠️ Có link + có video khớp nhưng CHƯA có snapshot mkt_metrics. Bấm "Cập nhật số liệu" trên /do-luong (chạy pullTikTokMetrics).'
      : '✅ Có link + video khớp + có metrics. Kiểm tra /do-luong xem TikTok section hiện không.',
    linked_content: linked,
    linked_found_on_profile: linkedFoundOnProfile.map((l) => ({ ...l, video: videos.find((v) => v.id === l.tiktok_video_id) })),
    linked_not_on_profile: linkedNotOnProfile,
    recent_tiktok_metrics: (metricsRows || []).map((m: any) => ({
      entity_ref: m.entity_ref,
      metrics: m.metrics,
      created_at: m.created_at,
    })),
    profile_videos_sample: videos.slice(0, 5).map((v) => ({ id: v.id, title: (v.title || '').slice(0, 60), view_count: v.view_count, create_time: v.create_time })),
    recent_pull_logs: runLogs || [],
  });
}
