// rules.mjs — luật soát kịch bản video SAU KHI SINH, thuần hàm (không mạng, không Gemini) để test được.
// 17/9 (ChatGPT chấm 3 video 8c8347a4 / 7e9cab1a / 492313ac theo prompt 10 tiêu chí, user chốt sửa):
//  1. Video bán hàng nhắc NHẦM sản phẩm khác (video lọc nước 7e9cab1a đọc "lọc dầu ngao ngán dưới
//     khoang tàu" trong khi hình là máy lọc nước) -> crossProductViolations.
//  2. Con số phần trăm không có nguồn (492313ac đọc "ngốn gần 40 phần trăm chi phí chuyến đi", kho
//     chỉ có "bớt 5 tới 10%") -> unsourcedPercents (Điều cấm 5: không bịa số liệu).
//  3. Cụm sáo mới ChatGPT chỉ ra -> EXTRA_WORN (nối vào WORN_PHRASES và SALES_WORN của script.mjs).
//  4. Outro chỉ còn MỘT hành động "bình luận từ khóa" (user 17/9: "rút còn bình luận thôi") -> outroText.
//  5. Cảnh cuối video bán hàng gánh cả câu giá nên ảnh sản phẩm nền trắng đứng 20 giây (7e9cab1a
//     37..58s) -> splitPriceScene tách câu giá thành cảnh riêng, mỗi cảnh ngắn lại.

// Sản phẩm "kia" của cặp lọc dầu / lọc nước: video nhóm này KHÔNG được nhắc từ của nhóm kia.
// SF300B có tách nước lẫn trong dầu, nên với video lọc dầu chỉ cấm cụm chỉ MÁY lọc nước và nước
// uống, không cấm chữ "nước" trần.
// 17/9 (2): bản dựng lại 492313ac (lọc dầu) vẫn mở màn "chia từng ca nước để rửa máy" -> thêm cụm nỗi đau thiếu nước.
const WATER_TERMS = ['lọc nước', 'máy lọc nước', 'nước ngọt', 'nước lợ', 'nước mặn', 'nước biển thành nước', 'ca nước', 'thùng nước', 'trữ nước', 'nước trữ', 'chở nước', 'hụt nước', 'thiếu nước'];
const FUEL_TERMS = ['lọc dầu', 'máy lọc dầu', 'bộ lọc dầu', 'cặn dầu', 'dầu bẩn', 'kim phun', 'bơm cao áp', 'tạp chất trong dầu'];
export const CROSS_PRODUCT_TERMS = {
  '2. Máy lọc nước biển SEA-40': FUEL_TERMS,
  '9. Máy Lọc Dầu Diesel SD12-300': WATER_TERMS,
  '6. Thiết bị lọc dầu SF-50': WATER_TERMS,
};

export function crossProductTerms(group) {
  return CROSS_PRODUCT_TERMS[group] || [];
}

// Trả về danh sách cụm sản phẩm KHÁC xuất hiện trong lời thoại (rỗng = sạch). Không có nhóm thì bỏ qua.
export function crossProductViolations(text, group) {
  const t = String(text || '').toLowerCase();
  return crossProductTerms(group).filter((p) => t.includes(p));
}

// Số phần trăm trong văn bản: "40%", "40 phần trăm", "5 tới 10%". Trả về Set các số (chuỗi đã chuẩn hóa).
// "5 tới 10%" cho cả 5 và 10 (khoảng đều có trong nguồn).
export function percentNumbers(text) {
  const s = String(text || '').toLowerCase();
  const out = new Set();
  const re = /(\d+(?:[.,]\d+)?)(?:\s*(?:tới|đến|-|–)\s*(\d+(?:[.,]\d+)?))?\s*(?:%|phần trăm)/g;
  let m;
  while ((m = re.exec(s))) {
    out.add(m[1].replace(',', '.'));
    if (m[2]) out.add(m[2].replace(',', '.'));
  }
  return out;
}

// Phần trăm trong lời thoại mà KHÔNG có trong nguồn (bài nguồn + thông số được phép). Trả về mảng
// chuỗi thô để ghi log và cắt câu. sources: mảng chuỗi.
export function unsourcedPercents(text, sources = []) {
  const allowed = new Set();
  for (const src of sources) for (const n of percentNumbers(src)) allowed.add(n);
  const s = String(text || '');
  const out = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(?:%|phần trăm)/gi;
  let m;
  while ((m = re.exec(s))) {
    const n = m[1].replace(',', '.');
    if (!allowed.has(n)) out.push(m[0]);
  }
  return out;
}

// Bỏ các CÂU chứa bất kỳ cụm nào trong phrases (không phân biệt hoa thường). Dự phòng khi sinh lại vẫn dính.
export function stripSentencesWith(text, phrases) {
  const bad = (phrases || []).map((p) => String(p).toLowerCase()).filter(Boolean);
  if (!bad.length) return text;
  return String(text || '')
    .split(/(?<=[.!?…])\s+|\n/)
    .filter((s) => !bad.some((b) => s.toLowerCase().includes(b)))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Cụm sáo ChatGPT chỉ ra 17/9 (cả 3 video): giọng "video thương hiệu", ngư dân nghe 1 câu biết ngay quảng cáo.
export const EXTRA_WORN = [
  'thuận buồm xuôi gió', 'đầy ắp khoang', 'xót cả ruột', 'xót ruột', 'lăn lộn', 'hại lắm nha',
  'bảo vệ sức khỏe', 'thấu hiểu sóng gió', 'sóng gió ngoài khơi', 'lênh đênh', 'ngao ngán',
  'mấy ai thấu hiểu', 'suốt hành trình dài',
  // 17/9 vòng 2 (ChatGPT chấm lại 60/61/52: "vẫn còn một lớp sáo rỗng khác"): "May mà có" mở cảnh giải
  // pháp ở CẢ 2 video bán hàng = khuôn mới; "chuyến lướt sóng", "trọn gói từ A tới Z" là văn AI.
  'may mà có', 'tự dưng', 'đồng hành cùng bà con', 'lướt sóng', 'thấu hết', 'nhọc nhằn',
  'trọn gói từ a tới z', 'từ a tới z', 'tấp nập kéo lưới', 'tiếc nuối', 'yên tâm bám biển', 'cực tốt',
  'đổ sông đổ bể', 'đổ sông đổ biển', 'trôi tuột',
];

// Outro = MỘT câu, MỘT hành động (user 17/9 theo ChatGPT: "không nên vừa bảo gọi, vừa bảo comment,
// vừa bảo nhắn Page trong một đoạn cuối ngắn"). Một "nha" ở cuối, một lần gọi VieNeu (luật 11/9).
// keyword: 'lọc dầu' | 'lọc nước' | 'lọc dầu hay lọc nước' (video content).
export function outroText(keyword) {
  // 17/9 vòng 2 (ChatGPT: video cộng đồng mà kêu "bình luận lọc dầu hay lọc nước" = quảng cáo trá hình,
  // lạc vai trò): video content kêu bình luận SDVICO ủng hộ đội, không nhắc sản phẩm.
  if (keyword === 'SDVICO') return 'Thấy đội SDVICO làm thật ngoài tàu, bình luận SDVICO ủng hộ anh em nha!';
  return `Bình luận ${keyword || 'lọc dầu hay lọc nước'}, bên em tư vấn đúng loại cho tàu anh em nha!`;
}

// Chữ người xem cần biết ngay từ cảnh 1 của video bán hàng (17/9 vòng 2, ChatGPT: "người xem chưa biết
// chuyện này liên quan tới lọc dầu"): video lọc dầu 2 câu đầu phải có chữ "dầu", lọc nước phải có "nước".
export function hookProductTerm(group) {
  if (group === '2. Máy lọc nước biển SEA-40') return 'nước';
  if (group === '9. Máy Lọc Dầu Diesel SD12-300' || group === '6. Thiết bị lọc dầu SF-50') return 'dầu';
  return null;
}

// Chữ in trên màn hình outro: từ khóa viết HOA để bà con chép y nguyên vào bình luận.
export function outroScreenKeyword(keyword) {
  return String(keyword || 'lọc dầu hay lọc nước').toUpperCase();
}

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const sentencesOf = (s) => String(s || '').trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
// Chuẩn hóa để so câu giá (cùng cách ensureSpokenTeaser trong products.mjs): model hay viết "9,X triệu"
// thay vì "9 phẩy X triệu".
const normPrice = (t) => String(t || '').toLowerCase().replace(/,\s*x/g, 'phẩyx').replace(/\s+/g, '');

// Tách câu giá khỏi cảnh cuối thành cảnh riêng khi cảnh cuối quá dài (>= maxWords từ). Trả về
// { scenes, split } — scenes mới (không đổi mảng vào), split=true khi có tách. pickAsset(prevAssetId)
// trả assetId cho cảnh giá (null = dùng lại tư liệu cảnh cuối). Câu giá nhận ra theo spokenKey đã
// chuẩn hóa (model có thể viết lại câu giá bằng lời khác một chút).
export function splitPriceScene(scenes, teaser, { maxWords = 32, pickAsset = null } = {}) {
  const list = Array.isArray(scenes) ? scenes.slice() : [];
  if (!teaser?.spoken || !list.length) return { scenes: list, split: false };
  const last = list[list.length - 1];
  const narration = String(last.narration || '');
  if (wordCount(narration) < maxWords) return { scenes: list, split: false };
  const sents = sentencesOf(narration);
  const key = normPrice(teaser.spokenKey || teaser.spoken);
  const idx = sents.findIndex((s) => normPrice(s).includes(key));
  if (idx <= 0) return { scenes: list, split: false }; // không có câu giá, hoặc cả cảnh mở đầu bằng câu giá
  const before = sents.slice(0, idx).join(' ').trim();
  const priceText = sents.slice(idx).join(' ').trim();
  if (!before) return { scenes: list, split: false };
  const priceAsset = (typeof pickAsset === 'function' ? pickAsset(last.assetId) : null) || last.assetId;
  list[list.length - 1] = { ...last, narration: before };
  list.push({
    ...last,
    narration: priceText,
    role: 'price',
    assetId: priceAsset,
    visual: 'máy đang lắp trên tàu hoặc đang chạy, tem giá hiện lên',
    matchBy: 'rule-price',
    why: 'cảnh giá tách riêng để ảnh sản phẩm không đứng quá lâu (17/9)',
  });
  return { scenes: list, split: true };
}

// Tách lời thoại ở ranh giới câu gần giữa nhất. Trả về [nửa đầu, nửa sau] hoặc null nếu chỉ 1 câu.
export function splitNarrationMiddle(text) {
  const sents = sentencesOf(text);
  if (sents.length < 2) return null;
  const total = sents.reduce((a, s) => a + s.length, 0);
  let best = 0;
  let bestDiff = Infinity;
  let acc = 0;
  for (let i = 0; i < sents.length - 1; i++) {
    acc += sents[i].length;
    const diff = Math.abs(acc - total / 2);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [sents.slice(0, best + 1).join(' '), sents.slice(best + 1).join(' ')];
}

// 17/9 (bản dựng lại 492313ac: cảnh 2 ảnh tĩnh 17s, cảnh 3 ảnh tĩnh 19,5s — ChatGPT: "hơn 20 giây nhìn
// một hình lặp lại, retention rơi"): cảnh dùng ẢNH mà lời thoại >= maxWords từ thì tách đôi ở ranh
// giới câu, nửa sau đổi sang tư liệu khác (pickAsset(prevAssetId, role, visual) -> id; trả null hoặc
// cùng id thì KHÔNG tách vì hình không đổi). Cảnh clip thật giữ nguyên (đã có chuyển động).
// videoToo (17/9 vòng 2, ChatGPT: video lọc nước cảnh clip tàu sửa đứng 12 giây — "lỗi hình tĩnh đã được
// chuyển chỗ"): true thì cảnh CLIP dài cũng tách đôi đổi hình như cảnh ảnh. Cảnh mang clip bắt buộc
// (matchBy 'must') và cảnh giá không tách.
export function splitLongImageScenes(scenes, { maxWords = 40, isImage, pickAsset, videoToo = false } = {}) {
  const out = [];
  let split = false;
  for (const s of Array.isArray(scenes) ? scenes : []) {
    const splittable = typeof isImage === 'function' && (isImage(s.assetId) || videoToo);
    if (s.role === 'price' || s.matchBy === 'must' || !splittable || wordCount(s.narration) < maxWords) { out.push(s); continue; }
    const parts = splitNarrationMiddle(s.narration);
    const second = parts && typeof pickAsset === 'function' ? pickAsset(s.assetId, s.role, s.visual) : null;
    if (!parts || !second || second === s.assetId) { out.push(s); continue; }
    out.push({ ...s, narration: parts[0] });
    out.push({ ...s, narration: parts[1], assetId: second, matchBy: 'rule-split', why: 'cảnh ảnh dài tách đôi, đổi hình (17/9)' });
    split = true;
  }
  return { scenes: out, split };
}

// 17/9 chiều (user: video lọc nước 7e9cab1a mở màn "thợ máy sửa tới lần thứ ba" trên hình MÁY SEA-40 CỦA
// CÔNG TY đang chạy, nghe như máy SDVICO hỏng hoài): luật 9/9 ép clip thật mới nhất vào CẢNH 1, nhưng cảnh 1
// video bán hàng là cảnh NỖI ĐAU. Clip sản phẩm đang chạy/lắp đặt phải vào cảnh GIẢI PHÁP; chỉ clip quay
// sự cố, máy hư, thợ sửa mới được làm cảnh 1. Video content giữ cảnh 1 như cũ.
const PROBLEM_CLIP_RE = /sự cố|su co|hỏng|hong|hư |hu |trục trặc|truc trac|cặn|can ban|đục|duc ngau|bẩn|khục|khuc|nghẹt|nghet|tắc|xả cặn|xa can|bảo trì|bao tri/i;
export function mustUseRoleFor(asset, contentVideo) {
  if (contentVideo || !asset) return 'hook';
  const text = `${asset.title || ''} ${asset.description || ''}`;
  return PROBLEM_CLIP_RE.test(text) ? 'hook' : 'solution';
}
