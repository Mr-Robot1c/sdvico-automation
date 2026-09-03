import Link from 'next/link';
import type { Metadata } from 'next';
import { PRODUCT_CATALOG } from '../../lib/product-catalog';
import { isProductOf, optImg, siteUrl } from '../../lib/seo';
import { getServerClient } from '../../lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 phut

const TITLE = 'Sản phẩm SDVICO — Thiết bị tàu cá và ngành biển';
const DESC = 'Danh mục thiết bị tàu cá SDVICO phân phối và lắp đặt: giám sát hành trình, điện thoại vệ tinh, máy lọc nước biển, thiết bị lọc dầu, dầu nhớt.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, url: `${siteUrl()}/san-pham`, type: 'website', siteName: 'SDVICO' },
  alternates: { canonical: `${siteUrl()}/san-pham` }
};

// Đếm bài đã đăng + lấy 1 ảnh đại diện cho MỖI sản phẩm (design-spec màn 4: card có ảnh thật).
// 21/8: khớp theo isProductOf vì tên nhóm trong brand_assets/rotation_group có số thứ tự
// ("6. Thiết bị lọc dầu SF-50") — so chuỗi thẳng như trước ra 0 ảnh, 0 bài.
async function loadCardData(): Promise<{ counts: Record<string, number>; images: Record<string, string> }> {
  const client = getServerClient();
  const [{ data: postRows }, { data: assetRows }] = await Promise.all([
    client.from('mkt_posts').select('content_id, mkt_content!inner(brief)').eq('status', 'published').limit(500),
    client.from('brand_assets').select('storage_path, product_group').eq('kind', 'image').not('product_group', 'is', null).order('created_at', { ascending: true }).limit(300)
  ]);
  const counts: Record<string, number> = {};
  const images: Record<string, string> = {};
  for (const p of PRODUCT_CATALOG) {
    const seen = new Set<string>();
    for (const row of (postRows || []) as any[]) {
      const g = row.mkt_content?.brief?.rotation_group as string | undefined;
      const cid = String(row.content_id || '');
      if (!g || !cid || seen.has(cid) || !isProductOf(p, g)) continue;
      seen.add(cid);
    }
    counts[p.slug] = seen.size;
    const img = ((assetRows || []) as any[]).find((a) => a.storage_path && isProductOf(p, String(a.product_group || '')));
    if (img) images[p.slug] = client.storage.from('brand-assets').getPublicUrl(img.storage_path).data.publicUrl;
  }
  return { counts, images };
}

export default async function ProductListPage() {
  const { counts, images } = await loadCardData();
  return (
    <main>
      <header className="pub-head">
        <h1>Sản phẩm</h1>
        <p>Thiết bị cho tàu cá: SDVICO tự sản xuất hoặc phân phối và lắp đặt</p>
      </header>
      <section className="pub-grid" aria-label="Danh mục sản phẩm">
        {PRODUCT_CATALOG.map((p) => (
          <Link key={p.slug} href={`/san-pham/${p.slug}`} className="pub-card pub-pcard">
            <span className="pub-card-media">
              {images[p.slug] ? (
                <img src={optImg(images[p.slug], 640) || undefined} alt={p.name} loading="lazy" />
              ) : (
                <span className="pub-card-ph" aria-hidden="true"><img src="/logo-sdvico.png" alt="" /></span>
              )}
            </span>
            <span className="pub-card-body">
              <span className="pub-card-meta">
                <span className={`pub-badge ${p.role === 'san-xuat' ? 'make' : 'dist'}`}>{p.role === 'san-xuat' ? 'Sản xuất' : 'Phân phối'}</span>
                {p.role === 'phan-phoi' && p.hangGoc ? <span>Hãng {p.hangGoc}</span> : <span>Bởi SDVICO</span>}
              </span>
              <span className="pub-card-title">{p.name}</span>
              <span className="pub-card-excerpt">{p.short}</span>
              <span className="pub-card-foot">{counts[p.slug] ? `${counts[p.slug]} bài chia sẻ` : 'Xem chi tiết'}</span>
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
