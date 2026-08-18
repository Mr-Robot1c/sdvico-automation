'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Thanh tab dùng chung cho khu vực Kênh mạng xã hội. Bình luận Facebook là một tab ở đây,
// không còn là mục điều hướng riêng ngoài sidebar.
const TABS = [
  { href: '/kenh', label: 'Tổng quan kênh' },
  { href: '/kenh/binh-luan', label: 'Bình luận Facebook' },
];

export default function KenhTabs() {
  const path = usePathname();
  return (
    <div className="tabbar" role="tablist">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} role="tab" aria-selected={active} className={`tab${active ? ' on' : ''}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
