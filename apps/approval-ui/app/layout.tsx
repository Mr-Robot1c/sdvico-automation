import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Duyệt nội dung SDVICO',
  description: 'Hàng đợi duyệt. Máy soạn, người bấm.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
