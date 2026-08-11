import { NextRequest, NextResponse } from 'next/server';

// Cổng mật khẩu cho giao diện duyệt. Điều cấm 6: dữ liệu ứng viên không lộ ra ngoài.
// Dùng HTTP Basic Auth, mật khẩu đặt ở biến môi trường APP_PASSWORD trên Vercel.
// Chốt an toàn: ở môi trường thật mà chưa đặt mật khẩu thì chặn hết, không mở cửa nhầm.

export const config = {
  // Bảo vệ mọi đường dẫn trừ tài nguyên tĩnh của Next.js.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};

export function middleware(req: NextRequest) {
  const pass = process.env.APP_PASSWORD;
  const user = process.env.APP_USER || 'sdvico';

  if (!pass) {
    // Chưa đặt mật khẩu. Ở môi trường thật thì đóng cửa, tránh lộ dữ liệu.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Chưa đặt APP_PASSWORD. Đặt biến môi trường này trên Vercel để mở khóa.', {
        status: 503
      });
    }
    return NextResponse.next(); // Máy nội bộ khi phát triển, cho qua.
  }

  const header = req.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    // Edge runtime dùng atob, không có Buffer. Mật khẩu nên là ký tự ASCII.
    const decoded = atob(encoded);
    const idx = decoded.indexOf(':');
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (u === user && p === pass) return NextResponse.next();
  }

  return new NextResponse('Cần đăng nhập để xem trang duyệt.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="SDVICO duyet", charset="UTF-8"' }
  });
}
