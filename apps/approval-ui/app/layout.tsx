import './globals.css';
import type { ReactNode } from 'react';
import Nav from './nav';

export const metadata = {
  title: 'SDVICO · Quản lý tuyển dụng',
  description: 'Hệ thống tuyển dụng SDVICO — soạn, duyệt, đăng tin và quản lý hồ sơ ứng viên.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <div className="app-shell">
          <Nav />
          <div className="app-main">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
