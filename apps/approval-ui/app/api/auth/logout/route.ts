import { NextResponse } from 'next/server';
import { getAuthClient } from '../../../../lib/auth';

export const runtime = 'nodejs';

// Đăng xuất, xóa cookie phiên và về trang đăng nhập.
export async function POST(req: Request) {
  const url = new URL(req.url);
  try { await getAuthClient().auth.signOut(); } catch { /* eo */ }
  return NextResponse.redirect(new URL('/dang-nhap', url.origin), { status: 303 });
}
