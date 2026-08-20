import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { findProductBySlug, PRODUCT_CATALOG } from '../../../lib/product-catalog';
import { siteUrl } from '../../../lib/seo';
import { getServerClient } from '../../../lib/supabase-server';
import { loadAdsConfig, messengerUrl, zaloUrl } from '../../../lib/ads-config';
import ContactButtons from '../../contact-buttons';

export const dynamic = 'force-dynamic';
export const revalidate = 600;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = findProductBySlug(params.slug);
  if (!p) return { title: 'Không tìm thấy sản phẩm — SDVICO' };
  const url = `${siteUrl()}/san-pham/${p.slug}`;
  const title = `${p.name} — SDVICO`;
  return {
    title,
    description: p.short,
    openGraph: { title, description: p.short, url, type: 'website', siteName: 'SDVICO' },
    alternates: { canonical: url }
  };
}

// Ảnh sản phẩm: lấy tối đa 6 ảnh từ brand_assets khớp product_group (dùng làm gallery).
async function loadImages(productGroup: string): Promise<string[]> {
  const client = getServerClient();
  const { data } = await client
    .from('brand_assets')
    .select('storage_path, kind, product_group')
    .eq('product_group', productGroup)
    .eq('kind', 'image')
    .limit(6);
  return (data || [])
    .map((a: any) => a.storage_path)
    .filter(Boolean)
    .map((sp: string) => client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl);
}

// Bài blog liên quan cho sản phẩm này (3 bài mới nhất khớp product_group).
async function loadRelatedPosts(productGroup: string): Promise<Array<{ slug: string; title: string; publishedAt: string | null }>> {
  const client = getServerClient();
  const { loadPublicPosts } = await import('../../../lib/seo');
  const posts = await loadPublicPosts(client, 200);
  const key = productGroup.toLowerCase();
  return posts
    .filter((p) => p.product.toLowerCase() === key || p.product.toLowerCase().includes(key))
    .slice(0, 3)
    .map((p) => ({ slug: p.slug, title: p.title, publishedAt: p.publishedAt }));
}

export default async function ProductDetailPage({ params }: Props) {
  const p = findProductBySlug(params.slug);
  if (!p) notFound();

  const [images, related, ads] = await Promise.all([loadImages(p.productGroup), loadRelatedPosts(p.productGroup), loadAdsConfig()]);

  const url = `${siteUrl()}/san-pham/${p.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.short,
    image: images.length ? images : undefined,
    brand: { '@type': 'Organization', name: p.role === 'san-xuat' ? 'SDVICO' : (p.hangGoc || 'SDVICO') },
    offers: {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'SDVICO', url: siteUrl() }
    },
    url
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="sp-detail">
        <nav aria-label="Đường dẫn" style={{ fontSize: '.85rem', color: 'var(--ink-2)', marginBottom: 8 }}>
          <Link href="/san-pham" style={{ color: 'var(--ink-2)' }}>Sản phẩm</Link> · {p.name}
        </nav>
        <h1>{p.name}</h1>
        <div style={{ color: 'var(--ink-2)', fontSize: '.95rem', margin: '4px 0 16px' }}>
          {p.role === 'san-xuat' ? '🔧 SDVICO nghiên cứu và sản xuất' : `🚚 SDVICO phân phối và lắp đặt · Hãng gốc: ${p.hangGoc}`}
        </div>
        {images[0] ? (
          <img src={images[0]} alt={p.name} style={{ width: '100%', maxHeight: 400, objectFit: 'cover', borderRadius: 12, marginBottom: 20 }} />
        ) : null}
        <div className="sp-body">
          <p>{p.intro}</p>
          <h2>Lợi ích cho bà con</h2>
          <ul>
            {p.loiIch.map((l, i) => (<li key={i}>{l}</li>))}
          </ul>
          <h2>Vai trò SDVICO</h2>
          <p style={{ background: 'var(--bg-2, #f0f6ff)', padding: 14, borderLeft: '4px solid var(--accent, #1f5fbf)', borderRadius: 8 }}>
            {p.luuY}
          </p>
        </div>

        {images.length > 1 ? (
          <>
            <h2 style={{ marginTop: 24, fontSize: '1.3rem' }}>Ảnh sản phẩm và lắp đặt</h2>
            <div className="sp-gallery">
              {images.slice(1).map((src, i) => (<img key={i} src={src} alt={`${p.name} ${i + 2}`} loading="lazy" />))}
            </div>
          </>
        ) : null}

        {related.length ? (
          <>
            <h2 style={{ marginTop: 24, fontSize: '1.3rem' }}>Bài viết liên quan</h2>
            <ul>
              {related.map((r) => (
                <li key={r.slug}><Link href={`/blog/${r.slug}`}>{r.title}</Link></li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="sp-cta">
          <b>Muốn lắp đặt sản phẩm này?</b>
          <p style={{ margin: '6px 0 10px' }}>
            Nhắn tin cho Page SDVICO hoặc gọi tổng đài để được tư vấn, báo giá và lắp đặt tận bến.
          </p>
          <ContactButtons
            messengerUrl={messengerUrl(ads.messengerUsername, { source: 'san_pham', campaign: p.slug })}
            zaloUrl={zaloUrl(ads.zaloOaId)}
            campaign={`san_pham:${p.slug}`}
          />
        </div>
      </article>
    </>
  );
}

// Sinh sẵn params cho tất cả sản phẩm (Next 14 tối ưu build).
export function generateStaticParams() {
  return PRODUCT_CATALOG.map((p) => ({ slug: p.slug }));
}
