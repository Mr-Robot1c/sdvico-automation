import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerClient } from '../../../lib/supabase-server';
import { catalogItemOf, fmtDateVN, isProductOf, loadPublicPost, loadPublicPosts, siteUrl } from '../../../lib/seo';
import { loadAdsConfig, messengerUrl, zaloUrl } from '../../../lib/ads-config';
import { safeJsonLd } from '../../../lib/jsonld';
import ContactButtons from '../../contact-buttons';
import PostCard from '../post-card';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type Props = { params: { slug: string } };

// Meta OG + canonical để Facebook/Google/Zalo hiện đúng khi share link bài.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const client = getServerClient();
  const post = await loadPublicPost(client, params.slug);
  if (!post) return { title: 'Không tìm thấy bài viết — SDVICO' };
  const url = `${siteUrl()}/blog/${post.slug}`;
  return {
    title: `${post.title} — SDVICO`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url,
      type: 'article',
      siteName: 'SDVICO',
      images: post.imageUrl ? [{ url: post.imageUrl }] : [],
      publishedTime: post.publishedAt || undefined
    },
    alternates: { canonical: url }
  };
}

// Trang đọc bài (design-spec-trang-cong-khai màn 2): đa số vào từ link share Facebook bằng
// điện thoại -> tiêu đề + ảnh trên fold, thân bài ~68 ký tự/dòng, 1 khối CTA (primary duy nhất)
// rồi 3 bài khác (cùng sản phẩm trước, không có thì bài mới nhất).
export default async function BlogDetailPage({ params }: Props) {
  const client = getServerClient();
  const [posts, ads] = await Promise.all([loadPublicPosts(client, 500), loadAdsConfig()]);
  const post = posts.find((p) => p.slug === params.slug);
  if (!post) notFound();

  const item = catalogItemOf(post.product);
  const others = posts.filter((p) => p.contentId !== post.contentId);
  const related = [
    ...(item ? others.filter((p) => isProductOf(item, p.product)) : []),
    ...others
  ].filter((p, i, arr) => arr.findIndex((x) => x.contentId === p.contentId) === i).slice(0, 3);

  const url = `${siteUrl()}/blog/${post.slug}`;
  // JSON-LD BlogPosting cho Google hiểu bài là bài viết + tác giả + ngày đăng.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.imageUrl ? [post.imageUrl] : undefined,
    datePublished: post.publishedAt || undefined,
    author: { '@type': 'Organization', name: 'SDVICO', url: siteUrl() },
    publisher: { '@type': 'Organization', name: 'SDVICO', url: siteUrl() },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <article className="pub-read">
        <nav className="pub-crumb" aria-label="Đường dẫn">
          <Link href="/blog">Bài viết</Link>
          {item ? (
            <>
              <span aria-hidden="true">/</span>
              <Link href={`/blog/chu-de/${item.slug}`}>{item.shortName}</Link>
            </>
          ) : null}
        </nav>
        <h1>{post.title}</h1>
        <div className="pub-read-meta">
          {item ? <span className="pub-chip">{item.shortName}</span> : null}
          {post.publishedAt ? <time dateTime={post.publishedAt}>{fmtDateVN(post.publishedAt)}</time> : null}
          {post.fbUrl ? (
            <a href={post.fbUrl} target="_blank" rel="noopener noreferrer">Xem trên Facebook</a>
          ) : null}
        </div>
        {post.imageUrl ? (
          <img className="pub-read-hero" src={post.imageUrl} alt={post.title} />
        ) : null}
        <div className="pub-read-body">{post.body}</div>

        <div className="pub-cta">
          <h2>Cần tư vấn thiết bị tàu cá?</h2>
          <p>Nhắn tin cho Page hoặc gọi tổng đài, SDVICO tư vấn, báo giá và lắp đặt tận bến.</p>
          <ContactButtons
            messengerUrl={messengerUrl(ads.messengerUsername, { source: 'blog', campaign: post.slug })}
            zaloUrl={zaloUrl(ads.zaloOaId)}
            campaign={`blog:${post.product}`}
          />
        </div>
      </article>

      {related.length ? (
        <section className="pub-section" aria-label="Bài khác">
          <h2>Bài khác</h2>
          <div className="pub-grid">
            {related.map((p) => <PostCard key={p.contentId} post={p} />)}
          </div>
        </section>
      ) : null}
    </>
  );
}
