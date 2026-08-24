import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { getValidTikTokToken } from '../../../lib/tiktok';
import { pullTikTokMetrics } from '../../../lib/tiktok-metrics';

// Soi tại sao /do-luong chưa có bảng TikTok. Bảo vệ bằng CRON_SECRET.
// Dùng: /api/tt-diag?secret=<CRON_SECRET>
//   - Xem token TikTok đang lưu (scope, hết hạn khi nào) — KHÔNG lộ token.
//   - Số dòng mkt_metrics source='tiktok'; snapshot mới nhất (nếu có).
//   - 5 dòng run_log mkt.metrics_pull gần nhất (chỉ trích ttPulled/ttMatched/ttErrors).
//   - 5 bài mkt_posts channel='tiktok' status='published' gần nhất (để soi khớp thời gian).
//   - Gọi thẳng /v2/video/list/ 30 video xem TikTok trả gì.
// Thêm ?run=1 để ép chạy pullTikTokMetrics ngay và trả kết quả (không cần đợi cron 30 phút).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const client = getServerClient();
  const out: any = {};

  // 1. Token TikTok đang lưu (mkt_oauth_tokens provider='tiktok').
  const { data: connRow } = await client
    .from('mkt_oauth_tokens')
    .select('open_id, scope, expires_at, refresh_expires_at, updated_at')
    .eq('provider', 'tiktok')
    .maybeSingle();
  const conn = connRow as any;
  out.connection = conn
    ? {
        openId: conn.open_id,
        scope: conn.scope,
        hasVideoList: typeof conn.scope === 'string' && conn.scope.includes('video.list'),
        accessExpiresAt: conn.expires_at,
        refreshExpiresAt: conn.refresh_expires_at,
        updatedAt: conn.updated_at,
      }
    : { error: 'chua co ban ghi mkt_oauth_tokens provider=tiktok — chua ket noi hoac reconnect' };

  // 2. mkt_metrics source='tiktok'.
  const { count: ttCount } = await client
    .from('mkt_metrics')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'tiktok');
  const { data: ttLatest } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'tiktok')
    .order('created_at', { ascending: false })
    .limit(3);
  out.metrics = { totalRows: ttCount || 0, latest: ttLatest || [] };

  // 3. Run log 5 lần cron gần nhất — chỉ trích phần TikTok.
  const { data: logs } = await client
    .from('run_log')
    .select('status, detail, created_at')
    .eq('task', 'mkt.metrics_pull')
    .order('created_at', { ascending: false })
    .limit(5);
  out.recentCronRuns = (logs || []).map((r: any) => ({
    at: r.created_at,
    status: r.status,
    ttPulled: r.detail?.ttPulled ?? null,
    ttMatched: r.detail?.ttMatched ?? null,
    ttErrors: r.detail?.ttErrors ?? [],
  }));

  // 4. mkt_posts channel='tiktok' status='published' gần nhất.
  const { data: posts } = await client
    .from('mkt_posts')
    .select('content_id, external_url, published_at')
    .eq('channel', 'tiktok')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(10);
  out.recentTikTokPosts = posts || [];

  // 5. Gọi /v2/video/list/ live xem TikTok trả gì (nguyên nhân hay gặp: token thiếu scope,
  //    hoặc tài khoản chưa nằm trong Target Users sandbox nên trả rỗng/lỗi).
  try {
    const { accessToken } = await getValidTikTokToken(client);
    const r = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count,like_count,comment_count,share_count,title,share_url',
      { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 30 }) }
    );
    const j: any = await r.json();
    const videos = j?.data?.videos || [];
    out.videoListLive = {
      httpStatus: r.status,
      apiError: j?.error && j.error.code !== 'ok' ? j.error : null,
      videoCount: videos.length,
      videos: videos.slice(0, 5).map((v: any) => ({
        id: v.id,
        createTime: v.create_time,
        createTimeIso: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
        views: v.view_count,
        likes: v.like_count,
        title: (v.title || '').slice(0, 60),
        shareUrl: v.share_url,
      })),
    };
  } catch (e: any) {
    out.videoListLive = { error: String(e?.message || e) };
  }

  // 6. ?run=1 — ép chạy pullTikTokMetrics ngay, trả kết quả để so.
  if (url.searchParams.get('run') === '1') {
    try {
      out.forcedRun = await pullTikTokMetrics(client);
    } catch (e: any) {
      out.forcedRun = { error: String(e?.message || e) };
    }
  }

  return NextResponse.json({ ok: true, ...out });
}
