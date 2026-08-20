'use client';

import { usePathname } from 'next/navigation';
import ThemeToggle from './theme-toggle';

// Thanh trên cùng: nhãn vai trò + tên trang gọn + hành động phải (theme, user).
// Cố tình mỏng: title chi tiết của trang vẫn nằm trong <h1> của từng page.
export default function TopHeader({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname() || '/';
  const role = marketingOnly ? 'Marketing SDVICO' : 'Duyệt và Hồ sơ SDVICO';
  const crumb = crumbFor(path);

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <span className="topbar-role">{role}</span>
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
      </div>
    </header>
  );
}

function crumbFor(path: string): string {
  const map: Record<string, string> = {
    '/': 'Hàng đợi duyệt',
    '/van-hanh': 'Vận hành',
    '/noi-dung': 'Quản lý bài viết',
    '/san-xuat': 'Xưởng sản xuất',
    '/do-luong': 'Đo lường',
    '/tu-khoa': 'Kho từ khóa',
    '/du-kien': 'Nguồn dữ kiện',
    '/tu-lieu': 'Kho tư liệu',
    '/ke-hoach': 'Kế hoạch',
    '/kho-tri-thuc': 'Nguồn',
    '/du-lieu-ai': 'Dữ liệu AI',
    '/ket-noi': 'Kết nối',
    '/quy-tac': 'Quy tắc',
    '/quang-cao': 'Quảng cáo',
    '/facebook': 'Kết nối Facebook',
    '/tiktok': 'Kết nối TikTok',
    '/youtube': 'Kết nối YouTube',
    '/privacy': 'Chính sách quyền riêng tư',
    '/terms': 'Điều khoản',
    '/ho-so': 'Hồ sơ ứng viên',
    '/vi-tri': 'Vị trí tuyển dụng'
  };
  return map[path] || '';
}
