'use client';

import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from './theme-toggle';

// 5 trang chinh cua redesign 27/8 — cac trang KHAC (trang chi tiet cu) hien nut
// "← Quay lai" = router.back() ve TRANG TRUOC DO (user 27/8 v2: "quay ve trang truoc
// chu khong phai ve Tong quan luon"). Vao thang bang URL (khong co history) thi
// fallback ve /tong-quan.
const MAIN_TABS = ['/tong-quan', '/video', '/seo', '/kenh', '/agent', '/'];

// Thanh trên cùng: nhãn vai trò + tên trang gọn + hành động phải (theme, user).
// Cố tình mỏng: title chi tiết của trang vẫn nằm trong <h1> của từng page.
export default function TopHeader({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname() || '/';
  const router = useRouter();
  const role = marketingOnly ? 'Marketing SDVICO' : 'Duyệt và Hồ sơ SDVICO';
  const crumb = crumbFor(path);
  const showBack = !MAIN_TABS.includes(path);
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/tong-quan');
  };

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        {showBack ? (
          <button type="button" onClick={goBack} className="topbar-back" title="Quay lại trang trước đó">← Quay lại</button>
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
        {/* 30/8 (audit H1): màn ≤760px sidebar-foot bị ẩn -> điện thoại KHÔNG có cách đăng
            xuất. Đưa link vào topbar hiển thị mọi kích thước. a thường (không Link) để đi
            thẳng route handler xoá cookie, khỏi bị prefetch. */}
        <a className="topbar-logout" href="/api/logout" title="Đăng xuất khỏi giao diện duyệt">Đăng xuất</a>
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
    '/kho-tri-thuc': 'Nguồn học dữ liệu',
    '/du-lieu-ai': 'Nguồn học dữ liệu',
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
