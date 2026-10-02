import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicClient } from '../../../lib/supabase-server';
import { displayProduct, isProductOf, loadPublicPosts, siteUrl } from '../../../lib/seo';
import { findProductBySlug, PRODUCT_CATALOG } from '../../../lib/product-catalog';
import { safeJsonLd } from '../../../lib/jsonld';
import PostCard from '../post-card';
import Pager, { pageCountOf, slicePage } from '../pager';

// TRANG CHỦ ĐỀ (topic hub) cho SEO — user 20/8: "trang tổng hợp theo từ khóa".
// Mỗi sản phẩm một trang /blog/chu-de/<slug> gom toàn bộ bài thuộc sản phẩm + link trang sản
// phẩm. Google thích cụm trang cùng chủ đề liên kết chặt (bài -> hub -> trang sản phẩm).
// 21/8: khớp bài theo isProductOf (khóa chuẩn hóa) thay vì so chuỗi; hàng chip giữ nguyên ở
// trên với chip hiện tại sáng (design-spec màn 3).
// 2/10 (đợt C): tách thành view dùng chung cho trang 1 (/blog/chu-de/<slug>) và các trang sau
// (/blog/chu-de/<slug>/trang/<n>), 18 bài mỗi trang.

// 3/9: chủ đề ảo "Chuyện nghề biển" gom bài content (không thuộc sản phẩm nào) — nhóm bài
// đông nhất trên blog mà trước không lọc được. Không có trang sản phẩm đi kèm.
export const STORY_TOPIC = {
  slug: 'chuyen-nghe-bien',
  name: 'Chuyện nghề biển',
  shortName: 'Chuyện nghề',
  short: 'Câu chuyện, kinh nghiệm đời đi biển của bà con ngư dân.',
};
export const isStory = (slug: string) => slug === STORY_TOPIC.slug;

export function topicOf(slug: string) {
  return isStory(slug) ? STORY_TOPIC : findProductBySlug(slug);
}

export async function loadTopicPosts(slug: string) {
  const p = topicOf(slug);
  if (!p) return null;
  const posts = await loadPublicPosts(getPublicClient(), 500);
  return isStory(slug)
    ? posts.filter((x) => !displayProduct(x.product))
    : posts.filter((x) => isProductOf(p as any, x.product));
}

export default async function TopicHubView({ slug, page }: { slug: string; page: number }) {
  const p = topicOf(slug);
  if (!p) notFound();

  const matched = (await loadTopicPosts(slug)) || [];
  const pages = pageCountOf(matched.length);
  if (page > pages) notFound();
  const shown = slicePage(matched, page);

  const url = `${siteUrl()}/blog/chu-de/${p.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${p.name} — bài viết và kinh nghiệm`,
    description: p.short,
    url,
    hasPart: shown.slice(0, 20).map((m) => ({ '@type': 'BlogPosting', headline: m.title, url: `${siteUrl()}/blog/${m.slug}` }))
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <main>
        <nav className="pub-crumb" aria-label="Đường dẫn">
          <Link href="/blog">Bài viết</Link>
          <span aria-hidden="true">/</span>
          <span>{p.shortName}</span>
        </nav>
        <header className="pub-head">
          <h1>{p.name}</h1>
          <p>{p.short}{' '}{isStory(slug) ? null : <Link href={`/san-pham/${p.slug}`}>Xem trang sản phẩm</Link>}</p>
        </header>

        <nav className="pub-chips" aria-label="Chủ đề">
          <Link key={STORY_TOPIC.slug} href={`/blog/chu-de/${STORY_TOPIC.slug}`} className={isStory(slug) ? 'on' : ''} aria-current={isStory(slug) ? 'page' : undefined}>
            {STORY_TOPIC.shortName}
          </Link>
          {PRODUCT_CATALOG.map((t) => (
            <Link key={t.slug} href={`/blog/chu-de/${t.slug}`} className={t.slug === p.slug ? 'on' : ''} aria-current={t.slug === p.slug ? 'page' : undefined}>
              {t.shortName}
            </Link>
          ))}
        </nav>

        {matched.length === 0 ? (
          <div className="pub-empty">
            <p>Chưa có bài viết về {p.shortName}</p>
            {isStory(slug) ? <Link href="/blog">Xem tất cả bài viết</Link> : <Link href={`/san-pham/${p.slug}`}>Xem trang sản phẩm</Link>}
          </div>
        ) : (
          <>
            <div className="pub-grid">
              {shown.map((m) => <PostCard key={m.contentId} post={m} hideProduct />)}
            </div>
            <Pager basePath={`/blog/chu-de/${p.slug}`} page={page} pages={pages} />
          </>
        )}
      </main>
    </>
  );
}
