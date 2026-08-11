import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cổng đăng nhập cho giao diện duyệt. Giao diện này đọc và ghi approval_queue bằng service
// role và hiển thị dữ liệu ứng viên, nên KHÔNG được để công khai không khóa (Điều cấm 6).
//
// Chỉ ép đăng nhập ở production (khi deploy). Dev cục bộ để trống cho tiện.
// Đặt hai biến môi trường trên Vercel: APPROVAL_UI_USER (tùy chọn, mặc định sdvico) và
// APPROVAL_UI_PASSWORD (bắt buộc). Thiếu mật khẩu ở production thì KHÓA hết, không mở toang.

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};

export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production') return NextResponse.next();

  // .trim() phòng khi giá trị biến môi trường dính ký tự xuống dòng hoặc khoảng trắng thừa.
  const pass = (process.env.APPROVAL_UI_PASSWORD || '').trim();
  const user = (process.env.APPROVAL_UI_USER || 'sdvico').trim();

  // Chưa đặt mật khẩu ở production thì khóa, không để lộ dữ liệu.
  if (!pass) {
    return new NextResponse('Chưa đặt mật khẩu bảo vệ (APPROVAL_UI_PASSWORD). Đặt biến này rồi deploy lại.', {
      status: 503
    });
  }

  const auth = req.headers.get('authorization');
  if (auth) {
    const [scheme, encoded] = auth.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const idx = decoded.indexOf(':');
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (u === user && p === pass) return NextResponse.next();
    }
  }

  return new NextResponse('Cần đăng nhập để xem giao diện duyệt SDVICO.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="SDVICO Duyet", charset="UTF-8"' }
  });
}
