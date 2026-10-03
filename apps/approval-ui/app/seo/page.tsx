import { Suspense } from 'react';
import Link from 'next/link';
import { publicBlogUrl } from '../../lib/seo';
import { SeoPostsBlock, SeoKeywordsBlock, SeoHealthBlock, SeoGoogleQueriesBlock, BlockLoading } from './blocks';

// 27/8 REDESIGN (docx "redesign web" cua sep) — trang SEO: bai da dang len web cong khai
// (/blog), kho tu khoa, va suc khoe SEO (sitemap, audit gan nhat). Y chang layout SEO cua
// ForLife Ops nhung dung du lieu SDVICO.
// 3/10 (đợt 2 việc 3): trang là VỎ — đầu trang hiện ngay, 4 khối tự tải song song trong Suspense (app/seo/blocks.tsx),
// khối nào chậm/lỗi thì báo riêng khối đó kèm Thử lại. Trước: chờ đủ 7 truy vấn qua 2 vòng nối tiếp mới hiện gì.
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <main>
      <header className="head-row">
        <div>
          <h1>SEO</h1>
          <p className="sub">Bài viết công khai trên web (Google đọc được), kho từ khóa và sức khỏe SEO. Bài blog sinh từ dây chuyền nội dung.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={publicBlogUrl()} target="_blank" rel="noreferrer" className="btn ghost">🌐 Mở trang Bài viết ↗</a>
          <Link href="/tu-khoa" className="btn ghost">🔑 Kho từ khóa</Link>
          <Link href="/quang-cao" className="btn ghost">📣 Quảng cáo / đo lường</Link>
        </div>
      </header>

      <Suspense fallback={<BlockLoading title="Bài SEO đã đăng" rows={5} />}>
        <SeoPostsBlock />
      </Suspense>

      <div className="blk-cols">
        <Suspense fallback={<BlockLoading title="Từ khóa mới thêm" />}>
          <SeoKeywordsBlock />
        </Suspense>
        <Suspense fallback={<BlockLoading title="Sức khỏe SEO" />}>
          <SeoHealthBlock />
        </Suspense>
      </div>

      <Suspense fallback={<BlockLoading title="Từ khóa trên Google (28 ngày)" rows={4} />}>
        <SeoGoogleQueriesBlock />
      </Suspense>
    </main>
  );
}
