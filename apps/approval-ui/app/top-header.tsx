'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './theme-toggle';
import { crumbFor, parentFor, routeNodeFor, ROUTES } from '../lib/routes';

// 15/9 (Thanh, kế hoạch "SDVICO sửa web"): nút "← Quay lại" đưa về TRANG CHA theo cây trang
// (lib/routes.ts), KHÔNG dùng history.back() nữa — đi Tổng quan/Khách hàng -> Agent -> Quay lại
// mà về lại Khách hàng là sai. Trang gốc của mỗi mục menu không có nút này.

// Thanh trên cùng: nhãn vai trò + đường dẫn cha › con + hành động phải (theme, user).
export default function TopHeader({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname() || '/';
  const role = marketingOnly ? 'Marketing SDVICO' : 'Duyệt và Hồ sơ SDVICO';
  const crumb = crumbFor(path);
  const parent = parentFor(path);
  const parentLabel = parent ? (ROUTES[parent]?.label || routeNodeFor(parent)?.node.label || '') : '';

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        {parent ? (
          <Link href={parent} className="topbar-back" title={`Quay lại ${parentLabel}`}>← Quay lại</Link>
        ) : null}
        <span className="topbar-role">{role}</span>
        {parent && parentLabel && parentLabel !== crumb ? (
          <>
            <span className="topbar-sep" aria-hidden="true">›</span>
            <Link href={parent} className="topbar-crumb" style={{ textDecoration: 'none', color: 'inherit' }}>{parentLabel}</Link>
          </>
        ) : null}
        {crumb ? (
          <>
            <span className="topbar-sep" aria-hidden="true">›</span>
            <span className="topbar-crumb">{crumb}</span>
          </>
        ) : null}
      </div>
      <div className="topbar-right">
        <ThemeToggle />
        <span className="topbar-user" aria-label="Người duyệt">
          <span className="topbar-user-avatar" aria-hidden="true">👤</span>
          <span className="topbar-user-name">Người duyệt</span>
        </span>
        {/* 30/8 (audit H1): màn ≤760px sidebar-foot bị ẩn -> điện thoại KHÔNG có cách đăng
            xuất. Đưa link vào topbar hiển thị mọi kích thước. a thường (không Link) để đi
            thẳng route handler xoá cookie, khỏi bị prefetch. */}
        <a className="topbar-logout" href="/api/logout" title="Đăng xuất khỏi giao diện duyệt">Đăng xuất</a>
      </div>
    </header>
  );
}
