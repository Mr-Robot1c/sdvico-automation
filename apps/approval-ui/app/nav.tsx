'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Điều hướng giữa các trang, làm nổi tab đang mở.
export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();
  const tabs = marketingOnly
    ? [
        { href: '/', label: 'Hàng đợi duyệt' },
        { href: '/noi-dung', label: 'Nội dung marketing' }
      ]
    : [
        { href: '/', label: 'Hàng đợi duyệt' },
        { href: '/noi-dung', label: 'Nội dung marketing' },
        { href: '/ho-so', label: 'Hồ sơ ứng viên' },
        { href: '/vi-tri', label: 'Vị trí tuyển dụng' }
      ];
  return (
    <nav className="tabs" aria-label="Điều hướng">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`tab ${path === t.href ? 'on' : ''}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
