'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; icon: string };
type Group = { title: string; items: Tab[] };

// Sidebar chia nhóm theo dòng chảy công việc. Sếp chốt 20/8: Kết nối (3 kênh) và Quy tắc
// (2 trang) mỗi thứ GỘP thành 1 mục duy nhất — trang gộp /ket-noi và /quy-tac, trang chi
// tiết cũ vẫn sống làm trang con.
export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();

  const heThong: Group = {
    title: 'Hệ thống',
    items: [
      { href: '/ket-noi', label: 'Kết nối', icon: '🔌' },
      { href: '/quy-tac', label: 'Quy tắc', icon: '📜' }
    ]
  };
  // 21/8 gộp lớn (user): Tổng quan GỘP với Bảng bài viết thành MỘT mục /noi-dung theo mẫu
  // (stat + kênh kết nối trái + kanban phải; tab Bài viết/Video là danh sách chi tiết).
  // Hàng đợi duyệt + Vận hành cũng nằm trong đó; /hang-doi (HR + cảnh báo) và /van-hanh
  // vẫn sống, đi vào từ thanh vận hành trên board. Đo lường là trang riêng.
  const quanLySanXuat: Group = {
    title: 'Quản lí và Sản xuất',
    items: [
      { href: '/noi-dung', label: 'Tổng quan', icon: '📊' },
      { href: '/do-luong', label: 'Đo lường', icon: '📈' },
      { href: '/san-xuat', label: 'Xưởng sản xuất', icon: '🎬' },
      { href: '/tu-lieu', label: 'Kho tư liệu', icon: '🎞️' },
      { href: '/ke-hoach', label: 'Kế hoạch', icon: '🧭' },
      { href: '/quang-cao', label: 'Quảng cáo', icon: '📣' }
    ]
  };
  // Nhóm AI (user 18/8): Nguồn = tri thức các AI đã học (nội bộ + public); Dữ liệu = 5 AI
  // đang học tới đâu, kết quả gì — để người quản lý biết AI có thật sự học hay không.
  const ai: Group = {
    title: 'AI',
    items: [
      { href: '/kho-tri-thuc', label: 'Nguồn', icon: '🧠' },
      { href: '/du-lieu-ai', label: 'Dữ liệu', icon: '🤖' }
    ]
  };
  const groups: Group[] = marketingOnly
    ? [quanLySanXuat, ai, heThong]
    : [
        quanLySanXuat,
        ai,
        {
          title: 'Tuyển dụng',
          items: [
            { href: '/hang-doi', label: 'Hàng đợi HR', icon: '📥' },
            { href: '/ho-so', label: 'Hồ sơ ứng viên', icon: '👤' },
            { href: '/vi-tri', label: 'Vị trí tuyển dụng', icon: '📋' }
          ]
        },
        heThong
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
