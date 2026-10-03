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

// 17/9 vòng 9 (ChatGPT: "thốt lên" và "sạch bong" vẫn lọt vào video dù đã cấm từ vòng 5): câu trích kết
// thúc bằng !" hay ?" làm regex tách câu cũ (nhìn đúng 1 ký tự trước khoảng trắng) không tách được, cả
// cụm dài thành "1 câu" — cắt là rỗng cảnh nên bộ khôi phục giữ nguyên cụm cấm. Cho phép dấu đóng
// ngoặc/kép đứng giữa dấu câu và khoảng trắng.
const SENT_SPLIT = /(?<=[.!?…]["”’»)]?)\s+/;
const SENT_SPLIT_NL = /(?<=[.!?…]["”’»)]?)\s+|\n/;

// Bỏ các CÂU chứa bất kỳ cụm nào trong phrases (không phân biệt hoa thường). Dự phòng khi sinh lại vẫn dính.
export function stripSentencesWith(text, phrases) {
  const bad = (phrases || []).map((p) => String(p).toLowerCase()).filter(Boolean);
  if (!bad.length) return text;
  return String(text || '')
    .split(SENT_SPLIT_NL)
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
  // 17/9 vòng 3 (ChatGPT: "văn phim thương hiệu / copywriting du lịch"): sương chưa tan, kiên cường,
  // nhịp sóng, khúc ruột, bủa vây; "lau mồ hôi" lặp ở 3 vòng liền, "đau thắt" là dọa chứ không phải thông tin.
  'sương chưa tan', 'bủa vây', 'khúc ruột', 'kiên cường', 'nhịp sóng', 'đau thắt', 'ùa về',
  'lau mồ hôi', 'gọi ai cứu',
  // 17/9 vòng 4 (ChatGPT 70/66/68): "ai hiểu hết sóng gió", "thấu được cái cực nhọc", "êm ru",
  // "biết bao nhiêu", "mất toi" — vẫn là văn quảng cáo, không phải thông tin.
  'thấu được', 'êm ru', 'biết bao nhiêu', 'mất toi', 'ai hiểu hết',
  // 17/9 vòng 5 (ChatGPT 68/68/65): "thốt lên" lặp 3 vòng liền ở kiểu mở trích lời, "hoài niệm" /
  // "bám trụ" là văn phim thương hiệu, "sạch bong" là kết quả mạnh không hình nào chứng minh.
  'thốt lên', 'hoài niệm', 'bám trụ', 'sạch bong', 'thấu hiểu',
  // 17/9 vòng 6 (ChatGPT: "câu kết quả không được quảng cáo mạnh hơn dữ liệu"): tuyệt đối, giòn tan,
  // đội nón ra đi, lo trọn vẹn, vững tâm, hụt hẫng, vang lên; "sạch bóng" là biến thể của "sạch bong".
  'tuyệt đối', 'giòn tan', 'đội nón', 'trọn vẹn', 'vững tâm', 'hụt hẫng', 'vang lên', 'sạch bóng',
  // 17/9 vòng 9 (ChatGPT 69/71/60: "Nhớ quá những chuyến bám biển", "Đã lắm những lúc quây quần bên
  // mâm cơm nóng trên boong", "cạn đáy rồi anh em ơi", "không còn một giọt nước", "không còn lo cạn
  // nước", "loay hoay sửa máy" — văn AI kể chuyện / kịch hóa, không phải thông tin).
  'nhớ quá', 'đã lắm', 'quây quần', 'mâm cơm', 'cạn đáy', 'một giọt nước', 'không còn lo', 'loay hoay',
  // 18/9 vòng 10 (cả 3 ĐỀU ĐẠT MỨC ĐĂNG 74/72/77 nhưng ChatGPT còn chê): "rầu hết cả ruột gan" /
  // "xót gan ruột" là biến thể mới của họ "xót ruột"; "cười trừ" tả người không có trong hình;
  // "tinh mơ" là mốc thời gian hình không xác nhận được; "hoàn thiện từng con máy" gợi SDVICO
  // là bên CHẾ TẠO máy (sai vai nhà phân phối, Điều cấm 4).
  'ruột gan', 'gan ruột', 'cười trừ', 'tinh mơ', 'hoàn thiện từng con máy',
  // 3/10 (ChatGPT chấm 3 video mẫu, bắt "tách nước hoàn toàn", "lọc sạch cặn bẩn nhỏ nhất", "tiết kiệm tới
  // 10% nhiên liệu mỗi chuyến"): thông số 100% / 5 tới 10% có trong tài liệu công ty nhưng lời đọc quảng
  // cáo tuyệt đối hóa thì kém đáng tin. "triệt để" là từ trơn nên vào danh sách này; "hoàn toàn",
  // "nhỏ nhất", "100%" chỉ bắt khi dính hiệu quả kỹ thuật, xem absoluteClaims bên dưới.
  'triệt để',
];

// 3/10: LỜI ĐỌC KHÔNG TUYỆT ĐỐI HÓA hiệu quả. "hoàn toàn" / "nhỏ nhất" / "100%" có nhiều nghĩa khác (anh em
// hoàn toàn yên tâm, cỡ nhỏ nhất) nên không đưa vào EXTRA_WORN (khớp chuỗi trơn) mà bắt bằng regex hẹp:
//  - "hoàn toàn" đứng cạnh động từ hiệu quả: tách/lọc/khử/loại bỏ/xử lý/sạch, vế trước cách tối đa 2 chữ
//    ("tách nước hoàn toàn", "loại bỏ cặn hoàn toàn"), hoặc vế sau ("hoàn toàn không còn cặn");
//    "hoàn toàn yên tâm / an tâm" là cảm xúc, cho qua.
//  - "nhỏ nhất" sau từ cặn/bẩn/hạt/bụi/tạp chất/lọc/tách/giữ lại trong cùng vế ("lọc sạch cặn bẩn nhỏ nhất").
//  - "100%" / "100 phần trăm": chỉ bắt khi cả câu không có điều kiện "tùy" hoặc "có thể".
// Trả về mảng chuỗi chữ thường để nối vào danh sách cụm cấm (stripSentencesWith cắt đúng câu chứa chuỗi đó;
// riêng "100%" trả CẢ CÂU để câu khác có điều kiện không bị cắt oan).
const ABS_HOAN_TOAN_BEFORE = /(?:tách|lọc|khử|loại bỏ|xử lý|sạch)(?:\s+[\p{L}]+){0,2}\s+hoàn toàn(?!\s+(?:yên tâm|an tâm|miễn phí|tự do|mới|khác))/giu;
const ABS_HOAN_TOAN_AFTER = /hoàn toàn\s+(?:tách|lọc|khử|loại bỏ|sạch|tinh khiết|không còn (?:cặn|nước|bẩn|tạp))/giu;
const ABS_NHO_NHAT = /(?:cặn|bẩn|hạt|bụi|tạp chất|lọc|tách|giữ lại)[^.!?…\n;,]{0,30}nhỏ nhất/giu;
const ABS_100 = /\b100\s*(?:%|phần trăm)/iu;
// 3/10 vòng 2 (ChatGPT chấm: "hạn chế tối đa" và "chủ động hoàn toàn" lọt qua bộ quét): "tối đa" chỉ bắt khi
// đứng sát "hạn chế" / "giảm" (kể cả có một danh từ hao hụt xen giữa), nên "tốc độ tối đa 60 hải lý" không dính;
// "hoàn toàn" đứng cạnh "chủ động" ở cả hai thứ tự.
const ABS_TOI_DA = /(?<!\p{L})(?:hạn chế|giảm)\s+(?:(?:hao phí|rủi ro|thất thoát|chi phí|hư hỏng|cặn bẩn|tạp chất|nhiên liệu|dầu hao)\s+)?tối đa(?!\p{L})/giu;
const ABS_CHU_DONG = /(?<!\p{L})(?:chủ động\s+hoàn toàn|hoàn toàn\s+chủ động)(?!\p{L})/giu;
export function absoluteClaims(text) {
  const out = [];
  const s = String(text || '');
  for (const re of [ABS_HOAN_TOAN_BEFORE, ABS_HOAN_TOAN_AFTER, ABS_NHO_NHAT, ABS_TOI_DA, ABS_CHU_DONG]) {
    for (const m of s.matchAll(re)) out.push(m[0].toLowerCase());
  }
  for (const sent of s.split(SENT_SPLIT_NL)) {
    if (ABS_100.test(sent) && !/(?<!\p{L})(?:tùy|có thể)(?!\p{L})/iu.test(sent)) out.push(sent.trim().toLowerCase());
  }
  return [...new Set(out)];
}

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
const sentencesOf = (s) => String(s || '').trim().split(SENT_SPLIT).filter(Boolean);
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
// imageMaxWords (17/9 vòng 3, ChatGPT: máy SF300B đứng 6 giây, cabin 8 giây vẫn dài): ảnh tĩnh tách
// sớm hơn clip — ảnh >= 30 từ (~8 giây), clip >= 40 từ (~11 giây).
// 17/9 vòng 4 (ChatGPT: ảnh SF300B 6s + cảnh tàu 7s vẫn dài, B-roll nên 3-4s): ảnh 24 từ (~6,5s), clip 36 từ (~10s).
export function splitLongImageScenes(scenes, { maxWords = 36, imageMaxWords = 24, isImage, pickAsset, videoToo = false } = {}) {
  const out = [];
  let split = false;
  for (const s of Array.isArray(scenes) ? scenes : []) {
    const isImg = typeof isImage === 'function' && isImage(s.assetId);
    const splittable = typeof isImage === 'function' && (isImg || videoToo);
    const limit = isImg ? imageMaxWords : maxWords;
    if (s.role === 'price' || s.matchBy === 'must' || !splittable || wordCount(s.narration) < limit) { out.push(s); continue; }
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

// 17/9 vòng 6 (ChatGPT: lọc dầu gọi tên SF300B ở giây 8 nhưng HÌNH máy tới giây 23 mới ra — "sản phẩm
// bán hàng phải xuất hiện bằng hình trong 10 tới 15 giây"): tổng lời hook + empathy phải <= maxWords
// (~15s đọc) để cảnh giải pháp (hình máy) vào sớm. Sinh lại không đạt thì CẮT câu cuối của empathy
// (rồi của hook) cho tới khi đạt, giữ tối thiểu 1 câu mỗi cảnh.
export function wordsBeforeSolution(scenes) {
  let n = 0;
  for (const s of Array.isArray(scenes) ? scenes : []) {
    if (String(s?.role || '').toLowerCase() === 'solution') break;
    n += String(s?.narration || '').trim().split(/\s+/).filter(Boolean).length;
  }
  return n;
}
// 17/9 vòng 9 (ChatGPT: cảnh giải pháp lọc dầu là MỘT câu 40 từ nối 4 vế bằng dấu phẩy, chứa cùng lúc
// "may mà có" + "sạch bong" + "yên tâm bám biển"; cắt câu là rỗng cảnh nên bộ khôi phục giữ nguyên cả
// 3 cụm cấm, và ảnh SF300B đứng 13,7 giây vì cảnh "1 câu" không tách đôi được): câu nhiều hơn maxWords
// từ mà có dấu phẩy thì bẻ tại ranh giới vế thành các câu <= chunkWords từ. Prompt đã cấm câu quá 14
// chữ nhưng model vẫn viết — đây là chốt máy. Chỉ tách ở ", " (phẩy + khoảng trắng) nên số kiểu "1,5"
// không bị đụng.
export function breakLongSentences(text, { maxWords = 20, chunkWords = 14 } = {}) {
  const out = [];
  for (const sent of sentencesOf(text)) {
    if (wordCount(sent) <= maxWords || !/,\s/.test(sent)) { out.push(sent); continue; }
    const clauses = sent.split(/,\s+/);
    const chunks = [];
    let cur = '';
    for (const c of clauses) {
      const cand = cur ? `${cur}, ${c}` : c;
      if (cur && wordCount(cand) > chunkWords) { chunks.push(cur); cur = c; } else cur = cand;
    }
    if (cur) chunks.push(cur);
    out.push(...chunks.map((c, i) => {
      let t = c.trim().replace(/,$/, '');
      if (i > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
      if (i < chunks.length - 1 && !/[.!?…]["”’»)]?$/.test(t)) t += '.';
      return t;
    }));
  }
  return out.join(' ').trim();
}

// 17/9 vòng 9 (ChatGPT: video cộng đồng đọc "quây quần bên mâm cơm nóng trên boong" trên clip VĂN PHÒNG,
// lọc nước mở màn "thùng inox trên boong đã cạn đáy" trên ảnh HỘI THẢO — "nút thắt hiện tại là đồng bộ
// lời mới với đúng cảnh cũ"): câu nhắc CẢNH VẬT CỤ THỂ (boong, mâm cơm, thùng nước, cảng...) thì mô tả
// tư liệu của cảnh phải có cảnh vật đó; không có = "lời trôi khỏi hình". Chỉ dùng cho cảnh vấn đề / đời
// sống (hook, empathy, story) — câu lợi ích ở cảnh giải pháp không bị đụng. So không dấu; từ ngắn so
// nguyên từ ("cảng" -> "cang" không được dính "cảnh" -> "canh").
// 1/10 (Thanh xem bản dựng lại 22452d7f: lời "vệt dầu bám trên con ốc gỉ sét" trên clip thợ lắp
// THIẾT BỊ MỚI): thêm nhóm chi tiết cận cảnh hay bị bịa — ốc vít gỉ sét, vệt dầu — mô tả clip
// không nhắc thì câu tả mấy thứ này phải bị coi là trôi khỏi hình.
// 1/10 (2): lần dựng thứ 2 cảnh 2 đọc "chòng chành sóng nước" trên hình CẢNG CÁ TRÊN BỜ — thêm nhóm tả biển động.
const IMAGERY_TERMS = ['trên boong', 'boong tàu', 'mâm cơm', 'thùng inox', 'thùng nước', 'trưa nắng', 'sương mù', 'sương mờ', 'chợ cá', 'kéo lưới', 'mẻ lưới', 'phòng họp', 'hội thảo', 'văn phòng', 'bến cá', 'cảng', 'ốc gỉ', 'ốc rỉ', 'con ốc', 'gỉ sét', 'rỉ sét', 'vệt dầu', 'dầu bám', 'đi dây điện', 'chòng chành', 'sóng nhồi', 'lắc lư', 'sóng nước', 'giữa khơi', 'giữa biển', 'lênh đênh'];
const foldText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
function hasImagery(foldedText, term) {
  const f = foldText(term);
  if (f.includes(' ') || f.length > 4) return foldedText.includes(f);
  return new RegExp(`(^|[^a-z0-9])${f}($|[^a-z0-9])`).test(foldedText);
}
// 18/9 vòng 10 (ChatGPT chấm lọc dầu: "bạn ghe nhìn cười trừ" trong khi hình cabin KHÔNG có người —
// lỗi cụ thể cần ưu tiên; trước đó "anh thợ máy thốt lên" cũng trên hình không người): câu tả NGƯỜI
// đang làm gì thấy được (cười, bàn tay, ánh mắt...) thì tư liệu phải có người. So CÓ DẤU phía lời
// ("cười" và "cuối" cùng gấp thành "cuoi" nên không so không dấu được); phía mô tả tư liệu so không
// dấu (mô tả cũ hay ghi không dấu), và mô tả ghi rõ "không thấy người" thì coi như không có người.
const PERSON_SENT_TERMS = ['cười', 'nụ cười', 'bàn tay', 'gương mặt', 'ánh mắt', 'lắc đầu', 'thốt lên'];
const PERSON_ASSET_WORDS = ['nguoi', 'tho', 'ngu dan', 'nhan vien', 'ky thuat', 'anh em', 'ba con', 'thuyen vien', 'thuyen truong', 'chu tau'];
const sentHasPerson = (sent) => {
  const s = String(sent || '').toLowerCase();
  return PERSON_SENT_TERMS.some((t) => new RegExp(`(^|\\P{L})${t}(\\P{L}|$)`, 'u').test(s));
};
const assetHasPerson = (foldedAsset) => {
  if (foldedAsset.includes('khong thay nguoi') || foldedAsset.includes('khong co nguoi')) return false;
  return PERSON_ASSET_WORDS.some((w) => (w.length <= 4
    ? new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`).test(foldedAsset)
    : foldedAsset.includes(w)));
};
export function imageryDriftSentences(narration, assetText) {
  const at = foldText(assetText);
  const personOk = assetHasPerson(at);
  const out = [];
  for (const sent of sentencesOf(narration)) {
    const fs = foldText(sent);
    const terms = IMAGERY_TERMS.filter((t) => hasImagery(fs, t));
    if (terms.length && !terms.some((t) => hasImagery(at, t))) { out.push(sent); continue; }
    if (!personOk && sentHasPerson(sent)) out.push(sent);
  }
  return out;
}
// 23/9 (bài 1f608ee3 "Ra cảng xem thợ kiểm tra máy": mô tả clip chỉ ghi "nhân viên SDVICO gặp khách
// cầm hồ sơ tại cảng" nhưng lời mở đọc "ANH nhân viên XÁCH VALI DỤNG CỤ bước xuống MẠN" — guard cũ chỉ
// bắt lời THIẾU từ chung với mô tả, không bắt lời BỊA THÊM): câu nhắc ĐẠO CỤ/HÀNH ĐỘNG cụ thể (vali,
// xách, xuống mạn...) thì mô tả tư liệu phải có; gọi người kèm GIỚI TÍNH (anh/chị/chú/cô + nhân viên/
// thợ/kỹ thuật/khách) thì mô tả phải ghi giới tính đó. Giới tính phía mô tả so bản CÓ DẤU ("cô"/"chị"
// gấp không dấu thành "co"/"chi" dính "có"/"chi phí"). Chỉ dùng cho cảnh gắn clip bắt buộc / tư liệu
// cảnh 1 đã chọn — không quét cả kịch bản để khỏi bắt oan cảnh tự do.
const PROP_TERMS = ['vali', 'va li', 'đồ nghề', 'hộp dụng cụ', 'túi đồ', 'thùng đồ', 'xách', 'khiêng', 'vác', 'bưng', 'xuống mạn', 'mạn tàu'];
const GENDER_ROLE = '(nhân viên|thợ|kỹ thuật|khách)';
const MALE_SENT = new RegExp(`(^|\\P{L})(anh|chú|ông)\\s+${GENDER_ROLE}`, 'u');
const FEMALE_SENT = new RegExp(`(^|\\P{L})(chị|cô|bà)\\s+${GENDER_ROLE}`, 'u');
export function inventedDetailSentences(narration, assetText) {
  const at = foldText(assetText);
  const raw = String(assetText || '').toLowerCase();
  const assetMale = /(^|\P{L})(anh|chú|ông|đàn ông)(\P{L}|$)/u.test(raw);
  const assetFemale = /(^|\P{L})(chị|cô|bà|phụ nữ)(\P{L}|$)/u.test(raw);
  const out = [];
  for (const sent of sentencesOf(narration)) {
    const s = String(sent).toLowerCase();
    const fs = foldText(sent);
    if (PROP_TERMS.some((t) => hasImagery(fs, t) && !hasImagery(at, t))) { out.push(sent); continue; }
    if (MALE_SENT.test(s) && !assetMale) { out.push(sent); continue; }
    if (FEMALE_SENT.test(s) && !assetFemale) out.push(sent);
  }
  return out;
}
// 18/9 vòng 10 (ChatGPT chấm lọc nước 77 nhưng dặn: câu mở "Máy lọc nước này sửa tới lần thứ ba"
// khiến người xem hiểu chiếc máy ĐANG BÁN chính là chiếc vừa bị chê hỏng liên tục): cảnh nỗi đau
// (hook/empathy) của video bán hàng không được trỏ "máy ... này" vào sự cố. Trả về các cụm dính.
const SELF_FAULT_PHRASES = ['máy lọc nước này', 'máy lọc dầu này', 'máy này sửa', 'máy này hỏng', 'máy này lại', 'máy này cứ'];
export function selfProductFaultPhrases(narration) {
  const t = String(narration || '').toLowerCase();
  return SELF_FAULT_PHRASES.filter((p) => t.includes(p));
}

// 2/10: storyboard-first ra lời thuyết minh "...phải không?" ở cảnh giữa — câu hỏi giao lưu chỉ được ở cảnh cuối.
// Chỉ bắt đúng các cụm hỏi giao lưu trong danh sách; câu cảm và câu hỏi tu từ khác không bị bắt.
const SB_CHATTER_TERMS = ['phai khong', 'dung khong', 'phai hong', 'dung hong', 'thay khong', 'thay hong', 'co thay vay khong'];
export function sbChatterSentences(narration) {
  const out = [];
  for (const sent of sentencesOf(narration)) {
    const fs = foldText(sent);
    if (SB_CHATTER_TERMS.some((t) => new RegExp(`(^|[^a-z0-9])${t}($|[^a-z0-9])`).test(fs))) out.push(sent);
  }
  return out;
}

// 2/10 (rào cứng): model né guard khớp-hình bằng cách TẢ hình ("Thợ máy đang lắp đặt thiết bị..."). Bắt câu tả
// hình thuần ngôi thứ ba: có " đang " mà KHÔNG có ngôi kể (mình, tôi, ta, em, anh em, bà con, các bác, chúng mình,
// tụi mình; "người ta" là ngôi thứ ba nên không tính), hoặc mở bằng "Đây là" / "Đó là". So không dấu.
const SB_NARRATOR_RE = /(^|[^a-z0-9])(minh|toi|ta|em|anh em|ba con|cac bac|chung minh|tui minh)($|[^a-z0-9])/;
export function sbDescriptiveSentences(narration) {
  const out = [];
  for (const sent of sentencesOf(narration)) {
    const fs = foldText(sent).trim();
    if (/^(day|do) la($|[^a-z0-9])/.test(fs)) { out.push(sent); continue; }
    if (!/(^|[^a-z0-9])dang($|[^a-z0-9])/.test(fs)) continue;
    if (SB_NARRATOR_RE.test(fs.replace(/nguoi ta/g, 'nguoixa'))) continue;
    out.push(sent);
  }
  return out;
}

// Cắt các câu trôi khỏi hình; cắt hết thì trả '' (người gọi tự quyết giữ bản gốc, như luật cắt cụm cấm).
export function cutImageryDrift(narration, assetText) {
  const bad = new Set(imageryDriftSentences(narration, assetText));
  if (!bad.size) return String(narration || '');
  return sentencesOf(narration).filter((s) => !bad.has(s)).join(' ').trim();
}

export function trimEarlyScenes(scenes, maxWords = 58) {
  const list = (Array.isArray(scenes) ? scenes : []).map((s) => ({ ...s }));
  let trimmed = false;
  const dropLastSentence = (scene) => {
    const sents = sentencesOf(scene.narration);
    if (sents.length < 2) return false;
    scene.narration = sents.slice(0, -1).join(' ');
    return true;
  };
  const early = () => list.filter((s) => String(s.role || '').toLowerCase() !== 'solution' || false);
  void early;
  let guard = 12;
  while (wordsBeforeSolution(list) > maxWords && guard-- > 0) {
    const idx = list.findIndex((s) => String(s.role || '').toLowerCase() === 'solution');
    const before = idx < 0 ? list : list.slice(0, idx);
    // Cắt từ cảnh SÁT cảnh giải pháp ngược lên (empathy trước, hook sau cùng).
    let cut = false;
    for (let i = before.length - 1; i >= 0 && !cut; i--) cut = dropLastSentence(before[i]);
    if (!cut) break;
    trimmed = true;
  }
  return { scenes: list, trimmed };
}

// 3/10 vòng 2 (ChatGPT chấm lọc dầu 6,0: phụ đề vẫn "tiết kiệm từ 5% đến 10% nhiên liệu" KHÔNG điều kiện dù
// prompt vòng 1 đã dặn kèm điều kiện, model bỏ qua): lời dặn prompt không đủ, đây là bước TẤT ĐỊNH sau khi
// kịch bản chốt. Câu có "tiết kiệm" hoặc "giảm" đi trước một số phần trăm mà chưa có "tùy" / "có thể" thì được
// viết lại: chèn "có thể" ngay trước động từ (đứng đầu câu thì "Có thể" + hạ chữ hoa; "giúp tiết kiệm" thì chèn
// trước "giúp") và nối ", tùy tình trạng máy" trước dấu kết câu. Câu có số tiền (triệu, đồng) bị bỏ qua vì
// "giảm 10% giá" không phụ thuộc tình trạng máy. Chạy lại lần 2 không đổi gì (câu đã có "có thể" / "tùy").
const SAVINGS_RE = /(?<!\p{L})(?:tiết kiệm|giảm)(?!\p{L})[^.!?…]*?\d+(?:[.,]\d+)?\s*(?:%|phần trăm)/iu;
const SAVINGS_KEYWORD_RE = /(?<!\p{L})(?:tiết kiệm|giảm)(?!\p{L})/iu;
const SAVINGS_COND_RE = /(?<!\p{L})(?:tùy|có thể)(?!\p{L})/iu;
const SAVINGS_MONEY_RE = /(?<!\p{L})(?:triệu|đồng)(?!\p{L})/iu;
const SAVINGS_SUFFIX = ', tùy tình trạng máy';
function conditionSavingsSentence(sent) {
  if (!SAVINGS_RE.test(sent) || SAVINGS_COND_RE.test(sent) || SAVINGS_MONEY_RE.test(sent)) return sent;
  const kw = sent.match(SAVINGS_KEYWORD_RE);
  if (!kw) return sent;
  let at = kw.index;
  const giup = sent.slice(0, at).match(/(?<!\p{L})giúp\s+$/iu);
  if (giup) at = giup.index;
  const head = sent.slice(0, at);
  const tail = sent.slice(at);
  const startsSentence = !/\p{L}/u.test(head);
  let out = startsSentence
    ? `${head}Có thể ${tail.charAt(0).toLowerCase()}${tail.slice(1)}`
    : `${head}có thể ${tail}`;
  const end = out.match(/([.!?…]+["”’»)]*)$/u);
  if (end) {
    const body = out.slice(0, end.index).replace(/[,\s]+$/, '');
    out = `${body}${SAVINGS_SUFFIX}${end[1]}`;
  } else {
    out = `${out.replace(/[,\s]+$/, '')}${SAVINGS_SUFFIX}`;
  }
  return out;
}
export function ensureSavingsCondition(narration) {
  const text = String(narration || '');
  if (!text.trim()) return text;
  // Tách giữ nguyên khoảng trắng: phần chẵn là câu, phần lẻ là dấu ngăn.
  const parts = text.split(/((?<=[.!?…]["”’»)]?)\s+)/u);
  return parts.map((p, i) => {
    if (i % 2 === 1) return p;
    const lead = p.match(/^\s*/)[0];
    const trail = p.match(/\s*$/)[0];
    const core = p.trim();
    return core ? `${lead}${conditionSavingsSentence(core)}${trail}` : p;
  }).join('');
}

// 3/10 vòng 2 (ChatGPT chấm lọc nước 6,5: hook "Hôm nay sửa tới lần thứ ba rồi đấy!" khiến người xem tưởng máy
// đang bán hay hỏng): câu trong CẢNH 1 của video BÁN HÀNG nói chuyện sửa máy chung chung ("sửa tới / sửa lần /
// sửa hoài / sửa mãi / sửa máy") mà không kèm "cũ" (máy cũ trên tàu) thì bị bắt. Nỗi đau mở màn phải bám đúng
// thứ sản phẩm giải quyết (nước, dầu, cặn). Trả về các CÂU dính (log, nhắc model sinh lại, rồi cắt câu).
const HOOK_REPAIR_RE = /(^|[^a-z0-9])(sua (toi|lan|hoai|mai)|sua may)($|[^a-z0-9])/;
export function hookRepairSentences(narration) {
  const out = [];
  for (const sent of sentencesOf(String(narration || '').normalize('NFC'))) {
    if (!HOOK_REPAIR_RE.test(foldText(sent))) continue;
    if (/(?<!\p{L})cũ(?!\p{L})/iu.test(sent)) continue;
    out.push(sent);
  }
  return out;
}

// 3/10 vòng 2 (ChatGPT chấm cảng cá 7,5: cảnh kết có 2 câu hỏi cạnh tranh nhau): cảnh closing của video CONTENT
// chỉ giữ MỘT câu hỏi giao lưu. Nhiều hơn một câu hỏi thì giữ câu hỏi ĐẦU TIÊN, bỏ các câu hỏi sau; câu trần
// thuật giữ nguyên. Có tối đa một câu hỏi thì trả lại đúng chuỗi cũ.
export function keepOneQuestion(narration) {
  const text = String(narration || '');
  const sents = sentencesOf(text);
  if (sents.filter((s) => s.includes('?')).length <= 1) return text;
  let seen = false;
  return sents.filter((s) => {
    if (!s.includes('?')) return true;
    if (seen) return false;
    seen = true;
    return true;
  }).join(' ').trim();
}
