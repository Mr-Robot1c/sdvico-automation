import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerClient } from '../../../../lib/supabase-server';
import { isProductOf, loadPublicPosts, siteUrl } from '../../../../lib/seo';
import { findProductBySlug, PRODUCT_CATALOG } from '../../../../lib/product-catalog';
import { safeJsonLd } from '../../../../lib/jsonld';
import PostCard from '../../post-card';

export const dynamic = 'force-dynamic';
export const revalidate = 600;

// TRANG CHỦ ĐỀ (topic hub) cho SEO — user 20/8: "trang tổng hợp theo từ khóa".
// Mỗi sản phẩm một trang /blog/chu-de/<slug> gom toàn bộ bài thuộc sản phẩm + link trang sản
// phẩm. Google thích cụm trang cùng chủ đề liên kết chặt (bài -> hub -> trang sản phẩm).
// 21/8: khớp bài theo isProductOf (khóa chuẩn hóa) thay vì so chuỗi; hàng chip giữ nguyên ở
// trên với chip hiện tại sáng (design-spec màn 3).

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = findProductBySlug(params.slug);
  if (!p) return { title: 'Không tìm thấy chủ đề — SDVICO' };
  const url = `${siteUrl()}/blog/chu-de/${p.slug}`;
  const title = `${p.name} — bài viết và kinh nghiệm | SDVICO`;
  return {
    title,
    description: `Tổng hợp bài viết, kinh nghiệm sử dụng và câu chuyện thực tế về ${p.name} cho tàu cá. ${p.short}`,
    openGraph: { title, description: p.short, url, type: 'website', siteName: 'SDVICO' },
    alternates: { canonical: url }
  };
}

export default async function TopicHubPage({ params }: Props) {
  const p = findProductBySlug(params.slug);
  if (!p) notFound();

  const client = getServerClient();
  const posts = await loadPublicPosts(client, 300);
  const matched = posts.filter((x) => isProductOf(p, x.product));

  const url = `${siteUrl()}/blog/chu-de/${p.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${p.name} — bài viết và kinh nghiệm`,
    description: p.short,
    url,
    hasPart: matched.slice(0, 20).map((m) => ({ '@type': 'BlogPosting', headline: m.title, url: `${siteUrl()}/blog/${m.slug}` }))
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
          <p>{p.short} <Link href={`/san-pham/${p.slug}`}>Xem trang sản phẩm</Link></p>
        </header>

        <nav className="pub-chips" aria-label="Chủ đề">
          {PRODUCT_CATALOG.map((t) => (
            <Link key={t.slug} href={`/blog/chu-de/${t.slug}`} className={t.slug === p.slug ? 'on' : ''} aria-current={t.slug === p.slug ? 'page' : undefined}>
              {t.shortName}
            </Link>
          ))}
        </nav>

        {matched.length === 0 ? (
          <div className="pub-empty">
            <p>Chưa có bài viết về {p.shortName}</p>
            <Link href={`/san-pham/${p.slug}`}>Xem trang sản phẩm</Link>
          </div>
        ) : (
          <div className="pub-grid">
            {matched.map((m) => <PostCard key={m.contentId} post={m} hideProduct />)}
          </div>
        )}
      </main>
    </>
  );
}

export function generateStaticParams() {
  return PRODUCT_CATALOG.map((p) => ({ slug: p.slug }));
}
