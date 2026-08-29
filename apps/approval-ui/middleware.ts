import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, safeEqualStrings } from './lib/session-auth';

// Cổng đăng nhập cho giao diện duyệt. Giao diện này đọc và ghi approval_queue bằng service
// role và hiển thị dữ liệu ứng viên, nên KHÔNG được để công khai không khóa (Điều cấm 6).
//
// Chỉ ép đăng nhập ở production (khi deploy). Dev cục bộ để trống cho tiện.
// Đặt hai biến môi trường trên Vercel: APPROVAL_UI_USER (tùy chọn, mặc định sdvico) và
// APPROVAL_UI_PASSWORD (bắt buộc). Thiếu mật khẩu ở production thì KHÓA hết, không mở toang.
//
// 28/8 (sếp: "bổ sung UI đăng nhập"): thêm TRANG /dang-nhap + cookie phiên thay cho popup
// basic-auth của trình duyệt. Thứ tự kiểm: cookie sdvico_auth -> header Basic (giữ cho
// curl/script cũ) -> chưa có thì chuyển hướng trình duyệt về /dang-nhap (hết popup 401).
// 29/8 (audit bảo mật): cookie đổi sang token HMAC v2 có hạn dùng, ký bằng AUTH_SECRET
// (lib/session-auth.ts) — bản cũ SHA-256(user:pass:salt) lộ cookie là dò ngược được mật
// khẩu. Đổi mật khẩu HOẶC AUTH_SECRET trên Vercel là mọi phiên cũ tự hết hạn.
// /api/login (đặt cookie) và /api/logout (xoá) nằm ở app/api.

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};

export async function middleware(req: NextRequest) {
  // 28/8 FIX (user: "mac gi trang blog bat dang nhap"): file TINH trong /public
  // (logo-sdvico.png...) khong nam trong matcher-except -> roi xuong basic-auth -> tra 401
  // + WWW-Authenticate -> browser BAT POPUP dang nhap ngay tren trang blog cua khach vang
  // lai (nguoi da login khong thay vi creds cache). Cho qua moi file tinh theo duoi.
  if (/\.(png|jpg|jpeg|gif|svg|webp|avif|ico|txt|xml|webmanifest|woff2?|mp4)$/i.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Bản deploy marketing-only: chặn hẳn route dữ liệu ứng viên, kể cả vào bằng URL trực tiếp.
  const marketingOnly = process.env.MARKETING_ONLY === 'true' || process.env.MARKETING_ONLY === '1';
  if (marketingOnly && /^\/(ho-so|vi-tri)(\/|$)/.test(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // API nội bộ (Vercel Cron gọi /api/rotate) không dùng basic-auth — tự bảo vệ bằng CRON_SECRET.
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

  // File xác minh TikTok (tiktok<token>.txt): method "URL prefix" GET file tại subpath của prefix
  // (prefix /privacy/ -> GET /privacy/tiktok<token>.txt). Trả THẲNG nội dung ở MỌI path để khớp
  // mọi prefix. PHẢI đặt TRƯỚC check /privacy /terms bên dưới, vì regex đó cũng khớp
  // /privacy/tiktok<token>.txt và sẽ cho Next render 404 nếu chạy trước.
  const ttMatch = req.nextUrl.pathname.match(/\/tiktok([A-Za-z0-9]+)\.txt$/);
  if (ttMatch) {
    const token = ttMatch[1];
    return new NextResponse(`tiktok-developers-site-verification=${token}\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    });
  }

  // Trang chính sách và điều khoản phải CÔNG KHAI (TikTok/Facebook review + người dùng xem yêu cầu URL mở).
  // TikTok verify GET đúng URL đã đăng ký, hay chuẩn hoá thêm '/' cuối; Next mặc định 308 redirect
  // /privacy/ -> /privacy nhưng TikTok KHÔNG follow -> báo "no signature". Rewrite tại đây để cùng
  // URL trả thẳng HTML (kèm meta trong <head> layout) thay vì redirect.
  const pth = req.nextUrl.pathname;
  if (/^\/(privacy|terms)\/$/.test(pth)) {
    const target = req.nextUrl.clone();
    target.pathname = pth.replace(/\/$/, '');
    return NextResponse.rewrite(target);
  }
  if (/^\/(privacy|terms)(\/|$)/.test(pth)) return NextResponse.next();

  // SEO public routes (item 2, 20/8): trang bài blog + trang sản phẩm + sitemap + robots là
  // trang MỞ để Google/Bing/người ngoài xem — bỏ basic-auth. Trang duyệt nội bộ vẫn khóa.
  //   /blog, /blog/<slug>       — bài đã đăng thật render thành HTML public
  //   /san-pham, /san-pham/<slug> — danh mục sản phẩm SDVICO (5 nhóm theo CLAUDE.md)
  //   /sitemap.xml, /robots.txt  — bắt buộc cho SEO
  if (/^\/(blog|san-pham)(\/|$)/.test(pth)) return NextResponse.next();
  if (pth === '/sitemap.xml' || pth === '/robots.txt') return NextResponse.next();

  // Trang đăng nhập phải MỞ (không thì vòng chuyển hướng vô tận).
  if (pth === '/dang-nhap') return NextResponse.next();

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

  // 1. Cookie phiên từ trang /dang-nhap (token HMAC v2, xác minh trong lib/session-auth).
  const cookieTok = req.cookies.get('sdvico_auth')?.value;
  if (cookieTok && await verifySessionToken(cookieTok)) return NextResponse.next();

  // 2. Basic auth — giữ cho curl/script và trình duyệt còn nhớ mật khẩu cũ.
  //    So hằng thời gian, không dùng === để khỏi lộ qua đo thời gian phản hồi.
  const auth = req.headers.get('authorization');
  if (auth) {
    const [scheme, encoded] = auth.split(' ');
    if (scheme === 'Basic' && encoded) {
      let decoded = '';
      try { decoded = atob(encoded); } catch { /* base64 hỏng thì coi như sai */ }
      const idx = decoded.indexOf(':');
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (idx >= 0 && await safeEqualStrings(u, user) && await safeEqualStrings(p, pass)) {
        return NextResponse.next();
      }
    }
  }

  // Request PREFETCH/RSC (Next tu tai truoc khi hover Link, hoac tai RSC payload) tra 401
  // tran — khong chuyen huong, khong popup (20/8 - trieu chung "web crash hoai").
  const isPrefetch = req.headers.get('next-router-prefetch') === '1'
    || req.headers.get('purpose') === 'prefetch'
    || req.headers.get('rsc') === '1';
  if (isPrefetch) {
    return new NextResponse(null, { status: 401 });
  }

  // 3. Trình duyệt mở trang thật -> đưa về TRANG ĐĂNG NHẬP (28/8, thay popup basic-auth),
  //    nhớ đường dẫn đang vào để đăng nhập xong quay lại đúng chỗ.
  const wantsHtml = req.method === 'GET'
    && (req.headers.get('sec-fetch-dest') === 'document' || (req.headers.get('accept') || '').includes('text/html'));
  if (wantsHtml) {
    const to = req.nextUrl.clone();
    to.pathname = '/dang-nhap';
    to.search = `?next=${encodeURIComponent(pth + (req.nextUrl.search || ''))}`;
    return NextResponse.redirect(to);
  }

  return new NextResponse('Cần đăng nhập để xem giao diện duyệt SDVICO.', { status: 401 });
}
