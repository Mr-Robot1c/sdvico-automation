import './globals.css';
import type { ReactNode } from 'react';
import RootShell from './root-shell';
import { loadAdsConfig } from '../lib/ads-config';

export const metadata = {
  title: 'SDVICO · Duyệt nội dung',
  description: 'Hàng đợi duyệt nội dung. Máy soạn, người bấm.'
};

// Áp theme đã lưu trước khi vẽ, tránh nháy nền.
const themeScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

// Root layout tối giản. Toàn bộ shell (sidebar nội bộ vs header public site) chuyển sang
// RootShell (client) để tự chọn variant theo pathname (item 2, 20/8) — trang /blog và
// /san-pham dùng layout công khai không lộ nav duyệt nội bộ.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const marketingOnly = process.env.MARKETING_ONLY === 'true' || process.env.MARKETING_ONLY === '1';
  // Cấu hình đo lường quảng cáo (Pixel/GA4) cho trang công khai — item 4. Đọc 1 lần ở layout,
  // truyền xuống RootShell; chỉ chèn script ở nhánh public.
  const ads = await loadAdsConfig();
  return (
    <html lang="vi">
      <head>
        {/* TikTok Developer domain verify (meta method). Xanh cả 3 URL: /, /privacy, /terms
            vì cùng layout gốc chèn meta này. File /public/tiktok<token>.txt là dự phòng cho
            method "verify domain" nếu về sau cần. */}
        <meta name="tiktok-developers-site-verification" content="0RpAvSQjCxE6vBEr86J6Sl9RVestLIXd" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <RootShell marketingOnly={marketingOnly} pixelId={ads.pixelId} ga4Id={ads.ga4Id}>{children}</RootShell>
      </body>
    </html>
  );
}
