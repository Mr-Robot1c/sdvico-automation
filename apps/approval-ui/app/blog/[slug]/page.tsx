import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerClient } from '../../../lib/supabase-server';
import { loadPublicPost, siteUrl } from '../../../lib/seo';

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

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return '';
  }
}

export default async function BlogDetailPage({ params }: Props) {
  const client = getServerClient();
  const post = await loadPublicPost(client, params.slug);
  if (!post) notFound();

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="blog-article">
        <nav aria-label="Đường dẫn" style={{ fontSize: '.85rem', color: 'var(--ink-2)', marginBottom: 8 }}>
          <Link href="/blog" style={{ color: 'var(--ink-2)' }}>Bài viết</Link>
          {post.product && post.product !== 'Bài content' ? <> · {post.product}</> : null}
        </nav>
        <h1>{post.title}</h1>
        <div className="blog-meta">Đăng ngày {fmtDate(post.publishedAt)}</div>
        {post.imageUrl ? (
          <img className="blog-hero" src={post.imageUrl} alt={post.title} />
        ) : null}
        <div className="blog-body">{post.body}</div>
        {post.fbUrl ? (
          <p style={{ marginTop: 20, fontSize: '.9rem' }}>
            Xem bài này trên{' '}
            <a href={post.fbUrl} target="_blank" rel="noopener noreferrer">Facebook</a>.
          </p>
        ) : null}
        <div className="sp-cta">
          <b>Cần tư vấn thiết bị tàu cá?</b>
          <p style={{ margin: '6px 0 0' }}>
            Nhắn tin cho <a href="https://www.facebook.com/sdvico.tbtc" target="_blank" rel="noopener noreferrer">Page SDVICO</a>{' '}
            hoặc gọi tổng đài <a href="tel:19002323 49">1900 23 23 49</a> để được tư vấn, báo giá và lắp đặt tận bến.
          </p>
        </div>
      </article>
    </>
  );
}
