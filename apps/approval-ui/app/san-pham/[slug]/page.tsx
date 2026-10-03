import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { findProductBySlug, PRODUCT_CATALOG } from '../../../lib/product-catalog';
import { isProductOf, loadPublicPosts, optImg, optImgAbs, selfCanonicalUrl, siteUrl, type PublicPost } from '../../../lib/seo';
import { getPublicClient } from '../../../lib/supabase-server';
import { loadAdsConfig, messengerUrl, zaloUrl } from '../../../lib/ads-config';
import { safeJsonLd } from '../../../lib/jsonld';
import { PUBLIC_HOTLINE_DISPLAY, PUBLIC_HOTLINE_TEL } from '../../../lib/public-contact';
import ContactButtons from '../../contact-buttons';
import PostCard from '../../blog/post-card';
import { assetPublicUrl } from '../../../lib/asset-url';

// 2/10 (audit production: trang san pham 6,5 giay moi het skeleton, co trang 15 giay): NGUYEN NHAN
// = `force-dynamic` de len `revalidate` + getServerClient ep fetch no-store => moi luot xem chay
// lai 3 truy van Supabase (brand_assets 300 dong, mkt_posts + mkt_content 500 bai, app_config)
// tren ham lanh. Gio: getPublicClient + bo force-dynamic + generateStaticParams (cuoi file) =>
// ISR that. Trang khong dung cookies/headers/searchParams. Noi dung chinh (H1, mo ta, anh, CTA)
// nam san trong HTML may chu.
export const revalidate = 600;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = findProductBySlug(params.slug);
  if (!p) return { title: 'Không tìm thấy sản phẩm | SDVICO' };
  const url = `${siteUrl()}/san-pham/${p.slug}`;
  const title = `${p.name} | SDVICO`;
  // og:image = ảnh sản phẩm đầu tiên (URL tuyệt đối). Lỗi đọc ảnh thì bỏ ảnh, meta vẫn đủ.
  let ogImage: string | null = null;
  try {
    ogImage = optImgAbs((await loadImages(p))[0], 1200);
  } catch {
    ogImage = null;
  }
  return {
    title,
    description: p.short,
    openGraph: {
      title,
      description: p.short,
      url,
      type: 'website',
      siteName: 'SDVICO',
      ...(ogImage ? { images: [{ url: ogImage, alt: p.name }] } : {})
    },
    twitter: { card: ogImage ? 'summary_large_image' : 'summary', title, description: p.short, ...(ogImage ? { images: [ogImage] } : {}) },
    // 2/10 (audit lan 3): canonical = SELF. sdvico.vn la SPA tra cung 1 shell cho moi duong dan
    // (xem lib/seo.ts selfCanonicalUrl); chi chuyen lai khi sdvico.vn render noi dung tuong duong tung URL.
    alternates: { canonical: selfCanonicalUrl(`/san-pham/${p.slug}`) }
  };
}

type ProductKey = { productGroup: string; name: string; aliases?: string[] };

// Ảnh sản phẩm: tối đa 6 ảnh brand_assets khớp nhóm (isProductOf — tên nhóm trong kho có số
// thứ tự nên eq thẳng như trước trả 0 ảnh).
async function loadImages(p: ProductKey): Promise<string[]> {
  const client = getPublicClient();
  const { data } = await client
    .from('brand_assets')
    .select('storage_path, product_group')
    .eq('kind', 'image')
    .not('product_group', 'is', null)
    .order('created_at', { ascending: true })
    .limit(300);
  return ((data || []) as any[])
    .filter((a) => a.storage_path && isProductOf(p, String(a.product_group || '')))
    .slice(0, 6)
    .map((a) => assetPublicUrl(client, a.storage_path));
}

async function loadRelatedPosts(p: ProductKey): Promise<PublicPost[]> {
  const client = getPublicClient();
  const posts = await loadPublicPosts(client, 200);
  return posts.filter((x) => isProductOf(p, x.product)).slice(0, 3);
}

// Trang sản phẩm (design-spec màn 5): hero 2 cột (ảnh + vai trò + tên + 1 đoạn + CTA primary
// duy nhất), lợi ích, vai trò SDVICO (điều cấm 4), ảnh thêm, bài liên quan. Cuối trang chỉ
// 1 dòng liên hệ dạng link, không nút đặc thứ hai.
export default async function ProductDetailPage({ params }: Props) {
  const p = findProductBySlug(params.slug);
  if (!p) notFound();

  const [images, related, ads] = await Promise.all([loadImages(p), loadRelatedPosts(p), loadAdsConfig(getPublicClient())]);

  const url = selfCanonicalUrl(`/san-pham/${p.slug}`); // khớp canonical (self)
  // JSON-LD Product: name, image, description, brand. CỐ Ý KHÔNG có `offers`/giá/availability:
  // luật công ty (chính sách giá 9/9 + điều cấm 5) chỉ cho công khai mốc úp mở, số giá chính xác
  // không lên bài công khai; một Offer không giá còn bị Google coi là thiếu trường. brand: sản
  // phẩm SDVICO tự làm thì SDVICO, thiết bị phân phối thì hãng gốc (điều cấm 4, không nhận vơ).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.intro,
    image: images.length ? images.map((src) => optImgAbs(src, 1200) || src) : undefined,
    brand: { '@type': 'Brand', name: p.role === 'san-xuat' ? 'SDVICO' : (p.hangGoc || 'SDVICO') },
    url
  };
  const isMake = p.role === 'san-xuat';

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <main>
        <nav className="pub-crumb" aria-label="Đường dẫn">
          <Link href="/san-pham">Sản phẩm</Link>
          <span aria-hidden="true">/</span>
          <span>{p.shortName}</span>
        </nav>

        <section className="pub-hero">
          <div className="pub-hero-media">
            {images[0] ? (
              <img src={optImg(images[0], 1080) || undefined} alt={p.name} decoding="async" />
            ) : (
              <span className="pub-card-ph" aria-hidden="true"><img src="/logo-sdvico.png" alt="" loading="lazy" decoding="async" /></span>
            )}
          </div>
          <div>
            <div className="pub-card-meta">
              <span className={`pub-badge ${isMake ? 'make' : 'dist'}`}>{isMake ? 'Sản phẩm SDVICO' : 'Phân phối'}</span>
              <span>{isMake ? (p.vaiTro || 'Sản phẩm SDVICO') :`SDVICO phân phối và lắp đặt, hãng ${p.hangGoc}`}</span>
            </div>
            <h1>{p.name}</h1>
            <p>{p.intro}</p>
            <ContactButtons
              messengerUrl={messengerUrl(ads.messengerUsername, { source: 'san_pham', campaign: p.slug })}
              zaloUrl={zaloUrl(ads.zaloOaId)}
              campaign={`san_pham:${p.slug}`}
            />
          </div>
        </section>

        <div className="pub-read">
          <section className="pub-section" style={{ marginTop: 0 }}>
            <h2>Lợi ích cho bà con</h2>
            <ul className="pub-list">
              {p.loiIch.map((l, i) => (<li key={i}>{l}</li>))}
            </ul>
          </section>

          <section className="pub-section">
            <h2>Vai trò của SDVICO</h2>
            <p className="pub-callout">{p.luuY}</p>
          </section>
        </div>

        {images.length > 1 ? (
          <section className="pub-section">
            <h2>Ảnh sản phẩm và lắp đặt</h2>
            <div className="pub-gallery">
              {images.slice(1).map((src, i) => (<img key={i} src={optImg(src, 640) || undefined} alt={`${p.name} ${i + 2}`} loading="lazy" decoding="async" />))}
            </div>
          </section>
        ) : null}

        {related.length ? (
          <section className="pub-section">
            <h2>Bài viết về {p.shortName}</h2>
            <div className="pub-grid">
              {related.map((r) => <PostCard key={r.contentId} post={r} hideProduct />)}
            </div>
          </section>
        ) : null}

        <p className="pub-note">
          Cần tư vấn {p.shortName}? Gọi <a href={PUBLIC_HOTLINE_TEL}>{PUBLIC_HOTLINE_DISPLAY}</a> hoặc xem <Link href="/san-pham">sản phẩm khác</Link>.
        </p>
      </main>
    </>
  );
}

// Sinh sẵn params cho tất cả sản phẩm (Next 14 tối ưu build).
export function generateStaticParams() {
  return PRODUCT_CATALOG.map((p) => ({ slug: p.slug }));
}
