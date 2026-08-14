'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; icon: string };
type Group = { title: string; items: Tab[] };

// Sidebar chia nhóm theo dòng chảy công việc: hàng đợi → quản lí và sản xuất → (tuyển dụng) → tư liệu → kết nối → quy tắc.
export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();

  const ketNoi: Group = {
    title: 'Kết nối',
    items: [
      { href: '/facebook', label: 'Kết nối Facebook', icon: '📘' },
      { href: '/tiktok', label: 'Kết nối TikTok', icon: '🎵' }
    ]
  };
  const quyTac: Group = {
    title: 'Quy tắc',
    items: [
      { href: '/privacy', label: 'Chính sách quyền riêng tư', icon: '🔒' },
      { href: '/terms', label: 'Điều khoản', icon: '📄' }
    ]
  };
  const quanLySanXuat: Group = {
    title: 'Quản lí và Sản xuất',
    items: [
      { href: '/noi-dung', label: 'Quản lý bài viết', icon: '📝' },
      { href: '/san-xuat', label: 'Xưởng sản xuất', icon: '🎬' },
      { href: '/tu-lieu', label: 'Kho tư liệu', icon: '🎞️' },
      { href: '/do-luong', label: 'Đo lường', icon: '📈' },
      { href: '/ke-hoach', label: 'Kế hoạch', icon: '🧭' }
    ]
  };
  const hangDoi: Group = {
    title: 'Hàng đợi',
    items: [
      { href: '/', label: 'Hàng đợi duyệt', icon: '📥' },
      { href: '/van-hanh', label: 'Vận hành', icon: '🛑' }
    ]
  };

  const groups: Group[] = marketingOnly
    ? [hangDoi, quanLySanXuat, ketNoi, quyTac]
    : [
        hangDoi,
        quanLySanXuat,
        {
          title: 'Tuyển dụng',
          items: [
            { href: '/ho-so', label: 'Hồ sơ ứng viên', icon: '👤' },
            { href: '/vi-tri', label: 'Vị trí tuyển dụng', icon: '📋' }
          ]
        },
        ketNoi,
        quyTac
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
