'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Icon SVG nhỏ, đồng phong cách outline 1.5px. Đặt ngay trong file để tránh phụ thuộc lib.
type IconKey =
  | 'inbox' | 'briefcase' | 'megaphone' | 'share'
  | 'user' | 'calendar' | 'chart' | 'employees'
  | 'settings' | 'users-cog' | 'source';

function Icon({ name }: { name: IconKey }) {
  const paths: Record<IconKey, JSX.Element> = {
    inbox: (
      <>
        <path d="M4 13l2.5-7A2 2 0 0 1 8.4 4.7h7.2a2 2 0 0 1 1.9 1.3L20 13" />
        <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5h-4l-1.5 2h-5L8 13H4z" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        <path d="M3 12h18" />
      </>
    ),
    megaphone: (
      <>
        <path d="M4 11v2a2 2 0 0 0 2 2h1l3 4v-4h1l7-4V7l-7-4H10L7 7H6a2 2 0 0 0-2 2z" />
        <path d="M18 8v6" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="19" r="2.5" />
        <path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V6M10 20v-8M16 20V10M22 20H2" />
      </>
    ),
    employees: (
      <>
        <circle cx="9" cy="9" r="3.5" />
        <circle cx="17" cy="10" r="2.5" />
        <path d="M2.5 19c1-3 3.5-4.5 6.5-4.5s5.5 1.5 6.5 4.5" />
        <path d="M15 16.5c1-1.5 2.5-2.2 4-2.2 1.6 0 2.7.7 3.5 2.2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </>
    ),
    'users-cog': (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19c1-3 3-4.5 6-4.5s5 1.5 6 4.5" />
        <circle cx="17" cy="16" r="2" />
        <path d="M17 12v1.2M17 18.8V20M13 16h1.2M19.8 16H21M14.2 13.2l.9.9M18.9 17.9l.9.9M14.2 18.8l.9-.9M18.9 14.1l.9-.9" />
      </>
    ),
    source: (
      <>
        <path d="M4 6h16M4 12h16M4 18h10" />
        <circle cx="18" cy="18" r="3" />
        <path d="M18 16.5v3M16.5 18h3" />
      </>
    ),
  };
  return (
    <svg
      className="nav-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

type Item = { href: string; label: string; icon: IconKey; adminOnly?: boolean };
type Section = { id: string; label: string; items: Item[] };

// Cấu trúc mới: phẳng, có tiêu đề nhóm nhỏ. Tên menu khớp tiêu đề trang bên trong.
const SECTIONS: Section[] = [
  {
    id: 'hr',
    label: 'Tuyển dụng',
    items: [
      { href: '/tao-jd', label: 'Vị trí tuyển dụng', icon: 'briefcase' },
      { href: '/dang-tin', label: 'Tin đăng', icon: 'megaphone' },
      { href: '/kenh', label: 'Kênh đăng tin', icon: 'share' },
    ],
  },
  {
    id: 'candidates',
    label: 'Ứng viên',
    items: [
      { href: '/ho-so', label: 'Hồ sơ', icon: 'user' },
      { href: '/lich', label: 'Lịch phỏng vấn', icon: 'calendar' },
    ],
  },
  {
    id: 'company',
    label: 'Công ty',
    items: [
      { href: '/bao-cao', label: 'Báo cáo', icon: 'chart' },
      { href: '/nhan-vien', label: 'Nhân viên', icon: 'employees', adminOnly: true },
    ],
  },
];

const INBOX: Item = { href: '/', label: 'Duyệt & gửi', icon: 'inbox' };
const SETTINGS: Item = { href: '/cai-dat', label: 'Cài đặt', icon: 'settings' };
const SETTINGS_SUB: Item[] = [
  { href: '/cai-dat/nguoi-dung', label: 'Người dùng', icon: 'users-cog' },
  { href: '/cai-dat/nguon-cv', label: 'Nguồn CV chủ động', icon: 'source' },
];

type NavUser = { email: string; fullName: string | null; role: string } | null;

export default function Nav({ pendingCount = 0, user = null }: { pendingCount?: number; user?: NavUser }) {
  const path = usePathname();
  // Hook phải gọi trước mọi return sớm để giữ thứ tự cố định giữa các lần render.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Trang công khai cho ứng viên (chọn giờ phỏng vấn) không hiện điều hướng nội bộ.
  if (path?.startsWith('/phong-van')) return null;
  // Trang đăng nhập cũng không hiện sidebar cho gọn.
  if (path === '/dang-nhap' || path?.startsWith('/dang-nhap/')) return null;

  const isAdmin = user?.role === 'admin';
  const close = () => setMobileOpen(false);
  const isOn = (href: string) =>
    href === '/' ? path === '/' : path === href || (path?.startsWith(href + '/') ?? false);

  const renderItem = (item: Item, withBadge = false) => (
    <Link
      key={item.href}
      href={item.href}
      className={`nav-item${isOn(item.href) ? ' on' : ''}`}
      onClick={close}
    >
      <Icon name={item.icon} />
      <span className="nav-item-label">{item.label}</span>
      {withBadge && pendingCount > 0 ? (
        <span className="nav-badge" aria-label={`${pendingCount} mục chờ duyệt`}>{pendingCount}</span>
      ) : null}
    </Link>
  );

  const settingsAdminSub = isAdmin && (isOn('/cai-dat') || SETTINGS_SUB.some((i) => isOn(i.href)));

  const inner = (
    <>
      <div className="nav-brand">
        <span className="nav-brand-name">SDVICO</span>
        <span className="nav-brand-sub">Hệ thống tuyển dụng</span>
      </div>

      <nav className="nav-body" aria-label="Điều hướng chính">
        {renderItem(INBOX, true)}

        {SECTIONS.map((section) => {
          const visible = section.items.filter((i) => !i.adminOnly || isAdmin);
          if (visible.length === 0) return null;
          return (
            <div key={section.id} className="nav-section">
              <div className="nav-section-label">{section.label}</div>
              {visible.map((i) => renderItem(i))}
            </div>
          );
        })}

        <div className="nav-spacer" />

        {renderItem(SETTINGS)}
        {settingsAdminSub
          ? SETTINGS_SUB.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={`nav-item nav-sub${isOn(i.href) ? ' on' : ''}`}
                onClick={close}
              >
                <Icon name={i.icon} />
                <span className="nav-item-label">{i.label}</span>
              </Link>
            ))
          : null}

        {/* Người đang đăng nhập. Chỉ hiện khi chế độ magic link đang bật và có phiên hợp lệ. */}
        {user ? (
          <div className="who">
            <span className="who-email">{user.fullName || user.email}</span>
            <span className="who-role">{user.email}{isAdmin ? ' · quản trị' : ''}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit">Đăng xuất</button>
            </form>
          </div>
        ) : null}
      </nav>
    </>
  );

  return (
    <>
      <button
        className="mobile-toggle"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
      >
        <span className="toggle-icon" aria-hidden="true">{mobileOpen ? '✕' : '☰'}</span>
        <span className="toggle-brand">SDVICO</span>
        {pendingCount > 0 && !mobileOpen ? (
          <span className="nav-badge" aria-label={`${pendingCount} mục chờ duyệt`}>{pendingCount}</span>
        ) : null}
      </button>

      <aside className={`sidebar${mobileOpen ? ' open' : ''}`} aria-label="Điều hướng">
        {inner}
      </aside>

      {mobileOpen && <div className="sidebar-backdrop" onClick={close} />}
    </>
  );
}
