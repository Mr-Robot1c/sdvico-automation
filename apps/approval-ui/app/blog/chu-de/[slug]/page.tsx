import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerClient } from '../../../../lib/supabase-server';
import { loadPublicPosts, siteUrl } from '../../../../lib/seo';
import { findProductBySlug, PRODUCT_CATALOG } from '../../../../lib/product-catalog';

export const dynamic = 'force-dynamic';
export const revalidate = 600;

// TRANG CHỦ ĐỀ (topic hub) cho SEO — user 20/8: "trang tổng hợp theo từ khóa".
// Mỗi sản phẩm một trang /blog/chu-de/<slug> gom: đoạn giới thiệu theo từ khóa + toàn bộ
// bài viết thuộc sản phẩm + link trang sản phẩm. Google thích cụm trang cùng chủ đề nội bộ
// liên kết chặt (bài -> hub -> trang sản phẩm) hơn là bài rời rạc.

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
  const key = p.productGroup.toLowerCase();
  const matched = posts.filter((x) => x.product.toLowerCase() === key || x.product.toLowerCase().includes(key.replace(/^\d+\.\s*/, '')));

  const url = `${siteUrl()}/blog/chu-de/${p.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${p.name} — bài viết và kinh nghiệm`,
    description: p.short,
    url,
    hasPart: matched.slice(0, 20).map((m) => ({ '@type': 'BlogPosting', headline: m.title, url: `${siteUrl()}/blog/${m.slug}` }))
  };

  function fmtDate(iso: string | null): string {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }); } catch { return ''; }
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="blog-article" style={{ maxWidth: 'none' }}>
        <nav aria-label="Đường dẫn" style={{ fontSize: '.85rem', color: 'var(--ink-2)', marginBottom: 8 }}>
          <Link href="/blog" style={{ color: 'var(--ink-2)' }}>Bài viết</Link> · Chủ đề: {p.name}
        </nav>
        <header className="sp-hero">
          <h1>{p.name}: bài viết và kinh nghiệm</h1>
          <p style={{ color: 'var(--ink-2)', margin: 0 }}>
            {p.short} Xem <Link href={`/san-pham/${p.slug}`}>trang sản phẩm {p.name}</Link> để biết lợi ích và cách lắp đặt.
          </p>
        </header>

        {matched.length === 0 ? (
          <p className="sub">Chưa có bài viết nào cho chủ đề này. Quay lại sau nhé.</p>
        ) : (
          <div className="blog-list">
            {matched.map((m) => (
              <article key={m.contentId} className="blog-card">
                {m.imageUrl ? (
                  <Link href={`/blog/${m.slug}`} aria-label={m.title}>
                    <img className="blog-card-img" src={m.imageUrl} alt={m.title} loading="lazy" />
                  </Link>
                ) : null}
                <div className="blog-card-body">
                  <Link href={`/blog/${m.slug}`} className="blog-card-title">{m.title}</Link>
                  <div className="blog-card-meta">{fmtDate(m.publishedAt)}</div>
                  <p className="blog-card-excerpt">{m.excerpt}</p>
                </div>
              </article>
            ))}
          </div>
        )}

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: '1.2rem' }}>Chủ đề khác</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRODUCT_CATALOG.filter((x) => x.slug !== p.slug).map((x) => (
              <Link key={x.slug} href={`/blog/chu-de/${x.slug}`} className="btn ghost sm">{x.name}</Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

export function generateStaticParams() {
  return PRODUCT_CATALOG.map((p) => ({ slug: p.slug }));
}
