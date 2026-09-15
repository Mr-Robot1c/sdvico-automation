// lib/routes.ts — CÂY TRANG của giao diện duyệt (15/9, kế hoạch "SDVICO sửa web" của Thanh).
// Một nguồn sự thật cho: nhãn breadcrumb, trang cha (nút "← Quay lại"), và mục menu nào sáng.
//
// Luật nút Quay lại (Thanh 15/9): "đang ở Tổng quan/Khách hàng bấm về thì về Tổng quan; đang ở
// Tổng quan/Khách hàng mà bấm qua Agent rồi bấm Quay lại thì về Tổng quan/Khách hàng là SAI".
// => Quay lại = lên TRANG CHA theo cây này, không phải history.back().

export type RouteNode = { label: string; parent: string | null };

// Trang gốc của từng mục menu (không có nút Quay lại).
export const ROOT_TABS = ['/tong-quan', '/khach-hang', '/video', '/seo', '/kenh', '/agent', '/'];

export const ROUTES: Record<string, RouteNode> = {
  '/': { label: 'Tổng quan', parent: null },
  '/tong-quan': { label: 'Tổng quan', parent: null },
  '/khach-hang': { label: 'Khách hàng', parent: null },
  '/video': { label: 'Video', parent: null },
  '/seo': { label: 'SEO', parent: null },
  '/kenh': { label: 'Kênh', parent: null },
  '/agent': { label: 'Agent', parent: null },

  // Con của Tổng quan
  '/noi-dung': { label: 'Bảng bài viết', parent: '/tong-quan' },
  '/ke-hoach': { label: 'Kế hoạch', parent: '/tong-quan' },
  '/hang-doi': { label: 'Hàng đợi duyệt', parent: '/tong-quan' },
  '/quy-tac': { label: 'Quy tắc', parent: '/tong-quan' },

  // Con của Khách hàng
  '/hoi-dap': { label: 'Kho hỏi đáp', parent: '/khach-hang' },

  // Con của Video
  '/san-xuat': { label: 'Xưởng sản xuất', parent: '/video' },
  '/tu-lieu': { label: 'Kho tư liệu', parent: '/video' },

  // Con của SEO
  '/tu-khoa': { label: 'Kho từ khóa', parent: '/seo' },
  '/du-kien': { label: 'Nguồn dữ kiện', parent: '/seo' },
  '/quang-cao': { label: 'Quảng cáo', parent: '/seo' },
  '/seo/bai-viet': { label: 'Bài SEO đã đăng', parent: '/seo' },

  // Con của Kênh
  '/do-luong': { label: 'Đo lường ngày', parent: '/kenh' },
  '/do-luong/tuan': { label: 'Báo cáo tuần', parent: '/do-luong' },
  '/ket-noi': { label: 'Kết nối', parent: '/kenh' },
  '/facebook': { label: 'Kết nối Facebook', parent: '/kenh' },
  '/youtube': { label: 'Kết nối YouTube', parent: '/kenh' },
  '/tiktok': { label: 'Kết nối TikTok', parent: '/kenh' },
  '/kenh/facebook': { label: 'Facebook', parent: '/kenh' },
  '/kenh/youtube': { label: 'YouTube', parent: '/kenh' },
  '/kenh/tiktok': { label: 'TikTok', parent: '/kenh' },

  // Con của Agent
  '/du-lieu-ai': { label: 'Nguồn học dữ liệu', parent: '/agent' },
  '/kho-tri-thuc': { label: 'Nguồn học dữ liệu', parent: '/agent' },

  // Tuyển dụng (khi không marketingOnly)
  '/ho-so': { label: 'Hồ sơ ứng viên', parent: '/tong-quan' },
  '/vi-tri': { label: 'Vị trí tuyển dụng', parent: '/tong-quan' },

  // Trang công khai
  '/privacy': { label: 'Chính sách quyền riêng tư', parent: '/tong-quan' },
  '/terms': { label: 'Điều khoản', parent: '/tong-quan' },
};

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
