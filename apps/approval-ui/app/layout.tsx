import './globals.css';
import type { ReactNode } from 'react';
import Nav from './nav';
import { getServerClient } from '../lib/supabase-server';
import { getSessionUser } from '../lib/auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SDVICO · Quản lý tuyển dụng',
  description: 'Hệ thống tuyển dụng SDVICO — soạn, duyệt, đăng tin và quản lý hồ sơ ứng viên.'
};

// Đếm số mục đang chờ duyệt để hiện badge đỏ trên tab "Duyệt & gửi".
async function getPendingCount(): Promise<number> {
  try {
    const client = getServerClient();
    const { count } = await client
      .from('approval_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Script chạy đồng bộ trong <head> trước khi hydrate. Đọc localStorage và áp data-theme
// (dark/light/empty) lên <html> — CSS đã có rule tương ứng, nên tránh flash khi vào trang.
// Nếu localStorage bị chặn hoặc chưa có, giữ default (system): CSS media query lo phần còn lại.
const THEME_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('sdvico-theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [pendingCount, user] = await Promise.all([getPendingCount(), getSessionUser()]);
  return (
    <html lang="vi">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="app-shell">
          <Nav pendingCount={pendingCount} user={user} />
          <div className="app-main">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
