import { getServerClient } from '../../../../lib/supabase-server';
import { loadPublicPosts, publicBlogBase } from '../../../../lib/seo';

// 7/9 (blog giai đoạn 2, plan tuần 7-13/9 mục 4E): SITEMAP CHO sdvico.vn/blog.
// sdvico.vn là SPA tĩnh trên IIS, không tự sinh sitemap; app này biết danh sách bài đã đăng nên
// phục vụ sitemap thay. Google chỉ nhận sitemap chéo tên miền khi robots.txt của sdvico.vn khai
// báo: `Sitemap: https://sdvico-mktit.vercel.app/api/public/sitemap.xml` (repo sdvico-home-page,
// public/robots.txt). URL trong đây là sdvico.vn/blog/<slug>, KHÔNG phải URL app này.
// Chỉ đọc bài đã đăng thật (loadPublicPosts), không cần đăng nhập, cache 10 phút.
export const dynamic = 'force-dynamic';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET() {
  const client = getServerClient();
  let posts: Awaited<ReturnType<typeof loadPublicPosts>> = [];
  try {
    posts = await loadPublicPosts(client, 500);
  } catch {
    posts = [];
  }
  const base = publicBlogBase();
  const now = new Date().toISOString();
  const rows = [
    `<url><loc>${esc(base)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`,
    ...posts.map((p) => {
      let lastmod = now;
      if (p.publishedAt) {
        const d = new Date(p.publishedAt);
        if (!Number.isNaN(d.getTime())) lastmod = d.toISOString();
      }
      return `<url><loc>${esc(`${base}/${p.slug}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
    })
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
    }
  });
}
