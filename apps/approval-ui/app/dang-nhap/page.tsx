import type { Metadata } from 'next';

// Trang ĐĂNG NHẬP giao diện duyệt (28/8, sếp yêu cầu thay popup basic-auth của trình duyệt).
// Form POST sang /api/login — khớp APPROVAL_UI_USER/APPROVAL_UI_PASSWORD thì đặt cookie
// phiên rồi quay lại đúng trang đang vào (?next=). RootShell render trang này TRẦN (không
// sidebar nội bộ, không header public). Middleware luôn cho qua đường dẫn này.

export const metadata: Metadata = {
  title: 'Đăng nhập — SDVICO',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function safeNext(raw: string | undefined): string {
  const n = String(raw || '/');
  // Chỉ nhận đường dẫn nội bộ, chặn //host và http... để không thành cửa chuyển hướng mở.
  if (!n.startsWith('/') || n.startsWith('//')) return '/';
  return n;
}

// loi=1: sai tài khoản/mật khẩu. loi=khoa: quá 10 lần sai trong 15 phút (chặn dò mật khẩu).
// loi=cfg: máy chủ thiếu AUTH_SECRET nên không phát hành được phiên (29/8, token HMAC v2).
const ERROR_MESSAGES: Record<string, string> = {
  '1': 'Sai tài khoản hoặc mật khẩu. Thử lại.',
  khoa: 'Nhập sai quá nhiều lần. Chờ 15 phút rồi thử lại.',
  cfg: 'Máy chủ chưa cấu hình AUTH_SECRET nên không tạo được phiên đăng nhập. Báo người quản trị đặt biến AUTH_SECRET trên Vercel rồi deploy lại.',
};

export default function Page({ searchParams }: { searchParams?: { next?: string; loi?: string } }) {
  const next = safeNext(searchParams?.next);
  const errorMessage = ERROR_MESSAGES[searchParams?.loi || ''] || null;
  return (
    <main className="login-wrap">
      <form className="login-card" method="POST" action="/api/login">
        <img src="/logo-sdvico.png" alt="SDVICO" width={56} height={56} style={{ objectFit: 'contain' }} />
        <h1>Đăng nhập</h1>
        <p className="sub" style={{ textAlign: 'center' }}>Giao diện duyệt nội dung SDVICO</p>
        {errorMessage ? <p className="login-err" role="alert">{errorMessage}</p> : null}
        <label>
          Tài khoản
          {/* 29/8 (user): KHÔNG điền sẵn tên tài khoản — ô trống, khỏi lộ tên mặc định cho người lạ. */}
          <input name="user" autoComplete="username" required />
        </label>
        <label>
          Mật khẩu
          <input name="pass" type="password" autoComplete="current-password" required autoFocus />
        </label>
        <input type="hidden" name="next" value={next} />
        <button className="btn ok" type="submit">Đăng nhập</button>
        <p className="sub" style={{ textAlign: 'center', fontSize: '.8rem', margin: 0 }}>
          Quên mật khẩu thì hỏi người quản trị hệ thống.
        </p>
      </form>
    </main>
  );
}
