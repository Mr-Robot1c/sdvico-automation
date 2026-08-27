import { NextResponse } from 'next/server';

// Route diag check scope Page Access Token (user 27/8: "sao t nhớ page_token được").
// Server đọc token từ env FACEBOOK_PAGE_ACCESS_TOKEN + FACEBOOK_REAL_PAGE_ACCESS_TOKEN,
// gọi /me/permissions Graph API rồi trả về danh sách scope + đánh dấu 5 scope quan trọng
// (pages_read_engagement, read_insights, pages_messaging, pages_manage_metadata, pages_show_list).
//
// Không lộ token, chỉ hiện tên/scope. Bảo vệ ?secret=CRON_SECRET.
//
// Dùng: /api/facebook/token-scope?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

const V = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

// 5 scope quan trọng cho SDVICO (đọc bài + reactions + inbox + subscribe webhook + insights).
const REQUIRED_SCOPES = [
  { name: 'pages_read_engagement', purpose: 'Đọc reactions, comments, shares' },
  { name: 'read_insights', purpose: 'Đọc Lượt xem (impressions/media_view) — cột "Lượt xem" trong Đo lường' },
  { name: 'pages_messaging', purpose: 'Đọc Messenger inbox (chờ App Review Facebook)' },
  { name: 'pages_manage_metadata', purpose: 'Subscribe webhook nhận comment/tin nhắn' },
  { name: 'pages_show_list', purpose: 'List Pages user manage' },
];

async function inspectOne(pageId: string, token: string, label: string) {
  try {
    // 1. Kiểm tra token còn hoạt động — call /me trả về id + name.
    const meRes = await fetch(`https://graph.facebook.com/${V}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me: any = await meRes.json();
    if (me.error) return { label, page_id_env: pageId, error: `token loi: ${me.error?.message || 'unknown'}`, likely_expired: true };

    // 2. Lấy permissions granted.
    const permRes = await fetch(`https://graph.facebook.com/${V}/me/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const perm: any = await permRes.json();
    const permData: any[] = Array.isArray(perm?.data) ? perm.data : [];
    const grantedSet = new Set(permData.filter((p) => p.status === 'granted').map((p) => p.permission));
    const declinedSet = new Set(permData.filter((p) => p.status === 'declined').map((p) => p.permission));

    const required = REQUIRED_SCOPES.map((s) => ({
      scope: s.name,
      granted: grantedSet.has(s.name),
      declined: declinedSet.has(s.name),
      purpose: s.purpose,
    }));

    const missing = required.filter((s) => !s.granted).map((s) => s.scope);

    return {
      label,
      page_name: me.name,
      page_id_actual: me.id,
      page_id_env: pageId,
      page_id_matches: me.id === pageId,
      required_scopes: required,
      all_granted_scopes: [...grantedSet],
      missing_required: missing,
      diagnosis: missing.length
        ? `THIẾU ${missing.length} scope: ${missing.join(', ')}. Cột "Lượt xem" trong Đo lường sẽ trống nếu thiếu read_insights. Comment webhook thiếu pages_read_engagement + pages_manage_metadata. Inbox thiếu pages_messaging (cần App Review).`
        : 'Token có ĐỦ 5 scope quan trọng, ổn cho SDVICO.',
    };
  } catch (e: any) {
    return { label, page_id_env: pageId, error: 'exception: ' + String(e?.message || e) };
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pages: Array<{ id: string; token: string; label: string }> = [];
  if (process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    pages.push({ id: process.env.FACEBOOK_PAGE_ID!, token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN!, label: 'page_test' });
  }
  if (process.env.FACEBOOK_REAL_PAGE_ID && process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN) {
    pages.push({ id: process.env.FACEBOOK_REAL_PAGE_ID!, token: process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN!, label: 'page_real' });
  }
  if (!pages.length) return NextResponse.json({ ok: false, error: 'Thieu env FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN' });

  const results = await Promise.all(pages.map((p) => inspectOne(p.id, p.token, p.label)));

  return NextResponse.json({
    ok: true,
    note: 'Xem cot "missing_required" - neu co scope nao thi phai regen token voi scope day du.',
    how_to_regen: [
      '1. Vao https://developers.facebook.com/tools/explorer',
      '2. Ben phai chon App = SDVICO Marketing',
      '3. Bam "Get Token" -> "Get Page Access Token" -> chon Page SDVICO',
      '4. Tick 5 scope: pages_read_engagement, read_insights, pages_manage_metadata, pages_show_list, pages_messaging',
      '5. Copy Access Token dai (~200 ky tu)',
      '6. Vercel Dashboard -> Settings -> Environment Variables -> Edit FACEBOOK_PAGE_ACCESS_TOKEN -> Save',
      '7. Redeploy lai project (bam nut Redeploy). Sau do chay lai URL nay xem missing_required rong chua.',
    ],
    pages: results,
  });
}
