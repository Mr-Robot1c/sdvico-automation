import Link from 'next/link';

// 2/10 (đợt C, audit: /blog ở 320px dài khoảng 31.000px vì dựng cả 80+ bài): mỗi trang 18 bài.
// Dùng ĐƯỜNG DẪN (/blog/trang/2) thay vì ?trang=2 vì searchParams ép trang thành dynamic, mất
// ISR. Mỗi trang là một route tĩnh/ISR riêng, server render, link thật cho Google lần theo.
export const BLOG_PAGE_SIZE = 18;

export function pageCountOf(total: number): number {
  return Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));
}

export function slicePage<T>(items: T[], page: number): T[] {
  const start = (page - 1) * BLOG_PAGE_SIZE;
  return items.slice(start, start + BLOG_PAGE_SIZE);
}

// Trang 1 là `basePath`, trang n >= 2 là `${basePath}/trang/${n}`.
export function pageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}/trang/${page}`;
}

// Đọc tham số [n] của route phân trang: số nguyên >= 1, không thì null (gọi notFound).
export function parsePageParam(n: string): number | null {
  if (!/^\d{1,4}$/.test(n)) return null;
  const v = Number(n);
  return v >= 1 ? v : null;
}

export default function Pager({ basePath, page, pages }: { basePath: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="pub-pager" aria-label="Phân trang">
      {page > 1 ? (
        <Link href={pageHref(basePath, page - 1)} rel="prev" className="pub-pager-prev">Trang trước</Link>
      ) : null}
      <span className="pub-pager-pos">Trang {page} trên {pages}</span>
      {page < pages ? (
        <Link href={pageHref(basePath, page + 1)} rel="next" className="pub-pager-more">Xem thêm bài viết</Link>
      ) : null}
    </nav>
  );
}
