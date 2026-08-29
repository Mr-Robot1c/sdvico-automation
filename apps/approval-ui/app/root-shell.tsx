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
  // Trang ĐĂNG NHẬP: render trần — không sidebar nội bộ (chưa đăng nhập), không header
  // public (đây không phải trang cho khách). Form tự căn giữa bằng .login-wrap.
  if (path === '/dang-nhap') return <>{children}</>;
  // Trang CONG KHAI (khong sidebar noi bo): blog, san-pham, va ca privacy/terms. Truoc day
  // privacy/terms dung shell noi bo -> hien sidebar day link can dang nhap, Next prefetch cac
  // route do -> loi 401 dồn dập tren console + co the bat popup dang nhap tren trang cong khai
  // (20/8: user bao "web crash hoai"). Dua het ve public shell, KHONG link vao route noi bo.
  const isPublic = /^\/(blog|san-pham|privacy|terms)(\/|$)/.test(path);

  if (isPublic) {
    return (
      <div className="public-shell">
        <Tracking pixelId={pixelId} ga4Id={ga4Id} />
        {/* 21/8 lam lai theo docs/app-map/design-spec-trang-cong-khai.md: header dinh, brand +
            2 muc nav + nut Goi (outline, mobile thu thanh icon 44px). Brand tro /blog, KHONG
            tro '/' (trang duyet noi bo can dang nhap). Logo that public/logo-sdvico.png. */}
        <header className="pub-header">
          <div className="pub-header-in">
            <Link href="/blog" className="pub-brand" aria-label="SDVICO, trang bài viết">
              <img src="/logo-sdvico.png" alt="" width={40} height={40} aria-hidden="true" />
              <span>
                <b>SDVICO</b>
                <small>Công nghệ số cho ngành biển và thủy sản</small>
              </span>
            </Link>
            <nav className="pub-nav" aria-label="Menu công khai">
              <Link href="/blog" className={path.startsWith('/blog') ? 'on' : ''} aria-current={path.startsWith('/blog') ? 'page' : undefined}>Bài viết</Link>
              <Link href="/san-pham" className={path.startsWith('/san-pham') ? 'on' : ''} aria-current={path.startsWith('/san-pham') ? 'page' : undefined}>Sản phẩm</Link>
            </nav>
            {/* 28/8 sếp đổi hotline hiển thị trang public: 1900 23 23 49 -> 0254 359 6868
                (số đang dùng trên sdvico.vn). Bài máy sinh + trang privacy/terms giữ số cũ. */}
            <a className="pub-call" href="tel:02543596868" aria-label="Gọi 0254 359 6868">
              <span aria-hidden="true">📞</span>
              <span className="pub-call-txt">0254 359 6868</span>
            </a>
          </div>
        </header>
        <div className="pub-content">{children}</div>
        <footer className="pub-footer">
          <div className="pub-footer-in">
            <div className="pub-footer-brand">
              <img src="/logo-sdvico.png" alt="" width={36} height={36} aria-hidden="true" />
              <div>
                <b>SDVICO</b>
                <p>Công nghệ số cho ngành biển và thủy sản</p>
              </div>
            </div>
            <nav className="pub-footer-links" aria-label="Liên kết chân trang">
              <a href="tel:02543596868">Hotline 0254 359 6868</a>
              <a href="https://sdvico.vn" target="_blank" rel="noopener noreferrer">sdvico.vn</a>
              <Link href="/privacy">Chính sách</Link>
              <Link href="/terms">Điều khoản</Link>
            </nav>
          </div>
        </footer>
      </div>
    );
  }

  // Trang nội bộ — shell cũ giữ nguyên.
  return (
    <>
      <div className="shell">
        <aside className="sidebar" aria-label="Thanh điều hướng">
          {/* Logo THAT cua cong ty (public/logo-sdvico.png) — sep chot 20/8, bo SVG chu S tu ve. */}
          <div className="brand">
            <span className="brand-logo" aria-hidden="true">
              <img src="/logo-sdvico.png" alt="" width={38} height={38} style={{ objectFit: 'contain', display: 'block' }} />
            </span>
            <span className="brand-text">
              SDVICO<small>nghề cá thịnh vượng</small>
            </span>
          </div>
          <Nav marketingOnly={marketingOnly} />
          <div className="sidebar-foot">
            <p className="foot-note">Máy soạn, người bấm gửi.</p>
            {/* a thường (không Link) để đi thẳng route handler xoá cookie, khỏi bị prefetch. */}
            <a className="foot-note foot-logout" href="/api/logout">Đăng xuất</a>
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
