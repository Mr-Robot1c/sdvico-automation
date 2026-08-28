import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// Soi lỗi đăng Facebook. Hai phần:
//  1) tokenCheck: token đang cấu hình là USER hay PAGE, có quyền pages_manage_engagement chưa,
//     hết hạn khi nào (expiresAt=0 là vĩnh viễn). KHÔNG trả token ra ngoài, chỉ trả metadata.
//  2) logs: nhật ký thô (run_log) các lần đăng, xem VÌ SAO ảnh không vào bình luận (detail.commentDebug).
// Chỉ đọc, không đăng gì. Bảo vệ bằng CRON_SECRET. Dùng: /api/fb-diag?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  // 1) Kiểm tra token (không lộ token, chỉ trả metadata).
  const tokenCheck: any = { configured: !!TOKEN };
  if (TOKEN) {
    // /me: PAGE token -> trả về Page (name = tên Page); USER token -> trả về người dùng.
    try {
      const meRes = await fetch(`https://graph.facebook.com/${VERSION}/me?fields=id,name,category`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      const me: any = await meRes.json();
      tokenCheck.me = me?.error
        ? { error: me.error?.message }
        : { id: me?.id, name: me?.name, category: me?.category, looksLikePage: !!me?.category };
    } catch (e: any) {
      tokenCheck.me = { error: String(e?.message || e) };
    }
    // debug_token: type (USER/PAGE), scopes (mảng quyền), expires_at (0 = vĩnh viễn).
    try {
      const dbgRes = await fetch(
        `https://graph.facebook.com/${VERSION}/debug_token?input_token=${encodeURIComponent(TOKEN)}`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
      const dbg: any = await dbgRes.json();
      const d = dbg?.data || {};
      tokenCheck.type = d.type || null; // USER hay PAGE
      tokenCheck.expiresAt = typeof d.expires_at === 'number' ? d.expires_at : null; // 0 = không hết hạn
      tokenCheck.isPermanent = d.expires_at === 0;
      tokenCheck.scopes = d.scopes || null;
      tokenCheck.hasManageEngagement = Array.isArray(d.scopes) ? d.scopes.includes('pages_manage_engagement') : null;
      tokenCheck.hasManagePosts = Array.isArray(d.scopes) ? d.scopes.includes('pages_manage_posts') : null;
      if (dbg?.error) tokenCheck.debugError = dbg.error?.message;
    } catch (e: any) {
      tokenCheck.debugError = String(e?.message || e);
    }
  }

  // 2) Nhật ký đăng gần đây.
  const client = getServerClient();
  const { data, error } = await client
    .from('run_log')
    .select('task, status, detail, created_at')
    .in('task', ['mkt.publish_facebook_ui', 'mkt.publish_facebook'])
    .order('created_at', { ascending: false })
    .limit(10);

  // 3) Soi object + insights de tim chi so nao khop UI FB (user 20/8: FB UI 27, app luu 8).
  let object: any = null;
  const oid = (url.searchParams.get('object') || '').replace(/[^0-9]/g, '');
  const scope = url.searchParams.get('scope') || '';
  if (TOKEN && oid) {
    try {
      const fields = 'id,description,title,length,created_time,updated_time,privacy,status,published,embeddable,permalink_url,live_status,picture';
      const or = await fetch(`https://graph.facebook.com/${VERSION}/${oid}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(TOKEN)}`);
      object = await or.json();
      if (scope === 'insights') {
        // Thu tat ca metric quan tam cho video/reel + tren post node "PAGEID_VIDEOID" (video node
        // co pageid trong URL nhung caller can truyen ?post=<pageid>_<videoid>).
        const post = url.searchParams.get('post') || '';
        const metrics = [
          'total_video_views','total_video_impressions','total_video_views_unique',
          'total_video_10s_views','total_video_avg_time_watched','total_video_view_total_time',
          'total_video_complete_views','total_video_reactions_by_type_total',
        ];
        const postMetrics = ['post_video_views','post_video_views_organic','post_video_views_paid',
          'post_media_view','post_impressions','post_impressions_organic','post_impressions_unique',
          'post_video_views_unique','blue_reels_play_count','blue_reels_play_count_60s_v2',
          'post_engaged_users','post_clicks',
        ];
        const insights: any = { video: {}, post: {} };
        for (const m of metrics) {
          try { const r = await (await fetch(`https://graph.facebook.com/${VERSION}/${oid}/video_insights?metric=${m}&access_token=${encodeURIComponent(TOKEN)}`)).json(); insights.video[m] = r?.data?.[0]?.values?.[0]?.value ?? r?.error?.message ?? null; } catch (e: any) { insights.video[m] = String(e?.message||e); }
        }
        if (post) {
          for (const m of postMetrics) {
            try { const r = await (await fetch(`https://graph.facebook.com/${VERSION}/${post}/insights?metric=${m}&access_token=${encodeURIComponent(TOKEN)}`)).json(); insights.post[m] = r?.data?.[0]?.values?.[0]?.value ?? r?.error?.message ?? null; } catch (e: any) { insights.post[m] = String(e?.message||e); }
          }
        }
        object.insights = insights;
      }
    } catch (e: any) {
      object = { error: String(e?.message || e) };
    }
  }

  // 4) 28/8 (vu ghep link reel): kiem token page CHINH + doc thu 1 object bang TUNG token
  //    (?obj_both=<id> — token nao doc duoc thi bai thuoc page do) + liet ke bai moi nhat
  //    tren page chinh (?real_posts=1 — tim bai share/dang lai de lay permalink dung).
  const REAL = process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN;
  const tokenCheckReal: any = { configured: !!REAL };
  if (REAL) {
    try {
      const meRes = await fetch(`https://graph.facebook.com/${VERSION}/me?fields=id,name,category`, { headers: { Authorization: `Bearer ${REAL}` } });
      const me: any = await meRes.json();
      tokenCheckReal.me = me?.error ? { error: me.error?.message } : { id: me?.id, name: me?.name, category: me?.category };
    } catch (e: any) { tokenCheckReal.me = { error: String(e?.message || e) }; }
  }
  const objBoth = (url.searchParams.get('obj_both') || '').replace(/[^0-9_]/g, '');
  let objByToken: any = null;
  if (objBoth) {
    objByToken = {};
    for (const [label, tok] of [['test', TOKEN], ['real', REAL]] as [string, string | undefined][]) {
      if (!tok) { objByToken[label] = { error: 'no token' }; continue; }
      try {
        const r = await fetch(`https://graph.facebook.com/${VERSION}/${objBoth}?fields=id,created_time,permalink_url,from&access_token=${encodeURIComponent(tok)}`);
        objByToken[label] = await r.json();
      } catch (e: any) { objByToken[label] = { error: String(e?.message || e) }; }
    }
  }
  let realPosts: any = null;
  if (url.searchParams.get('real_posts') === '1' && REAL) {
    try {
      const r = await fetch(`https://graph.facebook.com/${VERSION}/me/published_posts?fields=id,created_time,permalink_url,message,attachments{type,url,target}&limit=10&access_token=${encodeURIComponent(REAL)}`);
      realPosts = await r.json();
    } catch (e: any) { realPosts = { error: String(e?.message || e) }; }
  }

  if (error) return NextResponse.json({ ok: false, tokenCheck, tokenCheckReal, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tokenCheck, tokenCheckReal, objByToken, realPosts, object, count: data?.length || 0, logs: data || [] });
}
