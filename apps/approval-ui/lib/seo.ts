// lib/seo.ts — helper cho SEO public routes (/blog, /san-pham, sitemap).
//
// Ba việc chính:
//   1) slugify: chuyển tiêu đề tiếng Việt có dấu -> slug kebab-case ASCII (dễ URL, dễ SEO)
//   2) siteUrl: base URL production để làm canonical + og:url + sitemap
//   3) loadPublicPosts + loadPublicPost: đọc bài đã ĐĂNG THẬT (mkt_posts.status=published)
//      để render public. Chỉ bài đã đăng mới hiện — bài nháp/duyệt/từ chối KHÔNG hiện
//      (điều cấm 1: máy soạn người bấm, và tránh lộ nội dung chưa duyệt).
//
// Điều cấm 3 (nội dung chạm quy định nhà nước / IUU): bài đã đăng thật đã qua duyệt cấp
// quản lý (needs_gov_review => người quản lý phải bấm ở hàng đợi). Nên bài đã đăng =
// đã qua cổng — không cần lọc lại ở đây.

import type { getServerClient } from './supabase-server';
import { PRODUCT_CATALOG, type ProductItem } from './product-catalog';

type Client = ReturnType<typeof getServerClient>;

const VN_MAP: Record<string, string> = {
  à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a',
  ă: 'a', ằ: 'a', ắ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a',
  â: 'a', ầ: 'a', ấ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a',
  đ: 'd',
  è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e',
  ê: 'e', ề: 'e', ế: 'e', ể: 'e', ễ: 'e', ệ: 'e',
  ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o',
  ô: 'o', ồ: 'o', ố: 'o', ổ: 'o', ỗ: 'o', ộ: 'o',
  ơ: 'o', ờ: 'o', ớ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
  ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u',
  ư: 'u', ừ: 'u', ứ: 'u', ử: 'u', ữ: 'u', ự: 'u',
  ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y'
};

// Bỏ dấu tiếng Việt + hạ chữ thường + gạch nối chỗ khoảng trắng/ký tự lạ + cắt dài.
// URL an toàn cho Google/Facebook/Zalo. Emoji trong tiêu đề bị lột — dùng chữ thuần.
export function slugify(input: string): string {
  const s = String(input || '').toLowerCase();
  const noDia = s.split('').map((ch) => VN_MAP[ch] || ch).join('');
  const cleaned = noDia
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return cleaned || 'bai-viet';
}

// URL base cho canonical + OG. Vercel deploy đặt VERCEL_URL sẵn; production nên đặt
// SITE_URL riêng. Nếu chưa có gì thì rơi về sdvico-mktit.vercel.app (theo memory).
export function siteUrl(): string {
  const explicit = (process.env.SITE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = (process.env.VERCEL_URL || '').trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  return 'https://sdvico-mktit.vercel.app';
}

// Ngày đăng chuẩn ISO cho JSON-LD.
function isoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

export type PublicPost = {
  contentId: string;
  slug: string;              // "<slug-title>-<contentId-first8>"
  title: string;
  excerpt: string;           // 200 ký tự đầu draft, sạch dấu xuống dòng
  body: string;              // draft đầy đủ
  publishedAt: string | null;
  product: string;           // tên sản phẩm cho breadcrumb
  imageUrl: string | null;   // URL public ảnh chính
  fbUrl: string | null;      // link bài trên Facebook (nếu có)
};

function excerptOf(draft: string, max = 200): string {
  const clean = String(draft || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s\S*$/, '') + '…';
}

// Tách "<slug>-<id8>" -> id8 (8 ký tự cuối). Trả null nếu slug không đúng format.
export function contentIdFromSlug(slug: string): string | null {
  const m = String(slug || '').match(/-([a-f0-9]{8})$/);
  return m ? m[1] : null;
}

// Sản phẩm của một bài — dùng lại logic đã có ở week-report.ts.
function productOf(brief: any, title: string, draft: string = ''): string {
  const g = brief?.rotation_group as string | undefined;
  if (brief?.post_kind === 'content' || g === 'Bài content') return 'Bài content';
  if (g && g !== 'Content' && /^\d+\.\s/.test(g)) return g.replace(/^\s*\d+\.\s*/, '').trim();
  return String(brief?.keyword || title || 'SDVICO').trim();
}

// Đọc ảnh CHÍNH của bài (brief.assets.image = brand_assets.id → storage URL public).
async function imageUrlOf(client: Client, assetId: string | null | undefined): Promise<string | null> {
  if (!assetId) return null;
  const { data } = await client.from('brand_assets').select('storage_path').eq('id', assetId).maybeSingle();
  const sp = (data as any)?.storage_path as string | undefined;
  if (!sp) return null;
  return client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
}

// Liệt kê bài PUBLIC (mkt_posts đã publish + có draft hợp lệ). Sắp theo published_at giảm dần.
// Không giới hạn số (SEO cần tất cả), nhưng limit 500 làm ngưỡng an toàn.
export async function loadPublicPosts(client: Client, limit: number = 500): Promise<PublicPost[]> {
  const { data: postRows } = await client
    .from('mkt_posts')
    .select('content_id, channel, external_url, published_at')
    .eq('status', 'published')
    .not('external_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit);
  const byCid = new Map<string, { fbUrl: string | null; publishedAt: string }>();
  for (const p of postRows || []) {
    const cid = (p as any).content_id as string | null;
    if (!cid) continue;
    const isFb = (p as any).channel === 'facebook';
    const cur = byCid.get(cid);
    if (!cur) { byCid.set(cid, { fbUrl: isFb ? String((p as any).external_url || '') : null, publishedAt: String((p as any).published_at || '') }); continue; }
    if (isFb && !cur.fbUrl) cur.fbUrl = String((p as any).external_url || '');
  }
  const cids = [...byCid.keys()];
  if (!cids.length) return [];

  const { data: contents } = await client.from('mkt_content').select('id, title, brief, draft').in('id', cids);
  const posts: PublicPost[] = [];
  for (const c of contents || []) {
    const id = String((c as any).id);
    const title = String((c as any).title || '').trim();
    const draft = String((c as any).draft || '').trim();
    if (!title || draft.length < 30) continue; // bỏ bài tiêu đề trống hoặc quá ngắn không nên public
    const brief = (c as any).brief || {};
    const info = byCid.get(id)!;
    const imageUrl = await imageUrlOf(client, brief?.assets?.image);
    posts.push({
      contentId: id,
      slug: `${slugify(title)}-${id.slice(0, 8)}`,
      title,
      excerpt: excerptOf(draft),
      body: draft,
      publishedAt: isoOrNull(info.publishedAt),
      product: productOf(brief, title, draft),
      imageUrl,
      fbUrl: info.fbUrl
    });
  }
  return posts;
}

// Tìm 1 bài theo slug (kèm id8 hậu tố để tránh trùng tiêu đề).
// Ilike không dùng được trên cột UUID trong Supabase (kiểu uuid không có LIKE operator),
// nên load hết danh sách public rồi filter client-side theo slug. Scale hiện tại vài trăm
// bài; nếu tăng sẽ đổi sang lưu cột slug riêng.
export async function loadPublicPost(client: Client, slug: string): Promise<PublicPost | null> {
  const posts = await loadPublicPosts(client, 500);
  return posts.find((p) => p.slug === slug) || null;
}

// ===== Khớp sản phẩm theo KHÓA CHUẨN HÓA (21/8, design-spec-trang-cong-khai) =====
// Tên nhóm lệch nhau giữa các nơi: brand_assets/rotation_group có số thứ tự ("6. Thiết bị lọc
// dầu SF-50"), danh mục public không số, Thuraya viết "Marine Star" / "MarineStar"... So sánh
// chuỗi thẳng làm trang sản phẩm KHÔNG lấy được ảnh và đếm bài sai. Khóa = slugify bỏ gạch:
// "thurayamarinestarmnb01" — khớp nếu chuỗi cần xét CHỨA khóa của danh mục (hoặc ngược lại
// khi chuỗi xét đủ dài, tránh "sdvico" khớp bừa).
export function normKey(s: string): string {
  return slugify(String(s || '')).replace(/-/g, '');
}
export function isProductOf(item: Pick<ProductItem, 'productGroup' | 'name' | 'aliases'>, value: string): boolean {
  const k = normKey(value);
  if (!k || k === 'baicontent' || k === 'baiviet') return false;
  const keys = [item.productGroup, item.name, ...(item.aliases || [])].map(normKey).filter(Boolean);
  return keys.some((c) => k.includes(c) || (k.length >= 8 && c.includes(k)));
}
export function catalogItemOf(value: string): ProductItem | undefined {
  return PRODUCT_CATALOG.find((c) => isProductOf(c, value));
}
// Tên sản phẩm ĐỂ HIỂN THỊ trên UI công khai: tên ngắn khi khớp danh mục; bài content hoặc bài
// nhập tay (product rơi về keyword/tiêu đề) trả '' để card không lặp lại tiêu đề.
export function displayProduct(product: string): string {
  return catalogItemOf(product)?.shortName || '';
}
// Ngày dd/mm/yyyy giờ VN. Tự ghép từ formatToParts — toLocaleDateString('vi-VN') trên Node
// trả "21-08-2026" (gạch) sai chuẩn Việt.
export function fmtDateVN(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}
