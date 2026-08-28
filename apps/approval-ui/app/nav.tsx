'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; icon: string; external?: boolean; also?: string[] };
type Group = { title: string; items: Tab[] };

// 27/8 REDESIGN theo file "redesign web.docx" cua sep: sidebar rut ve 5 muc chinh
// Tong quan - Video - SEO - Kenh - Agent (giong ForLife Ops). Cac trang cu (/noi-dung,
// /ke-hoach, /do-luong, /san-xuat, /tu-lieu...) VAN SONG, duoc link "Chi tiet" tu trong
// tung tab; `also` liet ke cac route con de muc cha van sang khi dang o trang chi tiet.
export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();

  // 28/8 (user): bo nhan "SDVICO Ops" tren sidebar — brand logo ngay tren da du.
  const main: Group = {
    title: '',
    items: [
      { href: '/tong-quan', label: 'Tổng quan', icon: '📊', also: ['/noi-dung', '/ke-hoach', '/khach-hang', '/hang-doi'] },
      { href: '/video', label: 'Video', icon: '🎬', also: ['/san-xuat', '/tu-lieu'] },
      { href: '/seo', label: 'SEO', icon: '🔍', also: ['/tu-khoa', '/quang-cao', '/du-kien'] },
      { href: '/kenh', label: 'Kênh', icon: '📡', also: ['/do-luong', '/ket-noi', '/facebook', '/youtube', '/tiktok'] },
      { href: '/agent', label: 'Agent', icon: '🤖', also: ['/du-lieu-ai', '/kho-tri-thuc'] }
    ]
  };
  const heThong: Group = {
    title: 'Hệ thống',
    items: [
      { href: '/van-hanh', label: 'Vận hành', icon: '🛑' },
      { href: '/quy-tac', label: 'Quy tắc', icon: '📜' },
      // 29/8 (user): thay link sdvico.vn bang BLOG cua chinh he thong (trang cong khai /blog).
      { href: '/blog', label: 'Blog SDVICO', icon: '🌐', external: true }
    ]
  };
  const groups: Group[] = marketingOnly
    ? [main, heThong]
    : [
        main,
        {
          title: 'Tuyển dụng',
          items: [
            { href: '/ho-so', label: 'Hồ sơ ứng viên', icon: '👤' },
            { href: '/vi-tri', label: 'Vị trí tuyển dụng', icon: '📋' }
          ]
        },
        heThong
      ];

  const isOn = (t: Tab) =>
    path === t.href || (t.also || []).some((a) => path === a || (path || '').startsWith(a + '/')) || (path || '').startsWith(t.href + '/');

  return (
    <nav className="nav-groups" aria-label="Điều hướng chính">
      {groups.map((g, gi) => (
        <div className="nav-block" key={g.title || `g${gi}`}>
          {g.title ? <div className="nav-group">{g.title}</div> : null}
          <div className="tabs">
            {g.items.map((t) =>
              t.external ? (
                <a key={t.href} href={t.href} className="tab" target="_blank" rel="noreferrer" title="Mở trang công khai ở tab mới (người ngoài xem được, không cần đăng nhập)">
                  <span className="tab-icon" aria-hidden="true">{t.icon}</span>
                  <span>{t.label} ↗</span>
                </a>
              ) : (
                <Link key={t.href} href={t.href} className={`tab ${isOn(t) ? 'on' : ''}`}>
                  <span className="tab-icon" aria-hidden="true">{t.icon}</span>
                  <span>{t.label}</span>
                </Link>
              )
            )}
          </div>
        </div>
      ))}
    </nav>
  );
}
