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

  // 3) Soi 1 object cu the (?object=<id>) - Reel/Post - de kiem tai sao bat ky ai KHONG thay
  //    (privacy, status, published, embeddable, restrictions). Chi doc.
  let object: any = null;
  const oid = (url.searchParams.get('object') || '').replace(/[^0-9]/g, '');
  if (TOKEN && oid) {
    try {
      const fields = 'id,description,title,length,created_time,updated_time,privacy,status,published,embeddable,permalink_url,live_status,picture,content_category,universal_video_id,is_reference_only,is_crossposting_eligible,is_instagram_eligible,no_story,post_id,event';
      const or = await fetch(`https://graph.facebook.com/${VERSION}/${oid}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(TOKEN)}`);
      object = await or.json();
    } catch (e: any) {
      object = { error: String(e?.message || e) };
    }
  }

  if (error) return NextResponse.json({ ok: false, tokenCheck, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tokenCheck, object, count: data?.length || 0, logs: data || [] });
}
