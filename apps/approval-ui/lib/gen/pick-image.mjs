// pick-image.mjs — chọn ẢNH KHỚP CHỦ ĐỀ cho bài content (không bán).
//
// User 18/8: "đang hỏi đáp thiết bị giám sát hành trình mà lấy ảnh tàu cá chung chung —
// lấy ảnh mạng hoặc từ folder khác cho phù hợp context". Trước đây rotate lấy ngẫu nhiên
// trong folder 'Content'. Nay ưu tiên theo thứ tự:
//   1. Chủ đề/tiêu đề nhắc tới sản phẩm SDVICO (guessGroup) -> ảnh trong folder sản phẩm đó.
//   2. Không dính sản phẩm -> Unsplash theo từ khóa tiếng Anh (Gemini dịch chủ đề thành 2-4 từ
//      khóa ảnh), lưu vào brand_assets (folder 'Content', license 'licensed', ghi tác giả) để
//      dùng lại và để publish đọc như ảnh thường. Cần UNSPLASH_ACCESS_KEY.
//   3. Cuối cùng mới rơi về ngẫu nhiên folder 'Content' như cũ.
// Trả { id, via: 'product' | 'unsplash' | 'content-folder' | null, note }.
// Dùng chung cho app/api/rotate/route.ts và scripts/rotate-now.mjs (module JS thuần).

import { guessGroup } from './products.mjs';
import { logTokenUsage } from './token-log.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
const BUCKET = 'brand-assets';

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function productName(g) { return String(g || '').replace(/^\s*\d+\.\s*/, '').trim(); }

// Dịch chủ đề tiếng Việt thành từ khóa ảnh tiếng Anh ngắn (Unsplash tìm tiếng Anh tốt hơn).
// Lỗi -> fallback từ khóa chung ngành cá.
async function imageKeywordsFor(topicText, client = null) {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: MKT_MODEL,
      contents: [
        `Chủ đề bài đăng cho ngư dân Việt Nam: "${topicText}".`,
        'Cho tôi 2 tới 4 từ khóa TIẾNG ANH để tìm ảnh minh họa phù hợp trên kho ảnh (ưu tiên cảnh tàu cá, thiết bị trên tàu, biển, ngư dân, cảng cá).',
        'Chỉ trả về JSON: {"query":"..."} không thêm chữ.',
      ].join('\n'),
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    logTokenUsage(client, 'creator_pick_image', MKT_MODEL, res?.usageMetadata);
    const m = (res.text || '').match(/\{[\s\S]*\}/);
    const q = m ? String(JSON.parse(m[0]).query || '').trim() : '';
    return q || 'fishing boat vietnam';
  } catch {
    return 'fishing boat vietnam';
  }
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
export async function pickImageForContent(client, folders, topicText, recentlyUsed = null) {
  const text = String(topicText || '');

  // 1. Chủ đề dính sản phẩm -> ảnh folder sản phẩm đó (né ảnh vừa dùng).
  const grp = guessGroup(text);
  if (grp) {
    const key = [...folders.keys()].find((g) => productName(g).toLowerCase() === productName(grp).toLowerCase());
    const imgs = key ? folders.get(key)?.images || [] : [];
    const pick = pickFresh(imgs, recentlyUsed);
    if (pick) return { id: pick.id, via: 'product', note: `folder ${key}${recentlyUsed?.has(pick.id) ? ' (het anh moi, lay anh dung lau nhat)' : ''}` };
  }

  // 2. Unsplash theo từ khóa dịch từ chủ đề.
  try {
    if (process.env.UNSPLASH_ACCESS_KEY) {
      const q = await imageKeywordsFor(text, client);
      const results = await searchUnsplash(q);
      if (results) {
        // Lấy 1 trong 5 ảnh đầu (đa dạng, vẫn sát chủ đề).
        const photo = pickRandom(results.slice(0, 5));
        const id = await saveUnsplashToAssets(client, photo, text.slice(0, 60));
        if (id) return { id, via: 'unsplash', note: `q="${q}"` };
      }
    }
  } catch { /* rơi xuống fallback */ }

  // 3. Fallback: folder Content, rồi bất kỳ — né ảnh đã dùng 14 ngày, hết mới lấy ảnh dùng lâu nhất.
  const contentImgs = folders.get('Content')?.images || [];
  const any = [...folders.values()].flatMap((f) => f.images);
  const pool = contentImgs.length ? contentImgs : any;
  const pick = pickFresh(pool, recentlyUsed);
  if (pick) return { id: pick.id, via: 'content-folder', note: `${contentImgs.length ? 'Content' : 'any'}${recentlyUsed?.has(pick.id) ? ' (het anh moi, lay anh dung lau nhat)' : ''}` };
  return { id: null, via: null, note: 'khong co anh' };
}
