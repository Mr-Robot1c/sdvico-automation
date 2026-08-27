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

// Test THỰC TẾ 1 endpoint - nếu 200 hoặc lỗi không phải permission => có quyền. Facebook Page
// Token không trả scope qua /me/permissions nên phải call thẳng endpoint đòi quyền đó xem có bị
// reject vì permission không. Code 200 nghĩa là quyền OK. 403/OAuth error nghĩa là thiếu.
async function probe(url: string, token: string): Promise<{ ok: boolean; status: number; error?: string; sample?: any }> {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j: any = await r.json();
    if (r.ok && !j.error) return { ok: true, status: r.status, sample: j };
    // FB Graph error - fbtrace phân biệt: type=OAuthException + code 200/104/190 = auth/scope,
    // các code khác = lỗi khác (rate limit, invalid arg...). Chỉ coi là "thiếu quyền" khi code auth.
    const code = j.error?.code;
    const isPermError = j.error?.type === 'OAuthException' || code === 200 || code === 104 || code === 190;
    return { ok: false, status: r.status, error: (j.error?.message || `HTTP ${r.status}`).slice(0, 200), sample: isPermError ? undefined : { code, type: j.error?.type } };
  } catch (e: any) {
    return { ok: false, status: 0, error: String(e?.message || e).slice(0, 200) };
  }
}

async function inspectOne(pageId: string, token: string, label: string) {
  try {
    // 1. Kiểm tra token còn hoạt động.
    const meRes = await fetch(`https://graph.facebook.com/${V}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me: any = await meRes.json();
    if (me.error) return { label, page_id_env: pageId, error: `token loi: ${me.error?.message || 'unknown'}`, likely_expired: true };

    // 2. Vẫn thử /me/permissions nhưng CHỈ để log — Page Token thường trả rỗng.
    const permRes = await fetch(`https://graph.facebook.com/${V}/me/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const perm: any = await permRes.json();
    const permData: any[] = Array.isArray(perm?.data) ? perm.data : [];
    const grantedFromPermsApi = new Set(permData.filter((p) => p.status === 'granted').map((p) => p.permission));

    // 3. TEST THỰC TẾ — gọi endpoint đòi từng scope. Đây mới là câu trả lời đúng.
    // Chỉ lấy 1 post gần nhất để đo (không tốn nhiều token).
    const [postsProbe, insightsProbe, subscribedProbe, msgProbe] = await Promise.all([
      // pages_read_engagement: đọc post/reactions của page
      probe(`https://graph.facebook.com/${V}/${pageId}/posts?limit=1&fields=id,reactions.summary(true)`, token),
      // read_insights: đọc insights bài. Lấy 1 post trước rồi gọi /post_id/insights.
      // Update 27/8: dùng metric v26 mới (post_impressions_organic + post_impressions_paid).
      // Cả 2 metric cũ (post_impressions, post_media_view) đã bị Meta bỏ 15/6/2026.
      (async () => {
        const p = await probe(`https://graph.facebook.com/${V}/${pageId}/posts?limit=1&fields=id`, token);
        if (!p.ok || !p.sample?.data?.[0]?.id) return { ok: false, status: 0, error: 'khong co bai de test insights' };
        const postId = p.sample.data[0].id;
        return probe(`https://graph.facebook.com/${V}/${postId}/insights?metric=post_impressions_organic,post_impressions_paid`, token);
      })(),
      // pages_manage_metadata: list subscribed apps
      probe(`https://graph.facebook.com/${V}/${pageId}/subscribed_apps`, token),
      // pages_messaging: list conversations (không cần trả data, chỉ cần không bị reject scope)
      probe(`https://graph.facebook.com/${V}/${pageId}/conversations?limit=1`, token),
    ]);

    const realCheck = [
      { scope: 'pages_read_engagement', probe_result: postsProbe, likely_granted: postsProbe.ok, purpose: 'Đọc reactions/comments/shares' },
      { scope: 'read_insights', probe_result: insightsProbe, likely_granted: insightsProbe.ok, purpose: 'Đọc Lượt xem (impressions/media_view) cho cột "Lượt xem" Đo lường' },
      { scope: 'pages_manage_metadata', probe_result: subscribedProbe, likely_granted: subscribedProbe.ok, purpose: 'Subscribe webhook nhận comment' },
      { scope: 'pages_messaging', probe_result: msgProbe, likely_granted: msgProbe.ok, purpose: 'Đọc Messenger inbox (chờ App Review)' },
    ];
    const missing = realCheck.filter((s) => !s.likely_granted).map((s) => s.scope);

    return {
      label,
      page_name: me.name,
      page_id_actual: me.id,
      page_id_env: pageId,
      page_id_matches: me.id === pageId,
      real_probe: realCheck,
      missing_from_probe: missing,
      me_permissions_api_returned: [...grantedFromPermsApi],
      me_permissions_note: permData.length === 0 ? 'Page Token khong tra scope qua /me/permissions - dung real_probe o tren de biet chinh xac' : undefined,
      diagnosis: missing.length === 0
        ? '✓ Token co du quyen cho SDVICO (probe truc tiep het OK).'
        : `Probe truc tiep tra loi khi goi ${missing.join(', ')}. ${missing.includes('read_insights') ? 'Con Luot xem trong Do luong se trong.' : ''} ${missing.includes('pages_messaging') ? 'Inbox chua doc duoc (can App Review).' : ''} Xem "real_probe[i].probe_result.error" de biet ly do chinh xac (loi permission hay khac).`,
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
