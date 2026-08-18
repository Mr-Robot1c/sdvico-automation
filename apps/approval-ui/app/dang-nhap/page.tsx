import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authMode, getAuthClient, getSessionUser } from '../../lib/auth';
import { getServerClient } from '../../lib/supabase-server';

export const dynamic = 'force-dynamic';

// Trang gửi magic link. Nhập email, hệ thống kiểm email nằm trong hr_users, gửi link.
// Ai bấm link được xác thực và đưa về trang chính.
// Nhấn mạnh: chỉ đọc bảng hr_users bằng service role phía server, không lộ danh sách ra client.

async function sendMagicLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@')) redirect('/dang-nhap?loi=' + encodeURIComponent('Email chưa hợp lệ.'));

  // Kiểm danh sách trắng trước, không cho lộ việc email nào tồn tại trong hệ thống nếu chưa
  // được cấp quyền. Dù kiểm là vô hiệu hay không có, thông báo vẫn giống nhau.
  const admin = getServerClient();
  const { data } = await admin.from('hr_users')
    .select('id, disabled_at').ilike('email', email).maybeSingle();
  if (!data || data.disabled_at) {
    // Trả về thông báo trung tính, không nói "email không có trong hệ thống".
    redirect('/dang-nhap?loi=' + encodeURIComponent('Email chưa được cấp quyền vào giao diện. Liên hệ quản trị.'));
  }

  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || 'https';
  const site = host ? `${proto}://${host}` : '';

  const authClient = getAuthClient();
  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: site ? `${site}/api/auth/callback` : undefined, shouldCreateUser: true },
  });
  if (error) redirect('/dang-nhap?loi=' + encodeURIComponent('Không gửi được link: ' + error.message));

  redirect('/dang-nhap?ok=1');
}

export default async function Page({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  // Đã đăng nhập rồi thì chuyển về trang chính.
  const user = await getSessionUser();
  if (user) redirect('/');

  const mode = authMode();

  return (
    <main className="login-shell">
      <div className="login-card">
        <h1 style={{ margin: '0 0 6px' }}>SDVICO · Đăng nhập</h1>
        <p className="muted" style={{ margin: '0 0 18px', fontSize: '0.9rem' }}>
          Hệ thống quản lý tuyển dụng
        </p>

        {mode !== 'supabase' ? (
          <div className="err" role="alert" style={{ marginBottom: 12 }}>
            <b>Chưa bật đăng nhập theo từng người.</b> Hiện app đang chạy chế độ mật khẩu chung
            (HTTP Basic). Để bật magic link, đặt biến môi trường <code>AUTH_MODE=supabase</code>{' '}
            trên Vercel và làm theo <code>docs/dang-nhap-supabase-auth.md</code>.
          </div>
        ) : null}

        {searchParams?.ok ? (
          <p role="status" style={{ background: 'var(--ok-bg)', color: 'var(--ok)', padding: '10px 12px', borderRadius: 8, margin: '0 0 12px' }}>
            Đã gửi link đăng nhập vào hộp thư. Mở mail và bấm link để vào.
          </p>
        ) : null}

        {searchParams?.loi ? (
          <p role="alert" className="err" style={{ marginBottom: 12 }}>{searchParams.loi}</p>
        ) : null}

        <form action={sendMagicLink}>
          <label htmlFor="email" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Email công ty</label>
          <input
            id="email" name="email" type="email" required autoFocus
            placeholder="ten@sdvico.vn"
            className="note"
            style={{ width: '100%', marginTop: 6, marginBottom: 12 }}
            disabled={mode !== 'supabase'}
          />
          <button className="btn ok" type="submit" style={{ width: '100%' }} disabled={mode !== 'supabase'}>
            Gửi link đăng nhập
          </button>
        </form>

        <p className="muted" style={{ marginTop: 14, fontSize: '0.82em' }}>
          Hệ thống gửi một link vào hộp thư của bạn. Bấm link là đăng nhập, không cần mật khẩu.
          Link chỉ dùng được một lần và hết hạn sau ít phút.
        </p>
      </div>
    </main>
  );
}
