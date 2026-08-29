import { NextResponse } from 'next/server';

// Xoá cookie phiên đăng nhập rồi đưa về trang /dang-nhap.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/dang-nhap', req.url), 303);
  res.cookies.set('sdvico_auth', '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 });
  return res;
}
