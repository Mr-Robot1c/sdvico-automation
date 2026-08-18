// Xử lý callback khi ứng viên magic link. Supabase gửi ?code=... về đây, đổi code lấy phiên.
// Nếu email không có trong hr_users hoặc bị vô hiệu hóa, đăng xuất ngay và chuyển về /dang-nhap.

import { NextResponse } from 'next/server';
import { getAuthClient } from '../../../../lib/auth';
import { getServerClient } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  // Luồng token_hash: link do Admin API sinh trực tiếp (auth.admin.generateLink), không qua
  // PKCE nên không cần code verifier ở trình duyệt. Dùng cho đăng nhập nhanh khi SMTP bị rate
  // limit. verifyOtp vẫn xác thực token một lần qua Supabase — an toàn như magic link email.
  const tokenHash = url.searchParams.get('token_hash');
  const otpType = url.searchParams.get('type');
  const origin = url.origin;

  if (!code && !tokenHash) return NextResponse.redirect(new URL('/dang-nhap?loi=Thi%E1%BA%BFu%20code', origin));

  const auth = getAuthClient();
  const { data, error } = tokenHash
    ? await auth.auth.verifyOtp({ token_hash: tokenHash, type: (otpType as 'magiclink' | 'email') || 'magiclink' })
    : await auth.auth.exchangeCodeForSession(code as string);
  if (error || !data.session?.user?.email) {
    return NextResponse.redirect(new URL('/dang-nhap?loi=' + encodeURIComponent('Không đổi được code: ' + (error?.message || 'không có phiên')), origin));
  }

  // Lưới chắn cuối: email phải nằm trong hr_users và chưa bị vô hiệu.
  const admin = getServerClient();
  const { data: row } = await admin.from('hr_users')
    .select('id, disabled_at').ilike('email', data.session.user.email).maybeSingle();
  if (!row || row.disabled_at) {
    await auth.auth.signOut();
    return NextResponse.redirect(new URL('/dang-nhap?loi=' + encodeURIComponent('Email không được cấp quyền vào giao diện.'), origin));
  }

  return NextResponse.redirect(new URL('/', origin));
}
