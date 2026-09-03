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
// Trả { id, via: 'product' | 'google-cse' | 'unsplash' | 'content-folder' | null, note }
// hoặc (chế độ link trực tiếp 28/8) { id: null, url, via: 'google-cse-link' | 'unsplash-link', credit, note }.
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
        'EN: khi chủ đề là đời sống/nghề cá, ưu tiên thêm bối cảnh châu Á ("vietnam"/"asian fishing village") để ảnh không lệch văn hóa.',
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

// 3/9 (user: "bài content lựa ảnh không đúng với bài"): THẨM ĐỊNH ảnh ứng viên bằng mắt AI
// trước khi chốt. Nhận tối đa 5 ứng viên {url, thumb}, tải THUMBNAIL (nhẹ), 1 lượt Gemini
// vision chấm 0-10 độ khớp bài + bối cảnh ngư dân/tàu cá Việt Nam. Trả { index, score } của
// ảnh tốt nhất khi score >= 6; điểm thấp hết -> null (người gọi rơi xuống tầng ảnh nhà).
// LỖI KỸ THUẬT (Gemini sập, thumbnail không tải được...) -> throw để người gọi giữ hành vi
// cũ — thà ảnh có thể lệch còn hơn tịt sinh bài.
async function assessCandidates(client, candidates, topicText, bodyHint) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const parts = [];
  const kept = [];
  for (const c of candidates.slice(0, 5)) {
    try {
      const r = await fetch(c.thumb || c.url, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || 'image/jpeg';
      if (!ct.startsWith('image/')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 300 * 1024) continue; // thumbnail mà quá 300KB thì bỏ, đỡ tốn token
      parts.push({ inlineData: { mimeType: ct.split(';')[0], data: buf.toString('base64') } });
      kept.push(c);
    } catch { /* bỏ ảnh lỗi */ }
  }
  if (!kept.length) throw new Error('khong tai duoc thumbnail nao');
  const res = await ai.models.generateContent({
    model: MKT_MODEL,
    contents: [{
      role: 'user',
      parts: [
        {
          text: [
            `Bài đăng cho ngư dân Việt Nam, tiêu đề: "${String(topicText).slice(0, 160)}".`,
            bodyHint ? `Nội dung chính: ${String(bodyHint).slice(0, 500)}` : '',
            `Dưới đây là ${kept.length} ảnh ứng viên theo THỨ TỰ. Chấm từng ảnh 0-10:`,
            'khớp SỰ VIỆC của bài (quan trọng nhất), hợp bối cảnh ngư dân/tàu cá/biển Việt Nam,',
            'không phải logo/bản đồ/ảnh chụp màn hình/đồ họa chữ. Ảnh sai sự việc thì dưới 4.',
            `Chỉ trả JSON: {"scores":[${kept.map(() => '0').join(',')}]} đúng ${kept.length} số.`,
          ].filter(Boolean).join('\n'),
        },
        ...parts,
      ],
    }],
    config: { responseMimeType: 'application/json', temperature: 0 },
  });
  logTokenUsage(client, 'creator_pick_image', MKT_MODEL, res?.usageMetadata);
  const j = JSON.parse((res.text || '').match(/\{[\s\S]*\}/)?.[0] || '{}');
  const scores = Array.isArray(j.scores) ? j.scores.map(Number) : [];
  let best = -1, bestScore = -1;
  for (let i = 0; i < kept.length; i++) {
    const s = Number.isFinite(scores[i]) ? scores[i] : -1;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  if (best < 0 || bestScore < 6) return null;
  return { candidate: kept[best], score: bestScore };
}

// 28/8 tối (user chốt): chế độ LINK TRỰC TIẾP — gọi API lấy URL ảnh dùng ngay, KHÔNG lưu
// Storage. Kho Supabase chỉ dành cho ảnh/video thật của công ty (Zalo, folder sản phẩm).
// Facebook SAO CHÉP ảnh về máy chủ của nó lúc đăng nên link nguồn có chết sau đó cũng không
// ảnh hưởng bài đã đăng; web/blog của mình không hiển thị link ngoài (dùng ảnh kho) nên không
// tốn egress và không sợ link mục.
async function verifyImageLink(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return false;
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return false;
    const len = Number(r.headers.get('content-length') || 0);
    if (len && len > 8 * 1024 * 1024) return false; // ảnh quá to, FB dễ từ chối
    if (r.body && r.body.cancel) r.body.cancel().catch(() => {});
    return true;
  } catch {
    return false;
  }
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
  // 28/8 toi (user chot lai): "moi lan tao content thi GOI API lay anh thoi chu KHONG luu —
  // cai luu lai chinh la anh/video Zalo SDVICO duoc up len kho". Mac dinh: LINK TRUC TIEP
  // (khong ton Storage/egress). EXTERNAL_IMAGE_MODE=off de tat han tang mang;
  // ALLOW_EXTERNAL_IMAGE_SAVE=1 quay ve che do cu (tai anh ve luu kho).
  const allowSave = process.env.ALLOW_EXTERNAL_IMAGE_SAVE === '1';
  const hotlink = !allowSave && process.env.EXTERNAL_IMAGE_MODE !== 'off';
  const useExternal = allowSave || hotlink;
  const kw = useExternal && (process.env.GOOGLE_CSE_API_KEY || process.env.UNSPLASH_ACCESS_KEY)
    ? await imageKeywordsFor(text, client, bodyHint)
    : { vi: '', en: '' };

  // 1. GOOGLE CSE — link trực tiếp (mặc định) hoặc lưu kho (chế độ cũ).
  try {
    if (useExternal && process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID && kw.vi) {
      const items = await searchGoogleCSE(kw.vi);
      if (items && items.length) {
        if (allowSave) {
          const item = pickRandom(items.slice(0, 5));
          const id = await saveGoogleCseToAssets(client, item, text.slice(0, 60));
          if (id) return { id, via: 'google-cse', note: `q="${kw.vi}"` };
        } else {
          // 3/9: thẩm định bằng mắt AI thay vì lấy ảnh đầu tiên fetch được. Lỗi kỹ thuật
          // khi chấm -> giữ hành vi cũ (ảnh đầu fetch được); điểm thấp hết -> bỏ CSE.
          const cands = items.slice(0, 5)
            .filter((it) => it?.link)
            .map((it) => ({ url: it.link, thumb: it?.image?.thumbnailLink || it.link, credit: it?.displayLink || null }));
          let judged;
          try { judged = await assessCandidates(client, cands, text, bodyHint); }
          catch { judged = undefined; }
          if (judged === null) {
            // ảnh CSE đều lệch bài — nhường Unsplash/ảnh nhà
          } else if (judged) {
            if (await verifyImageLink(judged.candidate.url)) {
              return { id: null, url: judged.candidate.url, via: 'google-cse-link', credit: judged.candidate.credit, note: `q="${kw.vi}" cham ${judged.score}/10 (link, khong luu)` };
            }
          } else {
            for (const item of items.slice(0, 5)) {
              const url = item?.link;
              if (url && (await verifyImageLink(url))) {
                return { id: null, url, via: 'google-cse-link', credit: item?.displayLink || null, note: `q="${kw.vi}" (link, cham loi - lay anh dau)` };
              }
            }
          }
        }
      }
    }
  } catch { /* rơi xuống Unsplash */ }

  // 2. Unsplash — link trực tiếp (Unsplash CHÍNH THỨC yêu cầu hotlink URL + ping download).
  try {
    if (useExternal && process.env.UNSPLASH_ACCESS_KEY && kw.en) {
      const results = await searchUnsplash(kw.en);
      if (results) {
        // 3/9: thẩm định 5 ảnh đầu bằng mắt AI thay vì random (root cause ảnh Tây lệch bài).
        const cands = results.slice(0, 5)
          .filter((p) => p?.urls?.regular)
          .map((p) => ({ url: p.urls.regular, thumb: p.urls.small || p.urls.regular, photo: p }));
        let judged;
        try { judged = await assessCandidates(client, cands, text, bodyHint); }
        catch { judged = undefined; }
        const photo = judged === null ? null : judged ? judged.candidate.photo : pickRandom(results.slice(0, 5));
        if (photo && allowSave) {
          const id = await saveUnsplashToAssets(client, photo, text.slice(0, 60));
          if (id) return { id, via: 'unsplash', note: `q="${kw.en}"` };
        } else if (photo?.urls?.regular) {
          const dl = photo?.links?.download_location;
          if (dl) fetch(`${dl}${dl.includes('?') ? '&' : '?'}client_id=${process.env.UNSPLASH_ACCESS_KEY}`).catch(() => {});
          return { id: null, url: photo.urls.regular, via: 'unsplash-link', credit: photo?.user?.name ? `Unsplash/${photo.user.name}` : 'Unsplash', note: `q="${kw.en}"${judged ? ` cham ${judged.score}/10` : ' (cham loi - random)'} (link, khong luu)` };
        }
        // judged === null (ảnh Unsplash đều lệch) -> rơi xuống tầng folder sản phẩm/Content
      }
    }
  } catch { /* rơi xuống fallback */ }

  // 3. TANG CHINH tu 28/8: folder sản phẩm SDVICO nếu chủ đề dính guessGroup.
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
