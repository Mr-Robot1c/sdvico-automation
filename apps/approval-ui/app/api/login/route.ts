import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from '../../../lib/session-auth';

// Nhận form từ /dang-nhap, so với APPROVAL_UI_USER/APPROVAL_UI_PASSWORD rồi đặt cookie phiên.
// 29/8 (audit bảo mật): token đổi sang HMAC v2 có hạn dùng (lib/session-auth.ts) — token cũ
// là băm thuần của mật khẩu, lộ cookie là dò ngược được mật khẩu offline. Kèm hai vá:
//   - So mật khẩu bằng timingSafeEqual thay cho !== (không lộ qua đo thời gian).
//   - Giới hạn 10 lần sai / 15 phút mỗi IP (bộ đếm trong bộ nhớ — trên Vercel mỗi instance
//     đếm riêng nên chỉ chặn dò kiểu thô, không phải chống chịu tuyệt đối, nhưng trước đây
//     là KHÔNG giới hạn gì).
export const dynamic = 'force-dynamic';

function safeNext(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

// So hằng thời gian: băm hai bên cho cùng độ dài rồi timingSafeEqual.
function safeEq(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const loginFails = new Map<string, { count: number; firstAt: number }>();

function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for') || '';
  return xf.split(',')[0].trim() || 'unknown';
}

function pruneFails(now: number) {
  if (loginFails.size < 500) return;
  for (const [ip, e] of loginFails) {
    if (now - e.firstAt > FAIL_WINDOW_MS) loginFails.delete(ip);
  }
}

export async function POST(req: Request) {
  const form = await req.formData();
  const user = String(form.get('user') || '').trim();
  const pass = String(form.get('pass') || '');
  const next = safeNext(String(form.get('next') || '/'));

  const back = (loi: string) =>
    NextResponse.redirect(new URL(`/dang-nhap?loi=${loi}&next=${encodeURIComponent(next)}`, req.url), 303);

  const now = Date.now();
  const ip = clientIp(req);
  pruneFails(now);
  const entry = loginFails.get(ip);
  if (entry && now - entry.firstAt > FAIL_WINDOW_MS) loginFails.delete(ip);
  const fresh = loginFails.get(ip);
  if (fresh && fresh.count >= MAX_FAILS) return back('khoa');

  const envUser = (process.env.APPROVAL_UI_USER || 'sdvico').trim();
  const envPass = (process.env.APPROVAL_UI_PASSWORD || '').trim();

  const okUser = safeEq(user, envUser);
  const okPass = envPass ? safeEq(pass, envPass) : false;
  if (!envPass || !okUser || !okPass) {
    const e = loginFails.get(ip);
    if (e) e.count += 1;
    else loginFails.set(ip, { count: 1, firstAt: now });
    return back('1');
  }

  loginFails.delete(ip);
  const token = await createSessionToken();
  if (!token) return back('cfg'); // thiếu AUTH_SECRET — trang đăng nhập chỉ cách đặt

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set('sdvico_auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
