'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string };
type NavGroup = { id: string; label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    id: 'hr',
    label: 'Tuyển dụng',
    items: [
      { href: '/tao-jd', label: 'Tạo JD' },
      { href: '/dang-tin', label: 'Vị trí' },
      { href: '/kenh', label: 'Kênh mạng xã hội' },
      { href: '/binh-luan', label: 'Bình luận Facebook' },
      { href: '/ho-so', label: 'Hồ sơ ứng viên' },
      { href: '/lich', label: 'Lịch phỏng vấn' },
      { href: '/bao-cao', label: 'Báo cáo' },
    ],
  },
];

const SOLO_TOP: (NavItem & { icon: string })[] = [
  { href: '/', label: 'Duyệt & gửi', icon: '✓' },
];

const SOLO_BOTTOM: (NavItem & { icon: string })[] = [
  { href: '/cai-dat', label: 'Cài đặt', icon: '⚙' },
];

const ADMIN_ONLY: NavItem[] = [
  { href: '/nhan-vien', label: 'Nhân viên' },
  { href: '/cai-dat/nguoi-dung', label: 'Người dùng' },
  { href: '/cai-dat/nguon-cv', label: 'Nguồn CV chủ động' },
];

type NavUser = { email: string; fullName: string | null; role: string } | null;

export default function Nav({ pendingCount = 0, user = null }: { pendingCount?: number; user?: NavUser }) {
  const path = usePathname();

  // Trang công khai cho ứng viên (chọn giờ phỏng vấn) không hiện điều hướng nội bộ.
  if (path?.startsWith('/phong-van')) return null;
  // Trang đăng nhập cũng không hiện sidebar cho gọn.
  if (path === '/dang-nhap' || path?.startsWith('/dang-nhap/')) return null;

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    GROUPS.forEach((g) => { if (g.items.some((i) => i.href === path)) s.add(g.id); });
    return s;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const close = () => setMobileOpen(false);

  const inner = (
    <>
      <div className="nav-brand">
        <span className="nav-brand-name">SDVICO</span>
        <span className="nav-brand-sub">Hệ thống tuyển dụng</span>
      </div>

      <nav className="nav-body" aria-label="Điều hướng chính">
        {SOLO_TOP.map((item) => (
          <Link key={item.href} href={item.href} className={`nav-solo${path === item.href ? ' on' : ''}`} onClick={close}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
            {item.href === '/' && pendingCount > 0 ? (
              <span className="nav-badge" aria-label={`${pendingCount} mục chờ duyệt`}>{pendingCount}</span>
            ) : null}
          </Link>
        ))}

        <div className="nav-sep" />

        {GROUPS.map((group) => {
          const isOpen = openGroups.has(group.id);
          const hasActive = group.items.some((i) => i.href === path);
          return (
            <div key={group.id} className="nav-group">
              <button
                className={`nav-group-head${hasActive ? ' has-active' : ''}`}
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
              >
                <span className="nav-group-label">{group.label}</span>
                <span className={`nav-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">›</span>
              </button>
              {isOpen && (
                <div className="nav-group-items">
                  {group.items.map((item) => (
                    <Link key={item.href} href={item.href} className={`nav-item${path === item.href ? ' on' : ''}`} onClick={close}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="nav-spacer" />

        {SOLO_BOTTOM.map((item) => (
          <Link key={item.href} href={item.href} className={`nav-solo${path === item.href ? ' on' : ''}`} onClick={close}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Trang chỉ dành cho admin. Ẩn hoàn toàn với người khác cho gọn sidebar. */}
        {user?.role === 'admin' ? ADMIN_ONLY.map((item) => (
          <Link key={item.href} href={item.href} className={`nav-item${path === item.href ? ' on' : ''}`} onClick={close} style={{ marginLeft: 20, fontSize: '0.88em' }}>
            {item.label}
          </Link>
        )) : null}

        {/* Người đang đăng nhập. Chỉ hiện khi chế độ magic link đang bật và có phiên hợp lệ. */}
        {user ? (
          <div className="who">
            <span className="who-email">{user.fullName || user.email}</span>
            <span className="who-role">{user.email}{user.role === 'admin' ? ' · quản trị' : ''}</span>
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
      <button className="mobile-toggle" onClick={() => setMobileOpen((o) => !o)} aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}>
        <span className="toggle-icon" aria-hidden="true">{mobileOpen ? '✕' : '☰'}</span>
        <span className="toggle-brand">SDVICO</span>
      </button>

      <aside className={`sidebar${mobileOpen ? ' open' : ''}`} aria-label="Điều hướng">
        {inner}
      </aside>

      {mobileOpen && <div className="sidebar-backdrop" onClick={close} />}
    </>
  );
}
