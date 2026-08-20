'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Tab = { href: string; label: string; icon: string };
type Group = { title: string; items: Tab[]; defaultCollapsed?: boolean };

// Sidebar chia nhóm theo dòng chảy công việc. Nhóm ÍT DÙNG (Kết nối, Quy tắc) thu gọn mặc định
// cho gọn (user 20/8: "gôm 3 cái kết nối + quy tắc lại cho gọn"). Bấm tiêu đề nhóm để mở/đóng,
// nhớ trạng thái trong localStorage. Nhóm chứa trang đang mở luôn tự bung.
export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();

  const ketNoi: Group = {
    title: 'Kết nối',
    defaultCollapsed: true,
    items: [
      { href: '/facebook', label: 'Facebook', icon: '📘' },
      { href: '/tiktok', label: 'TikTok', icon: '🎵' },
      { href: '/youtube', label: 'YouTube', icon: '▶️' }
    ]
  };
  const quyTac: Group = {
    title: 'Quy tắc',
    defaultCollapsed: true,
    items: [
      { href: '/privacy', label: 'Quyền riêng tư', icon: '🔒' },
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
  const hangDoi: Group = {
    title: 'Hàng đợi',
    items: [
      { href: '/', label: 'Hàng đợi duyệt', icon: '📥' },
      { href: '/van-hanh', label: 'Vận hành', icon: '🛑' }
    ]
  };

  const groups: Group[] = marketingOnly
    ? [hangDoi, quanLySanXuat, ai, ketNoi, quyTac]
    : [
        hangDoi,
        quanLySanXuat,
        ai,
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

  // Nhóm nào người dùng đã tự đóng (ghi đè mặc định). Đọc localStorage sau khi mount để tránh
  // lệch server/client.
  const [closed, setClosed] = useState<Set<string>>(() => new Set(groups.filter((g) => g.defaultCollapsed).map((g) => g.title)));
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nav-closed-groups');
      if (raw) setClosed(new Set(JSON.parse(raw)));
    } catch { /* bỏ qua */ }
  }, []);

  const toggle = (title: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      try { localStorage.setItem('nav-closed-groups', JSON.stringify([...next])); } catch { /* bỏ qua */ }
      return next;
    });
  };

  return (
    <nav className="nav-groups" aria-label="Điều hướng chính">
      {groups.map((g) => {
        const hasActive = g.items.some((t) => t.href === path);
        // Nhóm chứa trang đang mở luôn bung, dù người dùng có đóng.
        const isOpen = hasActive || !closed.has(g.title);
        return (
          <div className="nav-block" key={g.title}>
            <button
              type="button"
              className="nav-group nav-group-btn"
              aria-expanded={isOpen}
              onClick={() => toggle(g.title)}
            >
              <span className="nav-group-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              <span>{g.title}</span>
            </button>
            {isOpen ? (
              <div className="tabs">
                {g.items.map((t) => (
                  <Link key={t.href} href={t.href} className={`tab ${path === t.href ? 'on' : ''}`}>
                    <span className="tab-icon" aria-hidden="true">{t.icon}</span>
                    <span>{t.label}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
