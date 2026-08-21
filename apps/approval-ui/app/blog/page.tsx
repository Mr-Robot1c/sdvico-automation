import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerClient } from '../../lib/supabase-server';
import { loadPublicPosts, siteUrl } from '../../lib/seo';
import { PRODUCT_CATALOG } from '../../lib/product-catalog';

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

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return '';
  }
}

export default async function BlogListPage() {
  const client = getServerClient();
  const posts = await loadPublicPosts(client, 200);

  return (
    <main className="blog-article" style={{ maxWidth: 'none' }}>
      <header className="sp-hero">
        <h1>Bài viết SDVICO</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: '1rem', margin: 0 }}>
          Kinh nghiệm dùng thiết bị tàu cá, câu chuyện thực tế và mẹo hay từ SDVICO. Cập nhật liên tục theo bài đăng chính thức của công ty.
        </p>
      </header>

      {/* Chủ đề (topic hub SEO): mỗi sản phẩm một trang gom bài — Google index theo cụm. */}
      <nav aria-label="Chủ đề" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 18px' }}>
        {PRODUCT_CATALOG.map((t) => (
          <Link key={t.slug} href={`/blog/chu-de/${t.slug}`} className="btn ghost sm">{t.name}</Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <div className="empty" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-2)' }}>
          <p>Chưa có bài viết công khai nào. Quay lại sau nhé.</p>
        </div>
      ) : (
        <div className="blog-list">
          {posts.map((p) => (
            <article key={p.contentId} className="blog-card">
              {p.imageUrl ? (
                <Link href={`/blog/${p.slug}`} aria-label={p.title}>
                  <img className="blog-card-img" src={p.imageUrl} alt={p.title} loading="lazy" />
                </Link>
              ) : null}
              <div className="blog-card-body">
                <Link href={`/blog/${p.slug}`} className="blog-card-title">
                  {p.title}
                </Link>
                <div className="blog-card-meta">
                  {p.product && p.product !== 'Bài content' ? `${p.product} · ` : ''}
                  {fmtDate(p.publishedAt)}
                </div>
                <p className="blog-card-excerpt">{p.excerpt}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
