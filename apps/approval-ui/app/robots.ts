import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/seo';

// robots.txt: cho phép Google/Bing crawl /blog + /san-pham + /privacy + /terms; chặn hẳn
// mọi route nội bộ (hàng đợi duyệt, kế hoạch, hồ sơ...). Basic-auth đã chặn ở server nhưng
// khai báo rõ ràng ở robots.txt để crawler không lãng phí request.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/blog', '/blog/', '/san-pham', '/san-pham/', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/noi-dung',
          '/do-luong',
          '/ke-hoach',
          '/van-hanh',
          '/ho-so',
          '/vi-tri',
          '/kho-tri-thuc',
          '/du-lieu-ai',
          '/tu-lieu',
          '/san-xuat',
          '/facebook',
          '/tiktok'
        ]
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
