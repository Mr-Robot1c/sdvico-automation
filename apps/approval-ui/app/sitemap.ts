import type { MetadataRoute } from 'next';
import { getServerClient } from '../lib/supabase-server';
import { loadPublicPosts, siteUrl } from '../lib/seo';
import { PRODUCT_CATALOG } from '../lib/product-catalog';

// sitemap.xml tự động cho SEO — Next.js 14 (item 2d, 20/8):
//   /, /blog, /blog/<slug> (mọi bài đã đăng), /san-pham, /san-pham/<slug> (7 sản phẩm),
//   /privacy, /terms.
// KHÔNG list các trang duyệt nội bộ (/, /noi-dung, /do-luong...) vì đã khoá basic-auth.
export const dynamic = 'force-dynamic';
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const client = getServerClient();
  let posts: Awaited<ReturnType<typeof loadPublicPosts>> = [];
  try {
    posts = await loadPublicPosts(client, 500);
  } catch {
    posts = [];
  }
  const now = new Date();

  const items: MetadataRoute.Sitemap = [
    { url: `${base}/blog`, changeFrequency: 'daily', priority: 0.9, lastModified: now },
    { url: `${base}/san-pham`, changeFrequency: 'weekly', priority: 0.9, lastModified: now },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3, lastModified: now },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3, lastModified: now }
  ];

  for (const p of PRODUCT_CATALOG) {
    items.push({ url: `${base}/san-pham/${p.slug}`, changeFrequency: 'weekly', priority: 0.8, lastModified: now });
    // Trang chủ đề (topic hub) gom bài theo sản phẩm — SEO cụm nội dung (20/8).
    items.push({ url: `${base}/blog/chu-de/${p.slug}`, changeFrequency: 'daily', priority: 0.8, lastModified: now });
  }
  for (const p of posts) {
    items.push({
      url: `${base}/blog/${p.slug}`,
      changeFrequency: 'weekly',
      priority: 0.7,
      lastModified: p.publishedAt ? new Date(p.publishedAt) : now
    });
  }

  return items;
}
