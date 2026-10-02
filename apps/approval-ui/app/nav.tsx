'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES, rootTabFor } from '../lib/routes';

// 2/10 (lệnh Thanh và sếp tối 2/10, theo ảnh mẫu menu "Tuyển dụng >"): sidebar thành NHÓM ĐÓNG/MỞ.
// Mỗi mục gốc là một hàng cha (icon + nhãn + chevron). Bấm NHÃN = sang trang gốc của nhóm (và nhóm tự mở).
// Bấm CHEVRON = chỉ đóng/mở, không đổi trang. Mục con thụt vào, chữ nhỏ hơn một nấc.
// Mặc định mọi nhóm thu gọn, trừ nhóm chứa trang đang đứng. Trạng thái nhớ trong sessionStorage theo từng nhóm.
// Cây trang và nhãn con lấy từ lib/routes.ts (ROUTES), danh sách con ở đây chỉ chọn mục nào hiện trên menu.
// Việc sau: badge số đỏ cạnh nhóm (cần truy vấn dữ liệu trong nav), chưa làm đợt này.
type Child = { href: string; label: string; external?: boolean };
type NavGroup = {
  key: string;
  label: string;
  icon: string;
  href?: string; // có href = nhãn bấm được sang trang gốc; không có = cả hàng chỉ đóng/mở
  also?: string[]; // route chưa khai trong cây, giữ để hàng cha vẫn sáng
  children: Child[];
};

const child = (href: string): Child => ({ href, label: ROUTES[href]?.label || href });

const STORE_PREFIX = 'sdvico-nav-open:';

export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();
  const p = ((path || '/').replace(/\/+$/, '')) || '/';

  // 28/8 (user): bo nhan "SDVICO Ops" tren sidebar — brand logo ngay tren da du.
  const main: NavGroup[] = [
    { key: 'tong-quan', label: 'Tổng quan', icon: '📊', href: '/tong-quan', also: ['/noi-dung', '/ke-hoach', '/hang-doi'],
      children: [child('/noi-dung'), child('/ke-hoach'), child('/hang-doi')] },
    // 15/9 (Thanh, kế hoạch sửa web): Khách hàng "đem ra ngoài luôn" — mục riêng trên menu,
    // không còn nằm trong Tổng quan / Bảng bài viết.
    { key: 'khach-hang', label: 'Khách hàng', icon: '🛒', href: '/khach-hang', also: ['/hoi-dap'],
      children: [child('/hoi-dap')] },
    // 2/10: thêm Studio bản tin (trang nhúng Studio chạy trên máy biên tập).
    { key: 'video', label: 'Video', icon: '🎬', href: '/video', also: ['/san-xuat', '/tu-lieu', '/ban-tin'],
      children: [child('/san-xuat'), child('/tu-lieu'), child('/video/da-dang'), child('/ban-tin')] },
    { key: 'seo', label: 'SEO', icon: '🔍', href: '/seo', also: ['/tu-khoa', '/quang-cao', '/du-kien'],
      children: [child('/tu-khoa'), child('/du-kien'), child('/quang-cao'), child('/seo/bai-viet')] },
    { key: 'kenh', label: 'Kênh', icon: '📡', href: '/kenh', also: ['/do-luong', '/ket-noi', '/facebook', '/youtube', '/tiktok'],
      children: [child('/do-luong'), child('/do-luong/tuan'), child('/ket-noi')] },
    // 10/9 (Thanh: "hỏi bot cho vào chung với trang agent cùng với mấy con kia"): bỏ mục Hỏi bot
    // khỏi Hệ thống; khung chat nằm ngay đầu trang /agent, kho ở /hoi-dap; nút nổi ask-bot-fab giữ.
    { key: 'agent', label: 'Agent', icon: '🤖', href: '/agent', also: ['/du-lieu-ai', '/kho-tri-thuc'],
      children: [child('/du-lieu-ai')] }
  ];
  const tuyenDung: NavGroup = {
    key: 'tuyen-dung', label: 'Tuyển dụng', icon: '👥',
    children: [
      { href: '/ho-so', label: 'Hồ sơ ứng viên' },
      { href: '/vi-tri', label: 'Vị trí tuyển dụng' }
    ]
  };
  const heThong: NavGroup = {
    key: 'he-thong', label: 'Hệ thống', icon: '⚙️',
    children: [
      child('/quy-tac'),
      // 29/8 (user): thay link sdvico.vn bang BLOG cua chinh he thong (trang cong khai /blog).
      // 13/9 (Thanh): sdvico.vn/blog da song (anh Thanh len IIS) -> menu tro thang sang do; /blog cua he thong van con.
      { href: 'https://sdvico.vn/blog', label: 'Blog SDVICO', external: true }
    ]
  };
  const groups: NavGroup[] = marketingOnly ? [...main, heThong] : [...main, tuyenDung, heThong];

  // Mục con sáng: khớp dài nhất trên TOÀN menu (/do-luong/tuan thắng /do-luong).
  let best: { gKey: string; href: string; len: number } | null = null;
  for (const g of groups) {
    for (const c of g.children) {
      if (c.external) continue;
      if (p === c.href || p.startsWith(c.href + '/')) {
        if (!best || c.href.length > best.len) best = { gKey: g.key, href: c.href, len: c.href.length };
      }
    }
  }
  // Hàng cha sáng khi đứng ở trang gốc của nhóm (hoặc trang con chưa khai trên menu) và không có mục con nào sáng.
  const root = rootTabFor(p);
  const isRootOn = (g: NavGroup) => {
    if (!g.href) return false;
    if (root) return root === g.href;
    return p === g.href || (g.also || []).some((a) => p === a || p.startsWith(a + '/')) || p.startsWith(g.href + '/');
  };
  const activeKey: string | null = best ? best.gKey : (groups.find(isRootOn)?.key ?? null);

  // Ghi đè do người dùng bấm (true/false). Chưa có ghi đè thì mở đúng nhóm chứa trang đang đứng.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const setOpen = (key: string, v: boolean) => {
    setOverrides((o) => ({ ...o, [key]: v }));
    try { window.sessionStorage.setItem(STORE_PREFIX + key, v ? '1' : '0'); } catch { /* bộ nhớ phiên bị chặn thì thôi, menu vẫn chạy */ }
  };

  // Vào trang / đổi trang: nạp trạng thái đã nhớ, rồi ép nhóm chứa trang đang đứng mở ra.
  useEffect(() => {
    const saved: Record<string, boolean> = {};
    try {
      for (const g of groups) {
        const v = window.sessionStorage.getItem(STORE_PREFIX + g.key);
        if (v === '1') saved[g.key] = true;
        else if (v === '0') saved[g.key] = false;
      }
    } catch { /* bỏ qua */ }
    if (activeKey) {
      saved[activeKey] = true;
      try { window.sessionStorage.setItem(STORE_PREFIX + activeKey, '1'); } catch { /* bỏ qua */ }
    }
    setOverrides((o) => ({ ...saved, ...o, ...(activeKey ? { [activeKey]: true } : {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, p, marketingOnly]);

  const isOpen = (key: string) => (key in overrides ? overrides[key] : key === activeKey);

  return (
    <nav className="nav-groups nav-acc" aria-label="Điều hướng chính">
      {groups.map((g) => {
        const open = isOpen(g.key);
        const subId = `nav-sub-${g.key}`;
        const hasActiveChild = best?.gKey === g.key;
        const rowOn = !best && isRootOn(g);
        const chev = (
          <button
            type="button"
            className="nav-chev"
            aria-expanded={open}
            aria-controls={subId}
            aria-label={`${open ? 'Thu gọn' : 'Mở rộng'} nhóm ${g.label}`}
            onClick={() => setOpen(g.key, !open)}
          >
            <span className="nav-chev-ico" aria-hidden="true" />
          </button>
        );
        return (
          <div className={`nav-acc-group${open ? ' is-open' : ''}`} key={g.key}>
            {g.href ? (
              <div className={`nav-parent${hasActiveChild ? ' has-on' : ''}`}>
                <Link
                  href={g.href}
                  className={`tab nav-parent-link ${rowOn ? 'on' : ''}`}
                  onClick={() => setOpen(g.key, true)}
                >
                  <span className="tab-icon" aria-hidden="true">{g.icon}</span>
                  <span>{g.label}</span>
                </Link>
                {chev}
              </div>
            ) : (
              <button
                type="button"
                className={`tab nav-parent-btn${hasActiveChild ? ' has-on' : ''}`}
                aria-expanded={open}
                aria-controls={subId}
                onClick={() => setOpen(g.key, !open)}
              >
                <span className="tab-icon" aria-hidden="true">{g.icon}</span>
                <span className="nav-parent-label">{g.label}</span>
                <span className="nav-chev-ico" aria-hidden="true" />
              </button>
            )}
            <div className="nav-sub" id={subId}>
              <div className="nav-sub-in">
                {g.children.map((c) =>
                  c.external ? (
                    <a key={c.href} href={c.href} className="tab nav-child" target="_blank" rel="noreferrer" title="Mở trang công khai ở tab mới (người ngoài xem được, không cần đăng nhập)">
                      <span>{c.label} ↗</span>
                    </a>
                  ) : (
                    <Link key={c.href} href={c.href} className={`tab nav-child ${best?.href === c.href ? 'on' : ''}`} aria-current={best?.href === c.href ? 'page' : undefined}>
                      <span>{c.label}</span>
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
