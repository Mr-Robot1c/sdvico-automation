import './globals.css';
import type { ReactNode } from 'react';
import Nav from './nav';

export const metadata = {
  title: 'SDVICO · Duyệt nội dung',
  description: 'Hàng đợi duyệt nội dung. Máy soạn, người bấm.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const marketingOnly = process.env.MARKETING_ONLY === 'true' || process.env.MARKETING_ONLY === '1';
  return (
    <html lang="vi">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">SDVICO · {marketingOnly ? 'Duyệt nội dung Marketing' : 'Duyệt và Hồ sơ'}</div>
            <Nav marketingOnly={marketingOnly} />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
