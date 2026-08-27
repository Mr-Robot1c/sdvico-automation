import { NextResponse } from 'next/server';

// Debug endpoint: xac dinh Page nao dang duoc phuc vu boi token trong env. Goi /me voi
// FACEBOOK_PAGE_ACCESS_TOKEN -> Facebook tra {id, name} cua Page ma token thuoc ve.
// Neu id KHONG khop FACEBOOK_PAGE_ID trong env -> subscribe sai Page -> webhook khong ban.
// Dung: /api/facebook/page-info?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

const V = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

async function pageInfo(token: string): Promise<any> {
  try {
    const r = await fetch(`https://graph.facebook.com/${V}/me?fields=id,name,fan_count,followers_count,link`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return await r.json();
  } catch (e: any) {
    return { error: String(e?.message || e) };
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const envPageId = process.env.FACEBOOK_PAGE_ID || null;
  const envRealPageId = process.env.FACEBOOK_REAL_PAGE_ID || null;
  const results: any[] = [];

  if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    const info = await pageInfo(process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
    const matches = info?.id && envPageId ? info.id === envPageId : null;
    results.push({ env_slot: 'FACEBOOK_PAGE_ID', env_value: envPageId, page_from_token: info, matches });
  }
  if (process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN) {
    const info = await pageInfo(process.env.FACEBOOK_REAL_PAGE_ACCESS_TOKEN);
    const matches = info?.id && envRealPageId ? info.id === envRealPageId : null;
    results.push({ env_slot: 'FACEBOOK_REAL_PAGE_ID', env_value: envRealPageId, page_from_token: info, matches });
  }

  return NextResponse.json({
    ok: results.length > 0 && results.every((r) => r.matches !== false),
    results,
    diagnosis: results.some((r) => r.matches === false)
      ? 'Env Page ID KHONG khop Page thuc te cua token. Cap nhat env FACEBOOK_PAGE_ID = id trong page_from_token.id roi Redeploy + chay lai subscribe-page.'
      : results.every((r) => r.matches === true)
        ? 'Env Page ID DUNG. Neu webhook van khong nhan comment, van de o cho khac (Dev Mode, filter, hoac Page chua Boost va app chua Publish).'
        : 'Khong the xac dinh.',
  });
}
