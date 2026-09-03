import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerClient } from '../../lib/supabase-server';
import { loadPublicPosts, siteUrl } from '../../lib/seo';
import { PRODUCT_CATALOG } from '../../lib/product-catalog';
import PostCard from './post-card';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 phut — bai moi hien nhanh, khong go tay

const SITE_TITLE = 'Bài viết SDVICO — Công nghệ số cho tàu cá';
const SITE_DESC = 'Kinh nghiệm sử dụng thiết bị tàu cá, mẹo tiết kiệm dầu, nước ngọt ngoài khơi và câu chuyện thực tế của ngư dân do SDVICO chia sẻ.';

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESC,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    type: 'website',
    url: `${siteUrl()}/blog`,
    siteName: 'SDVICO'
  },
  alternates: { canonical: `${siteUrl()}/blog` }
};

// Danh sách bài công khai (design-spec-trang-cong-khai màn 1): tiêu đề + 1 dòng phụ ngắn,
// hàng chip chủ đề tên ngắn, lưới thẻ 3/2/1 cột. Không câu thuyết minh dài.
export default async function BlogListPage() {
  const client = getServerClient();
  const posts = await loadPublicPosts(client, 200);

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
        <div className="pub-grid">
          {posts.map((p) => <PostCard key={p.contentId} post={p} />)}
        </div>
      )}
    </main>
  );
}
