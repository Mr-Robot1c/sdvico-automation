import { NextResponse } from 'next/server';
import { isAuthorizedApiRequest } from '../../../lib/session-auth';

// Thu lay ten group qua Graph API. Meta chan Groups API tu 2020 nen hau nhu se fail;
// day la best-effort. Chi doc, khong luu, khong ghi log. Fail -> tra {name: null}.
// Popover ShareGroups fallback dung ID lam nhan, user tu doi ten.
// 29/8 (audit bao mat): route nay la proxy Graph API dung token Page cua SDVICO voi id do
// NGUOI GOI truyen — de mo la nguoi ngoai muon duoc quyen doc cua token cong ty. Doi phien
// dang nhap (popover ShareGroups goi tu browser da dang nhap nen khong anh huong).
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) {
    return NextResponse.json({ name: null, reason: 'can dang nhap' }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!id) return NextResponse.json({ name: null, reason: 'thieu id' });
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!TOKEN) return NextResponse.json({ name: null, reason: 'khong co token' });
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${id}?fields=name&access_token=${encodeURIComponent(TOKEN)}`);
    const j: any = await r.json();
    if (j?.name) return NextResponse.json({ name: String(j.name) });
    return NextResponse.json({ name: null, reason: j?.error?.message || 'khong tra ten' });
  } catch (e: any) {
    return NextResponse.json({ name: null, reason: String(e?.message || e) });
  }
}
