'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Điều hướng giữa các trang, làm nổi tab đang mở.
export default function Nav() {
  const path = usePathname();
  const tabs = [
    { href: '/tao-jd', label: 'Tạo JD' },
    { href: '/ho-so', label: 'Hồ sơ ứng viên' },
    { href: '/lich', label: 'Lịch phỏng vấn' },
    { href: '/dang-tin', label: 'Vị trí & Đăng tin' },
    { href: '/', label: 'Duyệt & gửi' }
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
