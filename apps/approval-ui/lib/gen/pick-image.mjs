// pick-image.mjs — chọn ẢNH KHỚP CHỦ ĐỀ cho bài content (không bán).
//
// User 18/8: "đang hỏi đáp thiết bị giám sát hành trình mà lấy ảnh tàu cá chung chung —
// lấy ảnh mạng hoặc từ folder khác cho phù hợp context". Trước đây rotate lấy ngẫu nhiên
// trong folder 'Content'.
//
// 26/8 (user chốt): đổi kho ảnh sang GOOGLE CUSTOM SEARCH (phủ tốt keyword tiếng Việt +
// ảnh Việt Nam), Unsplash làm fallback. Thứ tự mới:
//   1. Chủ đề/tiêu đề nhắc tới sản phẩm SDVICO (guessGroup) -> ảnh trong folder sản phẩm đó.
//   2. Google CSE với keyword TIẾNG VIỆT (Gemini sinh) + filter CC (license an toàn:
//      publicdomain/attribute/sharealike/noncommercial/nonderived). Cần GOOGLE_CSE_API_KEY
//      + GOOGLE_CSE_ID (Programmable Search Engine với "Search entire web" + "Image search" ON).
//   3. Unsplash fallback với keyword TIẾNG ANH (Gemini sinh cùng lượt). Cần UNSPLASH_ACCESS_KEY.
//   4. Cuối cùng mới rơi về ngẫu nhiên folder 'Content' như cũ.
// Trả { id, via: 'product' | 'google-cse' | 'unsplash' | 'content-folder' | null, note }.
// Dùng chung cho app/api/rotate/route.ts và scripts/rotate-now.mjs (module JS thuần).

import { guessGroup } from './products.mjs';
import { logTokenUsage } from './token-log.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
const BUCKET = 'brand-assets';

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function productName(g) { return String(g || '').replace(/^\s*\d+\.\s*/, '').trim(); }

// 26/8 refactor (user chốt Google CSE + Unsplash): sinh CẢ 2 keyword trong 1 lượt gọi Gemini.
// - `vi` cho Google CSE (ảnh Việt Nam tốt với keyword tiếng Việt).
// - `en` cho Unsplash (kho ảnh phương Tây, tiếng Anh tốt hơn).
// Cả 2 phải bám SỰ VIỆC/HIỆN TƯỢNG trong bài, không chung chung ("tàu cá" / "fishing boat").
// Trả { vi, en }. Lỗi -> fallback từ khóa chung.
async function imageKeywordsFor(topicText, client = null, bodyHint = '') {
  const fallback = { vi: 'tàu cá ngư dân Việt Nam', en: 'fishing boat vietnam' };
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const bodyBlock = bodyHint ? `Nội dung bài (đọc kỹ để nắm SỰ VIỆC/HIỆN TƯỢNG):\n${String(bodyHint).slice(0, 800)}\n` : '';
    const res = await ai.models.generateContent({
      model: MKT_MODEL,
      contents: [
        `Tiêu đề bài đăng cho ngư dân Việt Nam: "${topicText}".`,
        bodyBlock,
        'Sinh 2 câu tìm kiếm ảnh: 1 tiếng VIỆT (Google Images tìm ảnh Việt Nam) + 1 tiếng ANH (Unsplash).',
        'Cả 2 phải bám SỰ VIỆC/HIỆN TƯỢNG cụ thể trong bài, không chung chung.',
        'VN đúng (bám sự việc): "kim phun tàu cá bám cặn dầu", "mạch điện tàu gỉ sét muối biển", "cạn nước ngọt giữa biển", "cặn dầu diesel đóng đặc", "ngư dân trúng luồng cá đêm".',
        'EN đúng (bám sự việc): "marine electronics corrosion", "diesel injector clogged carbon", "salt water damage boat panel", "fresh water tank empty ocean", "abundant fish catch".',
        'CẤM chung (dùng khi bài không có sự việc cụ thể): "tàu cá" / "biển" / "ngư dân" / "fishing boat vietnam" / "sea ocean" / "fisherman".',
        'Nếu bài về THIẾT BỊ/HỎNG HÓC/RỦI RO: keyword phải chứa từ hiện tượng đó (rỉ sét/hỏng/bám cặn/rò rỉ tiếng Việt; rust/corrosion/leak/damage/clogged tiếng Anh). Nếu về TIỀN/HIỆU QUẢ: "tiết kiệm dầu"/"money"/"fuel gauge". Nếu về TỰ HÀO: "trúng cá"/"abundant catch"/"sunrise fishing".',
        'Chỉ trả về JSON: {"vi":"...","en":"..."} không thêm chữ.',
      ].filter(Boolean).join('\n'),
      config: { responseMimeType: 'application/json', temperature: 0.3 },
    });
    logTokenUsage(client, 'creator_pick_image', MKT_MODEL, res?.usageMetadata);
    const m = (res.text || '').match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const j = JSON.parse(m[0]);
    return {
      vi: String(j.vi || '').trim() || fallback.vi,
      en: String(j.en || '').trim() || fallback.en,
    };
  } catch {
    return fallback;
  }
}

// Google Custom Search API — 100 request/ngày free. Cần GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID
// (Programmable Search Engine phải bật "Search entire web" + "Image search" trong control panel).
// Filter rights = tất cả loại Creative Commons (an toàn bản quyền) — user chốt 26/8.
async function searchGoogleCSE(query) {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return null;
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('num', '10');
  url.searchParams.set('imgSize', 'large');
  url.searchParams.set('safe', 'active');
  // CC bao gồm: public domain, attribution, sharealike, noncommercial, nonderived.
  url.searchParams.set('rights', 'cc_publicdomain,cc_attribute,cc_sharealike,cc_noncommercial,cc_nonderived');
  const r = await fetch(url.toString());
  if (!r.ok) return null;
  const j = await r.json();
  const items = Array.isArray(j.items) ? j.items : [];
  return items.length ? items : null;
}

// Tải ảnh Google CSE về Storage + brand_assets. Ghi source URL vào license_note để trace lại
// (dù filter CC nhưng vẫn nên biết nguồn phòng khi chủ ảnh khiếu nại).
async function saveGoogleCseToAssets(client, item, titleHint) {
  const url = item?.link;
  if (!url) return null;
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || item?.mime || 'image/jpeg';
  const ext = ct.includes('png') ? 'png' : 'jpg';
  const safe = String(titleHint || 'gcse').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  const path = `${Date.now()}-${safe}.${ext}`;
  const up = await client.storage.from(BUCKET).upload(path, buf, { contentType: ct });
  if (up.error) return null;
  const contextLink = item?.image?.contextLink || '';
  const displayLink = item?.displayLink || '';
  const { data, error } = await client
    .from('brand_assets')
    .insert({
      kind: 'image',
      title: `${titleHint || 'Ảnh minh họa'} (Google/${displayLink})`,
      storage_path: path,
      license: 'cc',
      license_note: contextLink ? `Google CSE CC: ${contextLink}` : `Google CSE CC (${displayLink})`,
      source: 'google-cse',
      product_group: 'Content',
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id;
}

async function searchUnsplash(query) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const r = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&content_filter=high&client_id=${key}`
  );
  if (!r.ok) return null;
  const j = await r.json();
  const results = Array.isArray(j.results) ? j.results : [];
  return results.length ? results : null;
}

// Tải ảnh Unsplash về Storage + brand_assets (folder Content) để dùng như ảnh nhà.
async function saveUnsplashToAssets(client, photo, titleHint) {
  const url = photo?.urls?.regular;
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || 'image/jpeg';
  const ext = ct.includes('png') ? 'png' : 'jpg';
  const safe = String(titleHint || 'unsplash').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  const path = `${Date.now()}-${safe}.${ext}`;
  const up = await client.storage.from(BUCKET).upload(path, buf, { contentType: ct });
  if (up.error) return null;
  const author = photo?.user?.name || null;
  const { data, error } = await client
    .from('brand_assets')
    .insert({
      kind: 'image',
      title: `${titleHint || 'Ảnh minh họa'} (Unsplash)`,
      storage_path: path,
      license: 'licensed',
      license_note: author ? `Unsplash: ${author}` : 'Unsplash',
      source: 'unsplash',
      product_group: 'Content',
    })
    .select('id')
    .single();
  if (error || !data) return null;
  // Unsplash yêu cầu ping download_location khi dùng ảnh (điều khoản API).
  const dl = photo?.links?.download_location;
  if (dl && process.env.UNSPLASH_ACCESS_KEY) {
    fetch(`${dl}${dl.includes('?') ? '&' : '?'}client_id=${process.env.UNSPLASH_ACCESS_KEY}`).catch(() => {});
  }
  return data.id;
}

// Chọn 1 ảnh trong pool, NÉ ảnh đã dùng gần đây (user 22/8: ảnh bài content không được trùng
// trong 14 ngày). recentlyUsed: Map<assetId, lastUsedISO>. Còn ảnh chưa dùng -> random trong đó;
// hết sạch (folder nhỏ) -> lấy ảnh dùng LÂU NHẤT (ít trùng nhất có thể) thay vì random.
function pickFresh(imgs, recentlyUsed) {
  if (!imgs.length) return null;
  if (!recentlyUsed || !recentlyUsed.size) return pickRandom(imgs);
  const fresh = imgs.filter((i) => !recentlyUsed.has(i.id));
  if (fresh.length) return pickRandom(fresh);
  const oldest = imgs.slice().sort((a, b) => String(recentlyUsed.get(a.id) || '').localeCompare(String(recentlyUsed.get(b.id) || '')));
  return oldest[0];
}

// folders: Map<product_group, {images:[{id,...}], videos:[...]}> (đã gom sẵn ở rotate).
// topicText: chủ đề + tiêu đề bài content.
// recentlyUsed: Map<assetId, lastUsedISO> ảnh đã dùng trong cửa sổ chống trùng (rotate tính từ
// mkt_content 14 ngày) — có thể bỏ trống (script cũ / test).
export async function pickImageForContent(client, folders, topicText, recentlyUsed = null, bodyHint = '') {
  const text = String(topicText || '');

  // 26/8 (user "sinh bai content toan lay anh san pham"): DAO thu tu — tang 1 cu la product
  // folder da thang hau het vi bai content hay dinh keyword nganh (dau, nuoc, VMS) => match
  // guessGroup => folder san pham luon co anh => Google CSE khong bao gio duoc chay. Nay ep
  // Google CSE + Unsplash truoc de bai content co anh minh hoa DA DANG tu Google Images
  // (CC-filtered) thay vi lap anh san pham SDVICO nham chan. Folder san pham lui xuong lam
  // backup - chi dung khi Google + Unsplash deu khong co ket qua.
  //
  // Sinh keyword 1 lượt (VI cho Google + EN cho Unsplash) — tiết kiệm 1 lần call Gemini.
  const kw = (process.env.GOOGLE_CSE_API_KEY || process.env.UNSPLASH_ACCESS_KEY)
    ? await imageKeywordsFor(text, client, bodyHint)
    : { vi: '', en: '' };

  // 1. GOOGLE CSE — keyword tiếng Việt + filter CC. Ảnh Việt Nam hợp topic ngư dân hơn.
  // Hết quota (100/ngày) hoặc không có kết quả -> fallback.
  try {
    if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID && kw.vi) {
      const items = await searchGoogleCSE(kw.vi);
      if (items && items.length) {
        const item = pickRandom(items.slice(0, 5));
        const id = await saveGoogleCseToAssets(client, item, text.slice(0, 60));
        if (id) return { id, via: 'google-cse', note: `q="${kw.vi}"` };
      }
    }
  } catch { /* rơi xuống Unsplash */ }

  // 2. Unsplash fallback — keyword tiếng Anh.
  try {
    if (process.env.UNSPLASH_ACCESS_KEY && kw.en) {
      const results = await searchUnsplash(kw.en);
      if (results) {
        // Lấy 1 trong 5 ảnh đầu (đa dạng, vẫn sát chủ đề).
        const photo = pickRandom(results.slice(0, 5));
        const id = await saveUnsplashToAssets(client, photo, text.slice(0, 60));
        if (id) return { id, via: 'unsplash', note: `q="${kw.en}"` };
      }
    }
  } catch { /* rơi xuống fallback */ }

  // 3. Backup: folder sản phẩm SDVICO nếu chủ đề dính guessGroup (trước là tầng 1, nay backup).
  const grp = guessGroup(text);
  if (grp) {
    const key = [...folders.keys()].find((g) => productName(g).toLowerCase() === productName(grp).toLowerCase());
    const imgs = key ? folders.get(key)?.images || [] : [];
    const pick = pickFresh(imgs, recentlyUsed);
    if (pick) return { id: pick.id, via: 'product', note: `folder ${key} (backup Google/Unsplash fail)${recentlyUsed?.has(pick.id) ? ' (het anh moi, lay anh dung lau nhat)' : ''}` };
  }

  // 4. Fallback cuối: folder Content, rồi bất kỳ — né ảnh đã dùng 14 ngày.
  const contentImgs = folders.get('Content')?.images || [];
  const any = [...folders.values()].flatMap((f) => f.images);
  const pool = contentImgs.length ? contentImgs : any;
  const pick = pickFresh(pool, recentlyUsed);
  if (pick) return { id: pick.id, via: 'content-folder', note: `${contentImgs.length ? 'Content' : 'any'}${recentlyUsed?.has(pick.id) ? ' (het anh moi, lay anh dung lau nhat)' : ''}` };
  return { id: null, via: null, note: 'khong co anh' };
}
