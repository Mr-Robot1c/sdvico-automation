import { NextResponse } from 'next/server';

// Subscribe TỪNG PAGE vào app webhook (24/8, user: "đã cmt và ib nhưng không thấy lead").
// Nguyên nhân: subscribe field 'feed'/'messages' ở Dashboard chỉ nói "app quan tâm field
// này" — CHƯA đủ. Mỗi Page riêng biệt phải gọi API `POST /{page-id}/subscribed_apps` với
// page access token để đăng ký page đó GỬI event tới webhook. Facebook Dashboard KHÔNG có
// UI cho bước này (phải gọi Graph API), rất hay bị miss.
//
// Route này gọi bước đó cho: FACEBOOK_PAGE_ID (dùng FACEBOOK_PAGE_ACCESS_TOKEN) và nếu có,
// FACEBOOK_REAL_PAGE_ID (dùng FACEBOOK_REAL_PAGE_ACCESS_TOKEN). Bảo vệ CRON_SECRET.
//
// Dùng: /api/facebook/subscribe-page?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

const V = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const FIELDS = 'feed,messages';

async function subscribeOne(pageId: string, token: string): Promise<{ ok: boolean; page_id: string; response: any }> {
  try {
    const r = await fetch(`https://graph.facebook.com/${V}/${pageId}/subscribed_apps?subscribed_fields=${encodeURIComponent(FIELDS)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const j: any = await r.json();
    return { ok: r.ok && j?.success !== false, page_id: pageId, response: j };
  } catch (e: any) {
    return { ok: false, page_id: pageId, response: { error: String(e?.message || e) } };
  }
}

async function listOne(pageId: string, token: string): Promise<{ page_id: string; subscribed_apps: any }> {
  try {
    const r = await fetch(`https://graph.facebook.com/${V}/${pageId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j: any = await r.json();
    return { page_id: pageId, subscribed_apps: j };
  } catch (e: any) {
    return { page_id: pageId, subscribed_apps: { error: String(e?.message || e) } };
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
  if (!pages.length) return NextResponse.json({ ok: false, error: 'Thieu FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN (va/hoac REAL) tren Vercel env' });

  const subscribed = await Promise.all(pages.map((p) => subscribeOne(p.id, p.token).then((r) => ({ label: p.label, ...r }))));
  const current = await Promise.all(pages.map((p) => listOne(p.id, p.token).then((r) => ({ label: p.label, ...r }))));

  return NextResponse.json({
    ok: subscribed.every((s) => s.ok),
    fields_requested: FIELDS,
    subscribed,
    current_subscriptions: current,
    note: 'Neu ok=true, tu gio moi comment/inbox trong 2 Page nay se ban webhook toi /api/facebook/webhook. Chi can chay 1 lan (Facebook luu subscription mai).',
  });
}
