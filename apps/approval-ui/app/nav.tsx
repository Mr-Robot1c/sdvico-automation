'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; icon: string };
type Group = { title: string; items: Tab[] };

// Sidebar chia nhóm theo dòng chảy công việc: hàng đợi → nội dung → sản xuất → tư liệu → (tuyển dụng).
export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();

  const groups: Group[] = marketingOnly
    ? [
        { title: 'Hàng đợi', items: [{ href: '/', label: 'Hàng đợi duyệt', icon: '📥' }] },
        {
          title: 'Nội dung',
          items: [
            { href: '/noi-dung', label: 'Quản lý bài viết', icon: '📝' },
            { href: '/da-dang', label: 'Lịch sử xuất bản', icon: '🌐' }
          ]
        },
        {
          title: 'Sản xuất',
          items: [{ href: '/san-xuat', label: 'Xưởng sản xuất', icon: '🎬' }]
        },
        {
          title: 'Tư liệu',
          items: [
            { href: '/tu-khoa', label: 'Kho từ khóa', icon: '🔑' },
            { href: '/du-kien', label: 'Nguồn dữ kiện', icon: '📊' },
            { href: '/tu-lieu', label: 'Kho tư liệu', icon: '🎞️' }
          ]
        },
        {
          title: 'Kết nối',
          items: [{ href: '/tiktok', label: 'Kết nối TikTok', icon: '🎵' }]
        }
      ]
    : [
        { title: 'Hàng đợi', items: [{ href: '/', label: 'Hàng đợi duyệt', icon: '📥' }] },
        {
          title: 'Nội dung',
          items: [
            { href: '/noi-dung', label: 'Quản lý bài viết', icon: '📝' },
            { href: '/da-dang', label: 'Lịch sử xuất bản', icon: '🌐' }
          ]
        },
        { title: 'Sản xuất', items: [{ href: '/san-xuat', label: 'Xưởng sản xuất', icon: '🎬' }] },
        {
          title: 'Tuyển dụng',
          items: [
            { href: '/ho-so', label: 'Hồ sơ ứng viên', icon: '👤' },
            { href: '/vi-tri', label: 'Vị trí tuyển dụng', icon: '📋' }
          ]
        },
        {
          title: 'Tư liệu',
          items: [
            { href: '/tu-khoa', label: 'Kho từ khóa', icon: '🔑' },
            { href: '/du-kien', label: 'Nguồn dữ kiện', icon: '📊' },
            { href: '/tu-lieu', label: 'Kho tư liệu', icon: '🎞️' }
          ]
        },
        {
          title: 'Kết nối',
          items: [{ href: '/tiktok', label: 'Kết nối TikTok', icon: '🎵' }]
        }
      ];

  return (
    <nav className="nav-groups" aria-label="Điều hướng chính">
      {groups.map((g) => (
        <div className="nav-block" key={g.title}>
          <div className="nav-group">{g.title}</div>
          <div className="tabs">
            {g.items.map((t) => (
              <Link key={t.href} href={t.href} className={`tab ${path === t.href ? 'on' : ''}`}>
                <span className="tab-icon" aria-hidden="true">{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
