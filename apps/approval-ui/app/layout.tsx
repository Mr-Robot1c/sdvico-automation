import './globals.css';
import type { ReactNode } from 'react';
import Nav from './nav';

export const metadata = {
  title: 'Duyệt và Hồ sơ SDVICO',
  description: 'Hàng đợi duyệt và hồ sơ ứng viên. Máy soạn, người bấm.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">SDVICO · Duyệt và Hồ sơ</div>
            <Nav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
