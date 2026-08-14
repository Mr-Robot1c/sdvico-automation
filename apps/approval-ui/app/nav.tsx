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
      { href: '/ho-so', label: 'Hồ sơ ứng viên' },
      { href: '/lich', label: 'Lịch phỏng vấn' },
    ],
  },
];

const SOLO_TOP: (NavItem & { icon: string })[] = [
  { href: '/', label: 'Duyệt & gửi', icon: '✓' },
];

const SOLO_BOTTOM: (NavItem & { icon: string })[] = [
  { href: '/cai-dat', label: 'Cài đặt', icon: '⚙' },
];

export default function Nav({ pendingCount = 0 }: { pendingCount?: number }) {
  const path = usePathname();

  // Trang công khai cho ứng viên (chọn giờ phỏng vấn) không hiện điều hướng nội bộ.
  if (path?.startsWith('/phong-van')) return null;

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
