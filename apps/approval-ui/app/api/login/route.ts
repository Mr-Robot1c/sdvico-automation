import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

// Nhận form từ /dang-nhap, so với APPROVAL_UI_USER/APPROVAL_UI_PASSWORD rồi đặt cookie phiên.
// Token = SHA-256("user:pass:sdvico-auth-v1") — PHẢI khớp expectedToken trong middleware.ts
// (bên đó tính bằng Web Crypto vì chạy edge). Đổi mật khẩu trên Vercel là phiên cũ tự chết.
export const dynamic = 'force-dynamic';

function safeNext(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const user = String(form.get('user') || '').trim();
  const pass = String(form.get('pass') || '');
  const next = safeNext(String(form.get('next') || '/'));

  const envUser = (process.env.APPROVAL_UI_USER || 'sdvico').trim();
  const envPass = (process.env.APPROVAL_UI_PASSWORD || '').trim();

  if (!envPass || user !== envUser || pass !== envPass) {
    return NextResponse.redirect(new URL(`/dang-nhap?loi=1&next=${encodeURIComponent(next)}`, req.url), 303);
  }

  const token = createHash('sha256').update(`${envUser}:${envPass}:sdvico-auth-v1`).digest('hex');
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set('sdvico_auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 60, // 60 ngày
  });
  return res;
}
