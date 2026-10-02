'use client';

// Bọc bố cục app: trang NỘI BỘ (hàng đợi, đo lường, kế hoạch...) dùng shell có sidebar
// + top header nội bộ; trang PUBLIC (/blog, /san-pham cho SEO — item 2, 20/8) dùng layout
// nhẹ có logo + menu công khai + footer, KHÔNG lộ nav duyệt.
//
// Chỉ RootShell là client component (usePathname). Sidebar/TopHeader/BotChip đã là client
// ở phiên trước — không đổi API của chúng.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Nav from './nav';
import TopHeader from './top-header';
import BotChip from './bot-chip';
// 9/9: nút "Hỏi bot" nổi trên mọi trang nội bộ (bot hỏi đáp từ kho, cùng khung với /hoi-dap).
import dynamic from 'next/dynamic';
// 15/9 (web chậm): khung chat bot (bot-chat + fab) chỉ tải khi trang đã vẽ xong, không nằm trong gói đầu của mọi trang.
const AskBotFab = dynamic(() => import('./ask-bot-fab'), { ssr: false });
import Tracking from './tracking';
// 2/10 (responsive mobile đợt 1): thanh đầu trang gọn + menu trượt cho điện thoại.
import ThemeToggle from './theme-toggle';
import { crumbFor, parentFor } from '../lib/routes';
import { PUBLIC_HOTLINE_DISPLAY, PUBLIC_HOTLINE_TEL } from '../lib/public-contact';

// Dưới 768px sidebar nội bộ thành menu trượt (off-canvas). Mốc này phải khớp @media (max-width: 767px) trong globals.css.
const MOBILE_MAX = 767;

export default function RootShell({ children, marketingOnly, pixelId, ga4Id }: { children: ReactNode; marketingOnly: boolean; pixelId?: string | null; ga4Id?: string | null }) {
  const path = usePathname() || '/';
  const [navOpen, setNavOpen] = useState(false);

  // Đổi trang thì đóng menu trượt (chọn mục menu = đổi pathname).
  useEffect(() => { setNavOpen(false); }, [path]);

  // Menu đang mở: khóa cuộn nền, Esc đóng, xoay máy/kéo rộng quá mốc mobile thì đóng.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    const onResize = () => { if (window.innerWidth > MOBILE_MAX) setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [navOpen]);

  // Đoạn mô tả dưới tiêu đề trang (.head-row > div > h1 + .sub) bị clamp 1 dòng trên điện thoại:
  // bấm vào để mở rộng, bấm lại để thu. Gom 1 chỗ để mọi trang nội bộ dùng chung, khỏi sửa từng page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const el = t?.closest?.('.head-row > div > h1 + .sub') as HTMLElement | null;
      if (!el || (t as HTMLElement).closest('a, button')) return;
      el.classList.toggle('sub-open');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Trang ĐĂNG NHẬP: render trần — không sidebar nội bộ (chưa đăng nhập), không header
  // public (đây không phải trang cho khách). Form tự căn giữa bằng .login-wrap.
  if (path === '/dang-nhap') return <>{children}</>;
  // Trang CONG KHAI (khong sidebar noi bo): blog, san-pham, va ca privacy/terms. Truoc day
  // privacy/terms dung shell noi bo -> hien sidebar day link can dang nhap, Next prefetch cac
  // route do -> loi 401 dồn dập tren console + co the bat popup dang nhap tren trang cong khai
  // (20/8: user bao "web crash hoai"). Dua het ve public shell, KHONG link vao route noi bo.
  // 2/10 (audit đợt A): thêm /xoa-du-lieu (hướng dẫn xóa dữ liệu) — trước dùng shell nội bộ (hamburger + bot) cho khách.
  const isPublic = /^\/(blog|san-pham|privacy|terms|xoa-du-lieu)(\/|$)/.test(path);

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
              <img src="/logo-sdvico.png" alt="" width={40} height={40} aria-hidden="true" decoding="async" />
              <span>
                <b>SDVICO</b>
                <small>Công nghệ số cho ngành biển và thủy sản</small>
              </span>
            </Link>
            <nav className="pub-nav" aria-label="Menu công khai">
              <Link href="/blog" className={path.startsWith('/blog') ? 'on' : ''} aria-current={path.startsWith('/blog') ? 'page' : undefined}>Bài viết</Link>
              <Link href="/san-pham" className={path.startsWith('/san-pham') ? 'on' : ''} aria-current={path.startsWith('/san-pham') ? 'page' : undefined}>Sản phẩm</Link>
            </nav>
            {/* 2/10 Thanh chốt (audit đóng gói chê hotline lệch số): mọi trang public dùng
                0939 243 222, trùng số trên bài bán và caption video. Lịch sử: 28/8 sếp từng
                đổi sang 0254 359 6868 theo sdvico.vn, nay thống nhất lại một số. */}
            <a className="pub-call" href={PUBLIC_HOTLINE_TEL} aria-label={`Gọi ${PUBLIC_HOTLINE_DISPLAY}`}>
              <span aria-hidden="true">📞</span>
              <span className="pub-call-txt">{PUBLIC_HOTLINE_DISPLAY}</span>
            </a>
          </div>
        </header>
        <div className="pub-content">{children}</div>
        <footer className="pub-footer">
          <div className="pub-footer-in">
            <div className="pub-footer-brand">
              <img src="/logo-sdvico.png" alt="" width={36} height={36} aria-hidden="true" decoding="async" />
              <div>
                <b>SDVICO</b>
                <p>Công nghệ số cho ngành biển và thủy sản</p>
              </div>
            </div>
            <nav className="pub-footer-links" aria-label="Liên kết chân trang">
              <a href={PUBLIC_HOTLINE_TEL}>Hotline {PUBLIC_HOTLINE_DISPLAY}</a>
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
  const mCrumb = crumbFor(path);
  const mParent = parentFor(path);
  return (
    <>
      <div className={`shell${navOpen ? ' nav-open' : ''}`}>
        {/* Lớp mờ phía sau menu trượt (chỉ hiện dưới 768px). Bấm là đóng menu. */}
        <div className="m-backdrop" aria-hidden="true" onClick={() => setNavOpen(false)} />
        <aside
          id="sidebar-nav"
          className="sidebar"
          aria-label="Thanh điều hướng"
          onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setNavOpen(false); }}
        >
          {/* Logo THAT cua cong ty (public/logo-sdvico.png) — sep chot 20/8, bo SVG chu S tu ve. */}
          <div className="brand">
            <span className="brand-logo" aria-hidden="true">
              <img src="/logo-sdvico.png" alt="" width={38} height={38} decoding="async" style={{ objectFit: 'contain', display: 'block' }} />
            </span>
            <span className="brand-text">
              SDVICO<small>Nghề cá thịnh vượng</small>
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
          {/* Thanh đầu trang gọn cho điện thoại (ẩn từ 768px trở lên, lúc đó dùng TopHeader như cũ). */}
          <div className="m-bar">
            <button
              type="button"
              className="m-menu-btn"
              aria-label={navOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={navOpen}
              aria-controls="sidebar-nav"
              onClick={() => setNavOpen((v) => !v)}
            >
              <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
            </button>
            <span className="m-brand">SDVICO</span>
            {mParent ? <Link href={mParent} className="m-back" aria-label="Quay lại trang cha" title="Quay lại">←</Link> : null}
            <span className="m-title">{mCrumb}</span>
            <ThemeToggle />
          </div>
          <TopHeader marketingOnly={marketingOnly} />
          <div className="content">{children}</div>
        </div>
      </div>
      <BotChip />
      <AskBotFab />
    </>
  );
}
