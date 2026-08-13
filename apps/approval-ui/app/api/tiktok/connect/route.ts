import { NextResponse } from 'next/server';

// Bắt đầu OAuth TikTok: chuyển hướng người dùng tới trang cấp quyền của TikTok.
// Cần TIKTOK_CLIENT_KEY (Vercel env). Redirect URI phải trùng với cái đã đăng ký trong app TikTok.
export const dynamic = 'force-dynamic';

export async function GET() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.json({ error: 'Chưa đặt TIKTOK_CLIENT_KEY trong Vercel env.' }, { status: 500 });
  }
  const redirectUri =
    process.env.TIKTOK_REDIRECT_URI || 'https://sdvico-mktit.vercel.app/api/tiktok/callback';
  // Direct Post cần video.publish. Kèm video.upload (dự phòng nháp) và user.info.basic.
  const scope = process.env.TIKTOK_SCOPES || 'user.info.basic,video.publish,video.upload';
  const state = crypto.randomUUID();

  const authorize = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authorize.searchParams.set('client_key', clientKey);
  authorize.searchParams.set('scope', scope);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);

  const res = NextResponse.redirect(authorize.toString());
  // Lưu state vào cookie để callback đối chiếu (chống CSRF).
  res.cookies.set('tiktok_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/'
  });
  return res;
}
