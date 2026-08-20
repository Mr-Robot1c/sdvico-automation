import Link from 'next/link';
import type { Metadata } from 'next';
import { PRODUCT_CATALOG } from '../../lib/product-catalog';
import { siteUrl } from '../../lib/seo';
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

// Đếm số bài đăng chính thức cho mỗi sản phẩm (dựa mkt_content.brief.rotation_group)
// để card sản phẩm hiện "Đã đăng N bài" — bà con thấy sản phẩm đang được nói tới nhiều.
async function loadPostCounts(): Promise<Record<string, number>> {
  const client = getServerClient();
  const { data } = await client
    .from('mkt_posts')
    .select('content_id, mkt_content!inner(brief)')
    .eq('status', 'published')
    .limit(500);
  const counts: Record<string, number> = {};
  for (const row of (data || []) as any[]) {
    const g = row.mkt_content?.brief?.rotation_group as string | undefined;
    if (!g) continue;
    const key = g.replace(/^\s*\d+\.\s*/, '').trim();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export default async function ProductListPage() {
  const counts = await loadPostCounts();
  return (
    <main>
      <header className="sp-hero">
        <h1>Sản phẩm SDVICO</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: '1rem', margin: 0 }}>
          Thiết bị công nghệ cho ngư dân và tàu cá. SDVICO vừa nghiên cứu và sản xuất, vừa phân phối và lắp đặt thiết bị của các hãng đối tác. Chúng tôi phân biệt rõ vai trò trên từng sản phẩm để bà con nắm.
        </p>
      </header>
      <section className="sp-list">
        {PRODUCT_CATALOG.map((p) => (
          <Link key={p.slug} href={`/san-pham/${p.slug}`} className="sp-card">
            <div>
              <h3>{p.name}</h3>
              <div style={{ color: 'var(--ink-2)', fontSize: '.85rem', marginTop: 4 }}>
                {p.role === 'san-xuat' ? '🔧 SDVICO sản xuất' : `🚚 SDVICO phân phối · ${p.hangGoc}`}
              </div>
            </div>
            <p className="sp-card-desc">{p.short}</p>
            <div className="sp-card-count">
              {counts[p.productGroup] ? `Đã có ${counts[p.productGroup]} bài chia sẻ về sản phẩm này.` : 'Xem chi tiết sản phẩm →'}
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
