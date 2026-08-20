'use client';

// Bọc bố cục app: trang NỘI BỘ (hàng đợi, đo lường, kế hoạch...) dùng shell có sidebar
// + top header nội bộ; trang PUBLIC (/blog, /san-pham cho SEO — item 2, 20/8) dùng layout
// nhẹ có logo + menu công khai + footer, KHÔNG lộ nav duyệt.
//
// Chỉ RootShell là client component (usePathname). Sidebar/TopHeader/BotChip đã là client
// ở phiên trước — không đổi API của chúng.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Nav from './nav';
import TopHeader from './top-header';
import BotChip from './bot-chip';
import Tracking from './tracking';

export default function RootShell({ children, marketingOnly, pixelId, ga4Id }: { children: ReactNode; marketingOnly: boolean; pixelId?: string | null; ga4Id?: string | null }) {
  const path = usePathname() || '/';
  const isPublic = /^\/(blog|san-pham)(\/|$)/.test(path);

  if (isPublic) {
    return (
      <div className="public-shell">
        <Tracking pixelId={pixelId} ga4Id={ga4Id} />
        <header className="public-header">
          <Link href="/" className="public-brand" aria-label="Về trang chủ SDVICO">
            <span className="brand-logo" aria-hidden="true">
              <svg viewBox="0 0 40 40" width="32" height="32">
                <defs>
                  <linearGradient id="sdvico-pub" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#1f5fbf" />
                    <stop offset="1" stopColor="#e23b2e" />
                  </linearGradient>
                </defs>
                <circle cx="20" cy="20" r="19" fill="#eef2f7" />
                <path
                  d="M27 13.5c-1.8-1.5-4.2-2.3-6.8-2.3-4.3 0-7.4 2.2-7.4 5.6 0 3 2.3 4.4 6.1 5.2 3.2.7 4 1.2 4 2.3 0 1.1-1.2 1.8-3.1 1.8-2.1 0-4-.8-5.6-2.1"
                  fill="none" stroke="url(#sdvico-pub)" strokeWidth="3.4" strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="public-brand-text">SDVICO</span>
          </Link>
          <nav className="public-nav" aria-label="Menu công khai">
            <Link href="/blog" className={path.startsWith('/blog') ? 'on' : ''}>Bài viết</Link>
            <Link href="/san-pham" className={path.startsWith('/san-pham') ? 'on' : ''}>Sản phẩm</Link>
          </nav>
        </header>
        <div className="public-content">{children}</div>
        <footer className="public-footer">
          <p>SDVICO — Công nghệ số cho ngành biển và thủy sản.</p>
          <p>
            <a href="tel:1900232349">Hotline 1900 23 23 49</a>
            {' · '}
            <a href="https://sdvico.vn" target="_blank" rel="noopener noreferrer">sdvico.vn</a>
            {' · '}
            <Link href="/privacy">Chính sách</Link>
            {' · '}
            <Link href="/terms">Điều khoản</Link>
          </p>
        </footer>
      </div>
    );
  }

  // Trang nội bộ — shell cũ giữ nguyên.
  return (
    <>
      <div className="shell">
        <aside className="sidebar" aria-label="Thanh điều hướng">
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
              SDVICO<small>nghề cá thịnh vượng</small>
            </span>
          </div>
          <Nav marketingOnly={marketingOnly} />
          <div className="sidebar-foot">
            <p className="foot-note">Máy soạn, người bấm gửi.</p>
          </div>
        </aside>
        <div className="main-col">
          <TopHeader marketingOnly={marketingOnly} />
          <div className="content">{children}</div>
        </div>
      </div>
      <BotChip />
    </>
  );
}
