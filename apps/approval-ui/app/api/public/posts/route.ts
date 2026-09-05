import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { loadPublicPosts, siteUrl } from '../../../../lib/seo';

// 4/9: API JSON CONG KHAI, CHI DOC, cho sdvico.vn (SPA Vite tren IIS) hien blog tu he Marketing.
// Chi tra bai DA DANG (mkt_posts status=published) - dung nguon voi trang /blog cua app.
// Khong can dang nhap (middleware bo qua /api/*), khong doc bang nao khac. Cache 5 phut o CDN.
export const dynamic = 'force-dynamic';

const ALLOWED_ORIGINS = ['https://sdvico.vn', 'https://www.sdvico.vn', 'http://localhost:8080'];
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
  };
}

function paragraphsOf(body: string): string[] {
  return String(body || '').split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const client = getServerClient();
  const all = await loadPublicPosts(client, 500);
  const base = siteUrl();
  const map = (p: (typeof all)[number]) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    paragraphs: paragraphsOf(p.body),
    publishedAt: p.publishedAt,
    tag: p.product || 'Chia sẻ',
    imageUrl: p.imageUrl,
    sourceUrl: `${base}/blog/${p.slug}`,
  });
  const headers = corsHeaders(req.headers.get('origin'));
  if (slug) {
    const one = all.find((p) => p.slug === slug);
    if (!one) return NextResponse.json({ post: null }, { status: 404, headers });
    return NextResponse.json({ post: map(one) }, { headers });
  }
  return NextResponse.json({ posts: all.slice(0, limit).map(map), total: all.length }, { headers });
}
