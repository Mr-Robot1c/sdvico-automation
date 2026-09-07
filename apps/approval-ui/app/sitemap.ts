import type { MetadataRoute } from 'next';
import { getServerClient } from '../lib/supabase-server';
import { siteUrl } from '../lib/seo';
import { PRODUCT_CATALOG } from '../lib/product-catalog';

// sitemap.xml tự động cho SEO — Next.js 14 (item 2d, 20/8):
//   /san-pham, /san-pham/<slug> (7 sản phẩm), /blog/chu-de/<slug>, /privacy, /terms.
// KHÔNG list các trang duyệt nội bộ (/, /noi-dung, /do-luong...) vì đã khoá basic-auth.
// 7/9 (blog giai đoạn 2): BỎ /blog và /blog/<slug> khỏi sitemap này vì canonical của chúng đã
// trỏ sdvico.vn (sitemap chỉ nên chứa URL canonical). Bài blog nằm ở /api/public/sitemap.xml
// (URL sdvico.vn/blog/...), robots.txt bên sdvico.vn khai báo sitemap đó.
export const dynamic = 'force-dynamic';
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const client = getServerClient();
  void client; // giữ client cho các mục cần DB sau này; bài blog đã chuyển sang /api/public/sitemap.xml
  const now = new Date();

  const items: MetadataRoute.Sitemap = [
    { url: `${base}/san-pham`, changeFrequency: 'weekly', priority: 0.9, lastModified: now },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3, lastModified: now },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3, lastModified: now }
  ];

  for (const p of PRODUCT_CATALOG) {
    items.push({ url: `${base}/san-pham/${p.slug}`, changeFrequency: 'weekly', priority: 0.8, lastModified: now });
    // Trang chủ đề (topic hub) gom bài theo sản phẩm — SEO cụm nội dung (20/8).
    items.push({ url: `${base}/blog/chu-de/${p.slug}`, changeFrequency: 'daily', priority: 0.8, lastModified: now });
  }
  return items;
}
