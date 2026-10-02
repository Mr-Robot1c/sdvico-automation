import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicClient } from '../../lib/supabase-server';
import { loadPublicPosts } from '../../lib/seo';
import { PRODUCT_CATALOG } from '../../lib/product-catalog';
import PostCard from './post-card';
import Pager, { pageCountOf, slicePage } from './pager';

// Danh sách bài công khai (design-spec-trang-cong-khai màn 1): tiêu đề + 1 dòng phụ ngắn,
// hàng chip chủ đề tên ngắn, lưới thẻ 3/2/1 cột, 18 bài mỗi trang (đợt C 2/10).
// Dùng chung cho /blog (trang 1) và /blog/trang/[n]. Server component, không cookies/headers.
export default async function BlogListView({ page }: { page: number }) {
  const client = getPublicClient();
  const posts = await loadPublicPosts(client, 500);
  const pages = pageCountOf(posts.length);
  // Trang vượt số trang thật (kể cả khi chưa có bài nào mà ai đó gõ /blog/trang/5) thì 404.
  if (page > pages) notFound();
  const shown = slicePage(posts, page);

  return (
    <main>
      <header className="pub-head">
        <h1>Bài viết</h1>
        <p>Kinh nghiệm thiết bị tàu cá và chuyện nghề biển</p>
      </header>

      <nav className="pub-chips" aria-label="Chủ đề">
        <Link key="chuyen-nghe-bien" href="/blog/chu-de/chuyen-nghe-bien">Chuyện nghề</Link>
        {PRODUCT_CATALOG.map((t) => (
          <Link key={t.slug} href={`/blog/chu-de/${t.slug}`}>{t.shortName}</Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <div className="pub-empty">
          <p>Chưa có bài viết</p>
          <Link href="/san-pham">Xem sản phẩm SDVICO</Link>
        </div>
      ) : (
        <>
          <div className="pub-grid">
            {shown.map((p) => <PostCard key={p.contentId} post={p} />)}
          </div>
          <Pager basePath="/blog" page={page} pages={pages} />
        </>
      )}
    </main>
  );
}
