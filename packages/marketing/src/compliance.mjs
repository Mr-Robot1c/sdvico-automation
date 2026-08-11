// compliance.mjs — hàng rào tuân thủ cho nội dung Marketing trước khi vào hàng đợi duyệt.
//
// Ba việc, thuần hàm, không đụng mạng, để test dễ và cả cỗ máy nội dung lẫn backend tin
// nhắn dùng chung:
//  1. scanRegulation  -> gán CỜ ĐỎ nếu chạm quy định nhà nước (Điều cấm 3): IUU, Cục Thủy
//     sản, Kiểm ngư, nghị định, mức phạt, ngưỡng mét. Bài cờ đỏ phải qua duyệt cấp quản lý.
//  2. scanPartner     -> gắn cảnh báo nếu nhắc phần mềm đối tác (Điều cấm 4). Nhắc để nói
//     "tương thích với" thì được, nhưng phải người rà, không để máy tự nhận vơ.
//  3. scanUnverifiedSpecs -> bắt model và thông số KHÔNG nằm trong nguồn đã duyệt
//     (product-facts). Chống bịa số (Điều cấm 5). Nguồn rỗng thì mọi thông số đều bị chặn
//     để buộc người xác nhận, đúng nguyên tắc thà chặn nhầm còn hơn đăng bậy.

// Từ khóa quy định nhà nước. So khớp trên văn bản đã hạ chữ thường.
export const REGULATION_TERMS = [
  'iuu',
  'cục thủy sản',
  'kiểm ngư',
  'thẻ vàng',
  'nghị định',
  'thông tư',
  'luật thủy sản',
  'xử phạt',
  'mức phạt',
  'vi phạm hành chính',
  'khai thác bất hợp pháp',
  'khai thác trái phép',
  'giấy phép khai thác',
];

// Ngưỡng mét của tàu là nội dung quy định (tàu từ 15 mét phải lắp). Bắt "15 mét", "12m".
const REGULATION_PATTERNS = [/\b\d{1,2}\s?mét\b/i, /\btàu[^.]{0,20}\b\d{1,2}\s?m\b/i];

// Phần mềm và dịch vụ của đối tác. Không được mô tả như của SDVICO.
export const PARTNER_TERMS = [
  's-tracking',
  'stracking',
  'vss',
  'vishipel',
  'thuraya',
  'viettel',
  'vnpt',
];

// Đơn vị kỹ thuật hay gặp ở thông số thiết bị. Cố tình KHÔNG gồm giây, phút, giờ, đồng,
// phần trăm, để khỏi bắt nhầm số điện thoại, thời lượng video, giá tiền.
const SPEC_PATTERNS = [
  /\bip\s?\d{2}\b/gi, // chuẩn kháng nước IP67
  /\b[A-Z]{2,}[-\s]?\d{2,}[A-Z]?\b/g, // model kiểu SEA-40, SF 50
  // Công suất, dung lượng. Đơn vị dài xếp trước; theo sau không được là chữ cái để tránh
  // khớp nhầm "1 v" trong "số 1 và" (dùng cờ u và lookahead \p{L}).
  /\b\d+([.,]\d+)?\s?(kwh|kw|wh|mah|ah|l\/h|lít\/giờ|hải lý|nits|db|w|v)(?![\p{L}])/giu,
];

function lower(text) {
  return (text || '').toLowerCase();
}

// Trả về danh sách từ khóa quy định xuất hiện trong văn bản.
export function scanRegulation(text) {
  const t = lower(text);
  const hits = REGULATION_TERMS.filter((term) => t.includes(term));
  for (const re of REGULATION_PATTERNS) {
    const m = (text || '').match(re);
    if (m) hits.push(m[0].trim());
  }
  return [...new Set(hits)];
}

// Trả về danh sách tên đối tác được nhắc tới.
export function scanPartner(text) {
  const t = lower(text);
  return PARTNER_TERMS.filter((term) => t.includes(term));
}

// Quét mọi token giống model hoặc thông số trong văn bản. Trả về mảng { raw, norm }.
function scanSpecTokens(text) {
  const found = new Map();
  for (const re of SPEC_PATTERNS) {
    const matches = (text || '').match(re) || [];
    for (const raw of matches) {
      const norm = raw.toLowerCase().replace(/\s+/g, '');
      if (!found.has(norm)) found.set(norm, raw.trim());
    }
  }
  return [...found.entries()].map(([norm, raw]) => ({ norm, raw }));
}

// Thông số KHÔNG có trong nguồn đã duyệt (nghi bịa). knownValues gồm cả thật lẫn test.
export function scanUnverifiedSpecs(text, knownValues = new Set()) {
  return scanSpecTokens(text).filter((t) => !knownValues.has(t.norm)).map((t) => t.raw);
}

// Thông số có trong nguồn nhưng là DỮ LIỆU TEST (verified:false). Không được coi là sạch.
export function scanTestSpecs(text, testValues = new Set()) {
  return scanSpecTokens(text).filter((t) => testValues.has(t.norm)).map((t) => t.raw);
}

// Đánh giá tổng hợp một bản nháp.
// Trả về { risk, needsManagerApproval, flags }.
//  risk = 'red'   khi chạm quy định (Điều cấm 3) -> phải cấp quản lý duyệt.
//  risk = 'amber' khi nhắc đối tác hoặc có thông số chưa xác nhận -> người phụ trách rà.
//  risk = 'none'  khi sạch.
export function assessDraft(text, { knownFactValues = new Set(), testFactValues = new Set() } = {}) {
  const regulation = scanRegulation(text);
  const partner = scanPartner(text);
  const unverifiedSpecs = scanUnverifiedSpecs(text, knownFactValues);
  const testSpecs = scanTestSpecs(text, testFactValues);

  let risk = 'none';
  if (regulation.length) risk = 'red';
  else if (partner.length || unverifiedSpecs.length || testSpecs.length) risk = 'amber';

  return {
    risk,
    needsManagerApproval: risk === 'red',
    flags: { regulation, partner, unverifiedSpecs, testSpecs },
  };
}
