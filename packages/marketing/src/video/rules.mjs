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
const WATER_TERMS = ['lọc nước', 'máy lọc nước', 'nước ngọt', 'nước lợ', 'nước mặn', 'nước biển thành nước'];
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
  'bảo vệ sức khỏe', 'thấu hiểu sóng gió', 'sóng gió ngoài khơi', 'lênh đênh bám biển', 'ngao ngán',
  'mấy ai thấu hiểu', 'suốt hành trình dài',
];

// Outro = MỘT câu, MỘT hành động (user 17/9 theo ChatGPT: "không nên vừa bảo gọi, vừa bảo comment,
// vừa bảo nhắn Page trong một đoạn cuối ngắn"). Một "nha" ở cuối, một lần gọi VieNeu (luật 11/9).
// keyword: 'lọc dầu' | 'lọc nước' | 'lọc dầu hay lọc nước' (video content).
export function outroText(keyword) {
  return `Bình luận ${keyword || 'lọc dầu hay lọc nước'}, bên em tư vấn đúng loại cho tàu anh em nha!`;
}

// Chữ in trên màn hình outro: từ khóa viết HOA để bà con chép y nguyên vào bình luận.
export function outroScreenKeyword(keyword) {
  return String(keyword || 'lọc dầu hay lọc nước').toUpperCase();
}

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// Tách câu giá khỏi cảnh cuối thành cảnh riêng khi cảnh cuối quá dài (>= maxWords từ). Trả về
// { scenes, split } — scenes mới (không đổi mảng vào), split=true khi có tách. pickAsset(prevAssetId)
// trả assetId cho cảnh giá (null = dùng lại tư liệu cảnh cuối).
export function splitPriceScene(scenes, teaser, { maxWords = 32, pickAsset = null } = {}) {
  const list = Array.isArray(scenes) ? scenes.slice() : [];
  if (!teaser?.spoken || !list.length) return { scenes: list, split: false };
  const last = list[list.length - 1];
  const narration = String(last.narration || '');
  const at = narration.indexOf(teaser.spoken);
  if (at <= 0) return { scenes: list, split: false }; // không có câu giá, hoặc cả cảnh chỉ là câu giá
  if (wordCount(narration) < maxWords) return { scenes: list, split: false };
  const before = narration.slice(0, at).trim();
  const priceText = narration.slice(at).trim();
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
