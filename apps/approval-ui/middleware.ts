import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Cổng đăng nhập cho giao diện duyệt. Điều cấm 6: dữ liệu ứng viên không lộ ra ngoài.
//
// Hai chế độ, chọn bằng biến môi trường AUTH_MODE:
//   basic     (mặc định) — HTTP Basic Auth, một mật khẩu dùng chung.
//   supabase  — magic link qua Supabase Auth, người dùng nhận link ở mail công ty.
//               Chỉ email trong bảng hr_users được đi qua middleware này.
//
// Cách chuyển chế độ mà không sửa code: đặt AUTH_MODE=supabase trên Vercel rồi redeploy.

export const config = {
  // Bảo vệ mọi đường dẫn trừ tài nguyên tĩnh của Next.js.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

const AUTH_MODE = process.env.AUTH_MODE === 'supabase' ? 'supabase' : 'basic';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Endpoint cron do GitHub Actions và cron-job.org gọi. Bảo vệ bằng CRON_SECRET
  // trong chính route, không qua cổng đăng nhập nội bộ.
  if (path.startsWith('/api/cron/')) return NextResponse.next();

  // Callback và logout của Supabase Auth. Bản thân callback đã tự kiểm hr_users.
  if (path.startsWith('/api/auth/')) return NextResponse.next();

  // Webhook Facebook do Meta gọi từ ngoài, không đăng nhập được. Tự bảo vệ bằng verify token
  // (GET) và chữ ký X-Hub-Signature-256 (POST) trong chính route, không qua cổng đăng nhập.
  if (path.startsWith('/api/webhooks/')) return NextResponse.next();

  // Trang công khai cho ứng viên tự chọn giờ phỏng vấn.
  if (path.startsWith('/phong-van/')) return NextResponse.next();

  // Trang công khai cho sếp xem CV + ra quyết định qua link do HR cấp (token 48 ký tự).
  if (path.startsWith('/xem-ho-so/')) return NextResponse.next();

  // Feed XML cho Jooble (spec jooble.org/files/xml_feed_specifications.pdf) và các
  // aggregator khác. JoobleBot crawl mà không đăng nhập được.
  if (path === '/api/jobs/feed.xml') return NextResponse.next();

  // Trang tuyển dụng public — ứng viên bấm vào từ link Jooble/Google Jobs. Không đụng
  // dữ liệu ứng viên, chỉ hiển thị tin do HR viết (điều cấm 6).
  if (path === '/tuyen-dung' || path.startsWith('/tuyen-dung/')) return NextResponse.next();

  if (AUTH_MODE === 'supabase') {
    return handleSupabase(req, path);
  }
  return handleBasic(req);
}

// Chế độ magic link qua Supabase Auth.
async function handleSupabase(req: NextRequest, path: string) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return new NextResponse(
      'Chế độ AUTH_MODE=supabase nhưng thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY. Đặt biến trên Vercel rồi redeploy.',
      { status: 503 }
    );
  }

  // Cho phép trang đăng nhập đi qua để user nhập email.
  if (path === '/dang-nhap' || path.startsWith('/dang-nhap/')) return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/dang-nhap', req.url));
  }
  // Không tra hr_users ở middleware (Edge runtime, tránh đọc DB thêm mỗi request).
  // getSessionUser() ở server component sẽ tra và trả null nếu bị vô hiệu — trong trường
  // hợp đó user sẽ thấy trang đăng nhập với thông báo tương ứng.
  return res;
}

// Chế độ HTTP Basic Auth cũ, giữ nguyên để không phá luồng đang chạy.
function handleBasic(req: NextRequest) {
  const pass = process.env.APP_PASSWORD;
  const user = process.env.APP_USER || 'sdvico';

  if (!pass) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(
        'Chưa đặt APP_PASSWORD. Đặt biến này trên Vercel, hoặc chuyển AUTH_MODE=supabase để dùng magic link.',
        { status: 503 }
      );
    }
    return NextResponse.next();
  }

  const header = req.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const idx = decoded.indexOf(':');
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (u === user && p === pass) return NextResponse.next();
  }

  return new NextResponse('Cần đăng nhập để xem trang duyệt.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="SDVICO duyet", charset="UTF-8"' },
  });
}
