'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Menu dọc bên trái, làm nổi tab đang mở. Mỗi mục có icon cho giống bảng điều khiển.
export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();
  const tabs = marketingOnly
    ? [
        { href: '/', label: 'Hàng đợi duyệt', icon: '📥' },
        { href: '/noi-dung', label: 'Nội dung', icon: '📝' },
        { href: '/video', label: 'Kịch bản video', icon: '🎬' },
        { href: '/da-dang', label: 'Lịch sử xuất bản', icon: '🌐' },
        { href: '/tu-khoa', label: 'Kho từ khóa', icon: '🔑' },
        { href: '/du-kien', label: 'Nguồn dữ kiện', icon: '📊' },
        { href: '/tu-lieu', label: 'Kho tư liệu', icon: '🎞️' }
      ]
    : [
        { href: '/', label: 'Hàng đợi duyệt', icon: '📥' },
        { href: '/noi-dung', label: 'Nội dung marketing', icon: '📝' },
        { href: '/ho-so', label: 'Hồ sơ ứng viên', icon: '👤' },
        { href: '/vi-tri', label: 'Vị trí tuyển dụng', icon: '📋' }
      ];
  return (
    <nav className="tabs" aria-label="Điều hướng">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`tab ${path === t.href ? 'on' : ''}`}>
          <span className="tab-icon" aria-hidden="true">{t.icon}</span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
