import './globals.css';
import type { ReactNode } from 'react';
import Nav from './nav';
import ThemeToggle from './theme-toggle';

export const metadata = {
  title: 'SDVICO · Duyệt nội dung',
  description: 'Hàng đợi duyệt nội dung. Máy soạn, người bấm.'
};

// Áp theme đã lưu trước khi vẽ, tránh nháy nền.
const themeScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  const marketingOnly = process.env.MARKETING_ONLY === 'true' || process.env.MARKETING_ONLY === '1';
  return (
    <html lang="vi">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-logo" aria-hidden="true">
                <svg viewBox="0 0 40 40" width="36" height="36">
                  <defs>
                    <linearGradient id="sdvico" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#1f5fbf" />
                      <stop offset="1" stopColor="#e23b2e" />
                    </linearGradient>
                  </defs>
                  <circle cx="20" cy="20" r="19" fill="#eef2f7" />
                  <path
                    d="M27 13.5c-1.8-1.5-4.2-2.3-6.8-2.3-4.3 0-7.4 2.2-7.4 5.6 0 3 2.3 4.4 6.1 5.2 3.2.7 4 1.2 4 2.3 0 1.1-1.2 1.8-3.1 1.8-2.1 0-4-.8-5.6-2.1"
                    fill="none" stroke="url(#sdvico)" strokeWidth="3.4" strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="brand-text">
                SDVICO<small>{marketingOnly ? 'Duyệt nội dung Marketing' : 'Duyệt và Hồ sơ'}</small>
              </span>
            </div>
            <div className="nav-group">Trạm kiểm soát nội dung</div>
            <Nav marketingOnly={marketingOnly} />
            <div className="sidebar-foot">
              <ThemeToggle />
              <p className="foot-note">Máy soạn, người bấm gửi.</p>
            </div>
          </aside>
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  );
}
