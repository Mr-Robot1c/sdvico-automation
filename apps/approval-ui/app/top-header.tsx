'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './theme-toggle';

// 5 trang chinh cua redesign 27/8 — cac trang KHAC (trang chi tiet cu) hien nut
// "← Tong quan" de quay ve dashboard (user 27/8: "trang nao chuyen sang trang khac
// thi them nut quay lai").
const MAIN_TABS = ['/tong-quan', '/video', '/seo', '/kenh', '/agent', '/'];

// Thanh trên cùng: nhãn vai trò + tên trang gọn + hành động phải (theme, user).
// Cố tình mỏng: title chi tiết của trang vẫn nằm trong <h1> của từng page.
export default function TopHeader({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname() || '/';
  const role = marketingOnly ? 'Marketing SDVICO' : 'Duyệt và Hồ sơ SDVICO';
  const crumb = crumbFor(path);
  const showBack = !MAIN_TABS.includes(path);

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        {showBack ? (
          <Link href="/tong-quan" className="topbar-back" title="Quay lại trang Tổng quan">← Tổng quan</Link>
        ) : null}
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
    '/': 'Tổng quan',
    '/hang-doi': 'Hàng đợi duyệt',
    '/van-hanh': 'Vận hành',
    '/tong-quan': 'Tổng quan',
    '/video': 'Video',
    '/seo': 'SEO',
    '/kenh': 'Kênh',
    '/agent': 'Agent',
    '/noi-dung': 'Tất cả nội dung',
    '/san-xuat': 'Xưởng sản xuất',
    '/do-luong': 'Đo lường',
    '/do-luong/tuan': 'Báo cáo tuần',
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
