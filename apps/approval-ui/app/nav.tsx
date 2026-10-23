'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES, rootTabFor, ancestorsOf } from '../lib/routes';

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
  children: Child[];
};

const child = (href: string): Child => ({ href, label: ROUTES[href]?.label || href });

const STORE_PREFIX = 'sdvico-nav-open:';

export default function Nav({ marketingOnly = false }: { marketingOnly?: boolean }) {
  const path = usePathname();
  const p = ((path || '/').replace(/\/+$/, '')) || '/';

  // 23/10 (đợt 1 sắp xếp lại, docs/app-map/design-spec-app-noi-bo.md): menu theo VIỆC người dùng làm, 6 mục chính
  // + nhóm Hệ thống thu gọn. Trước là 8 nhóm theo bộ phận kỹ thuật (Agent, Kênh, SEO...), người mới không biết vào đâu.
  const main: NavGroup[] = [
    { key: 'hom-nay', label: 'Hôm nay', icon: '🏠', href: '/tong-quan', children: [] },
    { key: 'duyet-bai', label: 'Duyệt bài', icon: '✅', href: '/noi-dung', children: [] },
    { key: 'ke-hoach', label: 'Kế hoạch', icon: '📅', href: '/ke-hoach', children: [] },
    { key: 'so-lieu', label: 'Số liệu', icon: '📊', href: '/do-luong/tuan',
      children: [child('/do-luong'), child('/kenh'), child('/seo/bai-viet'), child('/video/da-dang')] },
    { key: 'khach-hang', label: 'Khách hàng', icon: '💬', href: '/khach-hang',
      children: [child('/hoi-dap')] },
    { key: 'tu-lieu', label: 'Tư liệu', icon: '🎬', href: '/tu-lieu',
      children: [child('/san-xuat'), child('/video'), child('/ban-tin')] },
  ];
  const heThong: NavGroup = {
    key: 'he-thong', label: 'Hệ thống', icon: '⚙️',
    children: [
      child('/ket-noi'),
      child('/seo'),
      child('/du-kien'),
      child('/quang-cao'),
      child('/agent'),
      child('/hang-doi'),
      ...(marketingOnly ? [] : [child('/ho-so'), child('/vi-tri')]),
      // 13/9 (Thanh): sdvico.vn/blog đã sống, menu trỏ thẳng sang đó.
      { href: 'https://sdvico.vn/blog', label: 'Blog SDVICO', external: true },
    ],
  };
  const groups: NavGroup[] = [...main, heThong];

  // Mục con sáng: khớp với trang đang đứng HOẶC tổ tiên gần nhất của nó trong cây (lib/routes.ts), vd /facebook sáng
  // "Kết nối kênh". Ưu tiên tổ tiên gần nhất, cùng độ gần thì href dài hơn.
  const chain = ancestorsOf(p);
  let best: { gKey: string; href: string; len: number; depth: number } | null = null;
  for (const g of groups) {
    for (const c of g.children) {
      if (c.external) continue;
      const depth = chain.indexOf(c.href);
      if (depth < 0) continue;
      if (!best || depth < best.depth || (depth === best.depth && c.href.length > best.len)) {
        best = { gKey: g.key, href: c.href, len: c.href.length, depth };
      }
    }
  }
  // Hàng cha sáng khi đứng ở trang gốc của nhóm (hoặc trang con chưa khai trên menu) và không có mục con nào sáng.
  const root = rootTabFor(p);
  const isRootOn = (g: NavGroup) => {
    if (!g.href) return false;
    if (root) return root === g.href;
    return p === g.href || p.startsWith(g.href + '/');
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
                {g.children.length ? chev : null}
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
