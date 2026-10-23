// lib/routes.ts — CÂY TRANG của giao diện duyệt (15/9, kế hoạch "SDVICO sửa web" của Thanh).
// Một nguồn sự thật cho: nhãn breadcrumb, trang cha (nút "← Quay lại"), và mục menu nào sáng.
//
// Luật nút Quay lại (Thanh 15/9): "đang ở Tổng quan/Khách hàng bấm về thì về Tổng quan; đang ở
// Tổng quan/Khách hàng mà bấm qua Agent rồi bấm Quay lại thì về Tổng quan/Khách hàng là SAI".
// => Quay lại = lên TRANG CHA theo cây này, không phải history.back().

export type RouteNode = { label: string; parent: string | null };

// 23/10 (đợt 1 sắp xếp lại, docs/app-map/design-spec-app-noi-bo.md): menu theo VIỆC, 6 mục chính + nhóm Hệ thống.
// Trang gốc của từng mục menu (không có nút Quay lại).
export const ROOT_TABS = ['/tong-quan', '/noi-dung', '/ke-hoach', '/do-luong/tuan', '/khach-hang', '/tu-lieu', '/'];

export const ROUTES: Record<string, RouteNode> = {
  '/': { label: 'Hôm nay', parent: null },
  '/tong-quan': { label: 'Hôm nay', parent: null },
  '/noi-dung': { label: 'Duyệt bài', parent: null },
  '/ke-hoach': { label: 'Kế hoạch', parent: null },
  '/do-luong/tuan': { label: 'Báo cáo tuần', parent: null },
  '/khach-hang': { label: 'Khách hàng', parent: null },
  '/tu-lieu': { label: 'Kho tư liệu', parent: null },

  // Duyệt bài: /hang-doi giờ chỉ còn phiếu KHÔNG phải bài đăng (tin nhắn gửi khách, tin tuyển dụng, bản tin).
  '/hang-doi': { label: 'Phiếu khác', parent: '/noi-dung' },

  // Kế hoạch (23/10: mỗi tab một đường dẫn riêng, thay ?tab=, để bấm tab có khung chờ ngay và chỉ tải dữ liệu của tab đó)
  '/ke-hoach/huong-di': { label: 'Hướng đi', parent: '/ke-hoach' },
  '/ke-hoach/lich-dang': { label: 'Lịch đăng', parent: '/ke-hoach' },
  '/ke-hoach/cai-dat': { label: 'Cài đặt', parent: '/ke-hoach' },
  '/ke-hoach/lich-su': { label: 'Lịch sử', parent: '/ke-hoach' },

  // Số liệu (gốc: Báo cáo tuần)
  '/do-luong': { label: 'Số liệu ngày', parent: '/do-luong/tuan' },
  '/kenh': { label: 'Theo kênh', parent: '/do-luong/tuan' },
  '/kenh/facebook': { label: 'Facebook', parent: '/kenh' },
  '/kenh/youtube': { label: 'YouTube', parent: '/kenh' },
  '/kenh/tiktok': { label: 'TikTok', parent: '/kenh' },
  '/seo/bai-viet': { label: 'Bài blog', parent: '/do-luong/tuan' },
  '/video/da-dang': { label: 'Video đã đăng', parent: '/do-luong/tuan' },

  // Khách hàng
  '/hoi-dap': { label: 'Kho hỏi đáp', parent: '/khach-hang' },

  // Tư liệu
  '/san-xuat': { label: 'Soạn bài tay', parent: '/tu-lieu' },
  '/video': { label: 'Video', parent: '/tu-lieu' },
  '/ban-tin': { label: 'Studio bản tin', parent: '/tu-lieu' },

  // Hệ thống (ít dùng)
  '/ket-noi': { label: 'Kết nối kênh', parent: '/tong-quan' },
  '/facebook': { label: 'Kết nối Facebook', parent: '/ket-noi' },
  '/youtube': { label: 'Kết nối YouTube', parent: '/ket-noi' },
  '/tiktok': { label: 'Kết nối TikTok', parent: '/ket-noi' },
  '/seo': { label: 'SEO', parent: '/tong-quan' },
  '/tu-khoa': { label: 'Kho từ khóa', parent: '/seo' },
  '/du-kien': { label: 'Catalog sản phẩm', parent: '/tong-quan' },
  '/quang-cao': { label: 'Quảng cáo', parent: '/tong-quan' },
  '/agent': { label: 'AI', parent: '/tong-quan' },
  '/huong-dan': { label: 'Hướng dẫn', parent: '/tong-quan' },
  '/kho-tri-thuc': { label: 'Chi tiết AI', parent: '/agent' },
  '/du-lieu-ai': { label: 'Chi tiết AI', parent: '/agent' },
  '/ho-so': { label: 'Hồ sơ ứng viên', parent: '/tong-quan' },
  '/vi-tri': { label: 'Vị trí tuyển dụng', parent: '/tong-quan' },
  '/quy-tac': { label: 'Quy tắc', parent: '/tong-quan' },

  // Trang công khai
  '/privacy': { label: 'Chính sách quyền riêng tư', parent: '/tong-quan' },
  '/terms': { label: 'Điều khoản', parent: '/tong-quan' },
};

// Chuỗi tổ tiên của một trang theo cây (gồm chính nó), để menu sáng đúng mục khi đứng ở trang con không có trên
// menu (vd /facebook -> /ket-noi -> /tong-quan).
export function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  let p: string | null = (path || '/').replace(/\/+$/, '') || '/';
  for (let guard = 0; p && guard < 10; guard++) {
    const hit = routeNodeFor(p);
    if (!hit) break;
    if (hit.key !== p) { out.push(p); p = hit.key; continue; }
    out.push(p);
    p = hit.node.parent;
  }
  return out;
}

// Tìm nút gần nhất: khớp đúng path, không thì cắt dần segment cuối (/kenh/facebook/123 -> /kenh/facebook).
export function routeNodeFor(path: string): { key: string; node: RouteNode } | null {
  let p = (path || '/').replace(/\/+$/, '') || '/';
  while (true) {
    const n = ROUTES[p];
    if (n) return { key: p, node: n };
    const i = p.lastIndexOf('/');
    if (i <= 0) return null;
    p = p.slice(0, i);
  }
}

export function crumbFor(path: string): string {
  return routeNodeFor(path)?.node.label || '';
}

// Trang cha để nút Quay lại nhảy tới. Trang gốc (ROOT_TABS) trả null = không hiện nút.
export function parentFor(path: string): string | null {
  const clean = (path || '/').replace(/\/+$/, '') || '/';
  if (ROOT_TABS.includes(clean)) return null;
  const hit = routeNodeFor(clean);
  if (!hit) return '/tong-quan';
  // Khớp đúng path -> lấy parent khai báo; khớp qua cắt segment (trang chi tiết /x/[id]) -> cha là chính nút đó.
  if (hit.key === clean) return hit.node.parent || '/tong-quan';
  return hit.key;
}

// Mục menu nào sáng: gốc của path theo cây.
export function rootTabFor(path: string): string | null {
  let p: string | null = (path || '/').replace(/\/+$/, '') || '/';
  for (let guard = 0; p && guard < 10; guard++) {
    if (ROOT_TABS.includes(p)) return p === '/' ? '/tong-quan' : p;
    const hit = routeNodeFor(p);
    if (!hit) return null;
    p = hit.key === p ? hit.node.parent : hit.key;
  }
  return null;
}

// 23/10 (đợt 2 sắp xếp lại): mục menu có nhiều trang thì hiện HÀNG TAB đầu trang (app/section-tabs.tsx), menu không còn
// mục con. Nhãn cùng một hàng: 2 chữ, cùng ngữ pháp, không xuống dòng.
export type SectionTab = { href: string; label: string };
export type SectionGroup = { label: string; tabs: SectionTab[] };
export const SECTION_GROUPS: SectionGroup[] = [
  { label: 'Kế hoạch', tabs: [
    { href: '/ke-hoach', label: 'Tuần này' },
    { href: '/ke-hoach/huong-di', label: 'Hướng đi' },
    { href: '/ke-hoach/lich-dang', label: 'Lịch đăng' },
    { href: '/ke-hoach/cai-dat', label: 'Cài đặt' },
    { href: '/ke-hoach/lich-su', label: 'Lịch sử' },
  ] },
  { label: 'Số liệu', tabs: [
    { href: '/do-luong/tuan', label: 'Theo tuần' },
    { href: '/do-luong', label: 'Theo ngày' },
    { href: '/kenh', label: 'Theo kênh' },
    { href: '/seo/bai-viet', label: 'Bài blog' },
    { href: '/video/da-dang', label: 'Video đăng' },
  ] },
  { label: 'Khách hàng', tabs: [
    { href: '/khach-hang', label: 'Hỏi mua' },
    { href: '/hoi-dap', label: 'Hỏi đáp' },
  ] },
  { label: 'Tư liệu', tabs: [
    { href: '/tu-lieu', label: 'Tư liệu' },
    { href: '/san-xuat', label: 'Soạn bài' },
    { href: '/video', label: 'Video AI' },
    { href: '/ban-tin', label: 'Bản tin' },
  ] },
];

// Nhóm tab của trang đang đứng + tab đang sáng (tổ tiên gần nhất trong cây là một tab của nhóm).
export function sectionFor(path: string): { group: SectionGroup; active: string } | null {
  const chain = ancestorsOf(path);
  for (const p of chain) {
    for (const g of SECTION_GROUPS) {
      if (g.tabs.some((t) => t.href === p)) return { group: g, active: p };
    }
  }
  return null;
}
