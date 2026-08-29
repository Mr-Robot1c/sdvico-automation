import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';

// TikTok gọi lại đây sau khi người dùng cấp quyền: ?code=...&state=...
// Đổi code lấy access_token + refresh_token rồi lưu vào mkt_oauth_tokens (provider='tiktok').
export const dynamic = 'force-dynamic';

const APP_BASE = process.env.TIKTOK_REDIRECT_URI
  ? new URL(process.env.TIKTOK_REDIRECT_URI).origin
  : 'https://sdvico-mktit.vercel.app';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');
  if (err) {
    return NextResponse.redirect(
      `${APP_BASE}/tiktok?error=${encodeURIComponent(url.searchParams.get('error_description') || err)}`
    );
  }
  if (!code) return NextResponse.redirect(`${APP_BASE}/tiktok?error=thieu_code`);

  // Đối chiếu state chống CSRF. 29/8 (audit bảo mật): bản cũ chỉ chặn khi CÓ ĐỦ cả state
  // lẫn cookie mà lệch nhau — thiếu một trong hai là cho qua luôn (fail-open), kẻ tấn công
  // dụ admin bấm link callback kèm code của hắn là gắn nhầm tài khoản TikTok của hắn vào
  // hệ thống. Giờ thiếu hoặc lệch đều từ chối; /api/tiktok/connect luôn đặt cookie này
  // (maxAge 600) nên luồng bấm nút Kết nối thật không bị ảnh hưởng.
  const cookieState = req.headers.get('cookie')?.match(/tiktok_oauth_state=([^;]+)/)?.[1];
  let cookieVal: string | null = null;
  if (cookieState) {
    try { cookieVal = decodeURIComponent(cookieState); } catch { cookieVal = cookieState; }
  }
  if (!state || !cookieVal || cookieVal !== state) {
    return NextResponse.redirect(`${APP_BASE}/tiktok?error=state_khong_khop`);
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${APP_BASE}/api/tiktok/callback`;
  if (!clientKey || !clientSecret) {
    return NextResponse.redirect(`${APP_BASE}/tiktok?error=thieu_client_key_secret`);
  }

  try {
    const tRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    const t: any = await tRes.json();
    if (!tRes.ok || t.error || !t.access_token) {
      const msg = t.error_description || t.error || `HTTP ${tRes.status}`;
      return NextResponse.redirect(`${APP_BASE}/tiktok?error=${encodeURIComponent('doi_token_loi: ' + msg)}`);
    }

    const now = Date.now();
    const client = getServerClient();
    await client.from('mkt_oauth_tokens').upsert(
      {
        provider: 'tiktok',
        access_token: t.access_token,
        refresh_token: t.refresh_token || null,
        open_id: t.open_id || null,
        scope: t.scope || null,
        expires_at: new Date(now + (Number(t.expires_in) || 0) * 1000).toISOString(),
        refresh_expires_at: new Date(now + (Number(t.refresh_expires_in) || 0) * 1000).toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'provider' }
    );

    // State dùng một lần: xóa cookie sau khi đổi token thành công.
    const done = NextResponse.redirect(`${APP_BASE}/tiktok?connected=1`);
    done.cookies.set('tiktok_oauth_state', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
    return done;
  } catch (e: any) {
    return NextResponse.redirect(`${APP_BASE}/tiktok?error=${encodeURIComponent(String(e?.message || e))}`);
  }
}
