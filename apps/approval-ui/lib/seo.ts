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
  // 30/8 (audit H2): fallback cũ trả keyword/NGUYÊN TIÊU ĐỀ -> cột "Sản phẩm" trang SEO đổ
  // nguyên câu rồi cắt cụt. Giờ chỉ nhận keyword NGẮN (tên sản phẩm thật); không rõ thì trả
  // '' — nơi hiển thị tự quyết ('—' ở bảng, blog card vốn đã lọc qua displayProduct).
  const kw = String(brief?.keyword || '').trim();
  if (kw && kw.length <= 48 && !/[.!?…]/.test(kw)) return kw;
  return '';
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

  // 28/8 chiều (user: blog hiện bài đã bỏ vào Thùng rác): lọc deleted_at — trước đây bài
  // soft-delete vẫn nằm trên blog vì query này không nhìn cột đó.
  const { data: contents } = await client
    .from('mkt_content')
    .select('id, title, brief, draft')
    .in('id', cids)
    .is('deleted_at', null);

  // 28/8 (user: "cac hinh anh da mat tieu"): nhieu bai (bai video, bai trend, bai nhap tay)
  // KHONG co brief.assets.image -> card blog roi ve placeholder logo het. Fallback: lay anh
  // KHO theo san pham cua bai (brand_assets kind=image cung folder), chon on dinh theo
  // contentId de moi bai 1 anh co dinh giua cac lan render. Van con thieu -> folder Content.
  const { data: poolRows } = await client
    .from('brand_assets')
    .select('id, storage_path, product_group, source')
    .eq('kind', 'image')
    .not('product_group', 'eq', 'Bài trend')
    .order('created_at', { ascending: false })
    .limit(300);
  type PoolImg = { storage_path: string; source?: string | null };
  const normName = (s: string) => String(s || '').replace(/^\s*\d+\.\s*/, '').trim().toLowerCase();
  const poolByGroup = new Map<string, PoolImg[]>();
  const poolAll: PoolImg[] = [];
  for (const a of (poolRows || []) as any[]) {
    const g = normName(a.product_group);
    if (!poolByGroup.has(g)) poolByGroup.set(g, []);
    poolByGroup.get(g)!.push(a);
    poolAll.push(a);
  }
  // 28/8 chiều (user: 2 bài không liên quan cùng mang ảnh Zalo ăn mì): ảnh nhập từ Zalo là
  // ảnh chat đời thường — CHỈ được làm cover khi nằm ĐÚNG folder sản phẩm của bài (ảnh lắp
  // đặt thật); tuyệt đối không vào pool dự phòng CHUNG. Pool chung cạn thì thà placeholder logo.
  // So TIỀN TỐ: source thật trong kho là 'zalo-auto' / 'zalo-backlog-tkkd' (không phải 'zalo' trần).
  const noZalo = (arr: PoolImg[]) => arr.filter((a) => !String(a.source || '').startsWith('zalo'));
  const publicUrlOf = (sp: string) => client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
  // Chống TRÙNG ảnh giữa các thẻ trong cùng một trang danh sách (user 28/8 chụp 2 card y hệt):
  // ảnh nào đã cấp cho 1 bài thì bài sau dò tiếp vị trí kế trong pool; pool cạn mới cho lặp.
  const usedCovers = new Set<string>();
  const stablePick = (arr: PoolImg[], cid: string) => {
    if (!arr.length) return null;
    const n = parseInt(cid.replace(/-/g, '').slice(0, 8), 16) || 0;
    for (let k = 0; k < arr.length; k++) {
      const cand = arr[(n + k) % arr.length];
      if (!usedCovers.has(publicUrlOf(cand.storage_path))) return cand;
    }
    return arr[n % arr.length]; // toàn pool đã dùng — chấp nhận lặp còn hơn trống
  };

  const posts: PublicPost[] = [];
  for (const c of contents || []) {
    const id = String((c as any).id);
    const title = String((c as any).title || '').trim();
    const draft = String((c as any).draft || '').trim();
    if (!title || draft.length < 30) continue; // bỏ bài tiêu đề trống hoặc quá ngắn không nên public
    const brief = (c as any).brief || {};
    const info = byCid.get(id)!;
    // 28/8 tối (user): blog ĐƯỢC dùng ảnh link ngoài (Google/Unsplash) khi bài mang image_url
    // — miễn hợp bài; ảnh kho vẫn là fallback khi không có.
    let imageUrl = String(brief?.assets?.image_url || '') || await imageUrlOf(client, brief?.assets?.image);
    if (!imageUrl) {
      const prodKey = normName(productOf(brief, title, draft));
      const prodPool = poolByGroup.get(prodKey)
        || [...poolByGroup.entries()].find(([g]) => g && (prodKey.includes(g) || g.includes(prodKey)))?.[1];
      const pool = (prodPool && prodPool.length)
        ? prodPool
        : (() => { const generic = noZalo(poolByGroup.get('content') || []); return generic.length ? generic : noZalo(poolAll); })();
      const pick = stablePick(pool, id);
      if (pick) imageUrl = publicUrlOf(pick.storage_path);
    }
    if (imageUrl) usedCovers.add(imageUrl);
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

// ===== 3/9 GIẢM EGRESS: ảnh Supabase đi qua /_next/image của chính app =====
// Chỉ proxy URL bucket public của Supabase; nguồn khác (Unsplash, ảnh local /public) giữ
// nguyên vì không tốn egress Supabase. w chỉ dùng 640 (thẻ), 1080 (hero), 1200 (og) —
// nằm trong bộ deviceSizes mặc định của Next, số khác sẽ bị /_next/image trả 400.
const SUPA_PUB_PREFIX = `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/storage/v1/object/public/`;
export function optImg(url: string | null | undefined, w: 640 | 1080 | 1200 = 640): string | null {
  const u = String(url || '');
  if (!u) return null;
  if (!process.env.SUPABASE_URL || !u.startsWith(SUPA_PUB_PREFIX)) return u;
  return `/_next/image?url=${encodeURIComponent(u)}&w=${w}&q=70`;
}
// Bản TUYỆT ĐỐI cho og:image + JSON-LD (Facebook/Google đòi URL đầy đủ).
export function optImgAbs(url: string | null | undefined, w: 640 | 1080 | 1200 = 1200): string | null {
  const o = optImg(url, w);
  if (!o) return null;
  return o.startsWith('http') ? o : `${siteUrl()}${o}`;
}
