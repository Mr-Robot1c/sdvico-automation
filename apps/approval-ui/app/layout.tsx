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
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-badge">S</span>
              <span className="brand-text">SDVICO<small>{marketingOnly ? 'Marketing' : 'Duyệt và Hồ sơ'}</small></span>
            </div>
            <div className="nav-group">Trạm kiểm soát nội dung</div>
            <Nav marketingOnly={marketingOnly} />
            <div className="sidebar-foot">Máy soạn, người bấm gửi.</div>
          </aside>
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  );
}
