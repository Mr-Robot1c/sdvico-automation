import './globals.css';
import type { ReactNode } from 'react';
import Nav from './nav';
import { getServerClient } from '../lib/supabase-server';

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pendingCount = await getPendingCount();
  return (
    <html lang="vi">
      <body>
        <div className="app-shell">
          <Nav pendingCount={pendingCount} />
          <div className="app-main">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
