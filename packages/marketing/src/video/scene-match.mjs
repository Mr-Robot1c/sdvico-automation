// scene-match.mjs — KHỚP CẢNH ↔ TƯ LIỆU theo MÔ TẢ (15/9, sếp qua kế hoạch "SDVICO sửa web":
// "kịch bản nói máy hư hỏng, nước đục mà lại lấy hình máy sản phẩm mới bóng thì sao mà bán?
// Kịch bản phải đi đôi với đúng video. ĐÂY LÀ CÁI PHẢI SỬA CHO ĐÚNG").
//
// Trước: model viết lời thoại + tự chọn asset_id trong CÙNG một lượt, chỉ nhìn "id | kind | title"
// (title 8-12 chữ, không phân biệt máy mới / máy hư / nước đục); id sai thì rơi về assets[i % n]
// (mù nội dung). Nay tách 2 bước:
//   1. Kịch bản (script.mjs) sinh lời thoại + `visual` = hình cần cho cảnh (không chọn id).
//   2. Module này: đưa các cảnh + danh sách tư liệu KÈM MÔ TẢ (brand_assets.description) cho
//      model chấm, trả asset_id + điểm khớp 0-10 + lý do; điểm thấp / id sai -> chọn theo LUẬT VAI
//      CẢNH (pickByRole) chứ không xoay vòng mù nữa.
//
// Luật vai cảnh (cố định, không cần model):
//   - hook / empathy / story (cảnh VẤN ĐỀ, đời sống): ưu tiên clip thật, tư liệu mô tả có dấu hiệu
//     "cũ, hư, bẩn, cặn, đục, sửa, tháo, khói, rỉ, nằm bờ, biển, tàu, ngư dân"; TRÁNH ảnh sản phẩm
//     mới bóng (studio, nền trắng, "mới", "trưng bày").
//   - solution / reward / closing (cảnh GIẢI PHÁP): ưu tiên tư liệu sản phẩm (đúng folder), cảnh lắp
//     đặt, máy chạy; ảnh sản phẩm được phép.
//   - Không dùng cùng một tư liệu ở 2 cảnh liền nhau nếu còn lựa chọn khác.

import { crossProductTerms, imageryDriftSentences, cutImageryDrift, inventedDetailSentences, sbDescriptiveSentences } from './rules.mjs';
import { segmentsEnabled, segKey, segLen, estimateSpeechSec, COVER_SLACK } from './segments.mjs';

const PROBLEM_ROLES = new Set(['hook', 'empathy', 'story']);
const PROBLEM_WORDS = ['cũ', 'hư', 'hỏng', 'bẩn', 'cặn', 'đục', 'sửa', 'tháo', 'khói', 'rỉ', 'gỉ', 'nằm bờ', 'lợ', 'mặn', 'lọc thô bẩn', 'đen', 'nghẹt', 'kẹt', 'chết máy', 'biển', 'tàu', 'ngư dân', 'bà con', 'cảng', 'khoang máy', 'thợ máy', 'lưới', 'khơi', 'sóng', 'ra khơi', 'cập bến'];
const SHINY_WORDS = ['mới', 'trưng bày', 'nền trắng', 'studio', 'showroom', 'bóng', 'catalog', 'ảnh sản phẩm', 'đóng gói', 'hộp'];
const SOLUTION_WORDS = ['lắp', 'lắp đặt', 'đang chạy', 'vận hành', 'sạch', 'trong', 'máy lọc', 'thiết bị', 'sản phẩm', 'nước ngọt', 'dầu sạch', 'bàn giao', 'kỹ thuật'];

function textOf(a) {
  return `${a.title || ''} ${a.description || ''} ${a.label || ''}`.toLowerCase();
}
// 17/9: so KHÔNG DẤU cả hai phía (mô tả cũ hay ghi không dấu); từ ngắn <= 3 ký tự sau khi bỏ
// dấu ("cũ" -> "cu") phải khớp nguyên từ, tránh dính "cua", "cum"...
function count(text, list) {
  const t = fold(text);
  let n = 0;
  for (const w of list) {
    const f = fold(w);
    const hit = f.length <= 3 ? new RegExp(`(^|[^a-z0-9])${f}($|[^a-z0-9])`).test(t) : t.includes(f);
    if (hit) n += 1;
  }
  return n;
}
function isVideoAsset(a) { return a.kind === 'video' || a.kind === 'clip'; }

// 17/9 chiều (video lọc nước 7e9cab1a: cảnh "thùng nước cạn" chiếu ảnh đồng hồ máy SEA-40 của công ty):
// cảnh VẤN ĐỀ không được dùng tư liệu folder SẢN PHẨM (máy SDVICO đang chạy, ảnh máy) trừ khi tư liệu
// đó quay sự cố / sửa chữa. Có tư liệu Content (tàu thật, khoang máy, thợ) thì bắt buộc lấy từ đó.
// Thứ tự: (1) kho Content nếu có; (2) không có thì tư liệu sản phẩm có từ sự cố; (3) không có nữa mới lấy hết.
// So từ sự cố CÓ DẤU, nguyên từ (bộ so không dấu biến "cận cảnh" thành "can" trùng "cặn" -> ảnh đồng hồ máy
// lọt vào nhóm sự cố); mô tả không dấu thì mới so không dấu.
const FAULT_WORDS = ['hư', 'hỏng', 'sự cố', 'cặn', 'đục', 'bẩn', 'sửa', 'tháo', 'rỉ', 'gỉ', 'nghẹt', 'kẹt', 'chết máy', 'trục trặc', 'bảo trì', 'đen'];
function hasFault(text) {
  const raw = String(text || '').toLowerCase();
  if (/[àáảãạăâđèéẻẽẹêìíỉĩịòóỏõọôơùúủũụưỳýỷỹỵ]/.test(raw)) {
    return FAULT_WORDS.some((w) => new RegExp(`(^|[^\\p{L}])${w}($|[^\\p{L}])`, 'u').test(raw));
  }
  return count(raw, FAULT_WORDS) > 0;
}
// 17/9 chiều (3) (user: "script nói hết sạch nước ngọt mà đem ảnh máy lọc dầu vô"): kho Content lẫn ảnh ruột
// máy lọc dầu ("Hậu trường lắp ráp thiết bị", "ống thiết bị cũ có dầu bẩn"), bình inox, văn bản, bánh sinh
// nhật... Cảnh nỗi đau chỉ được là ĐỜI SỐNG NGHỀ (tàu, cảng, ngư dân, khoang máy, thợ máy): loại tư liệu có
// máy lọc / linh kiện SDVICO / giấy tờ / văn phòng khỏi kho Content trước, còn gì mới lấy.
// Cụm chung (giấy tờ, văn phòng, linh kiện, bình inox...) + cụm của SẢN PHẨM KIA (rules.mjs crossProductTerms:
// video lọc nước loại ảnh cốc lọc dầu cặn; video lọc dầu vẫn được dùng ảnh đó vì đúng nỗi đau của nó).
// 17/9 vòng 9 (ChatGPT chấm lọc nước 60/100: cảnh 1 "thùng inox trên boong cạn đáy" chiếu ảnh "Hội thảo
// tập huấn ngư dân" — hội trường, màn chiếu, bục phát biểu; ảnh nằm folder Content và không dính từ nào
// trong danh sách nên lọt kho nỗi đau): cảnh họp hành / trình chiếu không phải đời sống nghề trên tàu.
const NOT_PAIN_WORDS = ['lắp ráp', 'hậu trường', 'linh kiện', 'bình chứa', 'bình lọc', 'inox', 'đầu bơm', 'hộp số', 'chế tạo', 'sdvico', 'văn bản', 'nghị quyết', 'quyết định', 'bánh kem', 'sinh nhật', 'túi vải', 'hàng hóa', 'cuộn', 'văn phòng', 'máy tính', 'nhân viên', 'hội thảo', 'tập huấn', 'trình chiếu', 'thuyết trình', 'hội nghị', 'phòng họp', 'bục phát biểu', 'tọa đàm', 'lớp học'];
function isPainLife(a, group) {
  const t = textOf(a);
  return count(t, NOT_PAIN_WORDS) === 0 && count(t, crossProductTerms(group)) === 0;
}
export function problemPool(assets, role, group = null) {
  if (!PROBLEM_ROLES.has(role)) return assets;
  const content = assets.filter((a) => String(a.folder || a.product_group || '') === 'Content');
  const life = content.filter((a) => isPainLife(a, group));
  if (life.length) return life;
  if (content.length) return content;
  const fault = assets.filter((a) => hasFault(textOf(a)));
  return fault.length ? fault : assets;
}

// Từ có nghĩa trong câu "hình cần" (>= 3 ký tự, bỏ từ nối) để so với tiêu đề + mô tả tư liệu.
// 17/9: QUY VỀ KHÔNG DẤU trước khi so — nhiều mô tả tư liệu cũ ghi không dấu ("Nhan vien van
// phong"), so có dấu vs không dấu trượt hết làm visualOverlap luôn bằng 0 với các tư liệu đó.
function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}
const STOP = new Set(['cua', 'cho', 'voi', 'tren', 'trong', 'dang', 'mot', 'cac', 'nhung', 'nay', 'kia', 'va', 'hoac', 'canh', 'hinh', 'anh', 'clip', 'video', 'thay', 'can', 'co', 'la', 'duoc', 'tai', 'tu', 'den', 'khi', 'thi', 'ma', 'rat', 'nhieu', 'do']);
function words(text) {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));
}
// Số từ trùng giữa "hình cần" của cảnh và tư liệu (0..n) — tín hiệu nội dung trực tiếp.
export function visualOverlap(visual, asset) {
  const v = new Set(words(visual));
  if (!v.size) return 0;
  const t = new Set(words(textOf(asset)));
  let n = 0;
  for (const w of v) if (t.has(w)) n += 1;
  return n;
}

// Lấy JSON object ĐẦU TIÊN cân bằng ngoặc trong chuỗi (model có khi trả 2 object hoặc kèm chữ thừa).
export function extractFirstJson(text) {
  const t = String(text || '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fence ? fence[1] : t;
  try { return JSON.parse(src.trim()); } catch { /* thử cắt */ }
  const start = src.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) { try { return JSON.parse(src.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

// 1/10 (Thanh xem 22452d7f: lời "đội ngũ kỹ thuật cúi gằm đi dây điện" trên hình CẢNG CÁ + TÀU):
// ruleScore cộng 2 điểm cho MỌI từ nghề biển (tàu, cảng, ngư dân...) nên ảnh cảng chung chung
// thắng cả khi cảnh cần hình NGƯỜI THỢ đang làm việc (clip thợ quen lại bị recentUse phạt).
// Luật mới: "hình cần" của cảnh nhắc người làm việc mà tư liệu không có ai làm việc thì trừ 8.
const WORKER_WORDS = ['thợ', 'kỹ thuật', 'kĩ thuật', 'lắp', 'sửa', 'thao tác', 'kiểm tra', 'đi dây', 'nhân viên', 'công nhân', 'bảo trì', 'tháo', 'căn chỉnh'];
// 1/10 (2) (bản dựng lần 3: LỜI "anh em kỹ thuật kiên nhẫn căn chỉnh" vẫn rơi lên hình cảng vì
// model viết "hình cần" chung chung): xét CẢ LỜI ĐỌC lẫn "hình cần" — người xem nghe lời, không
// đọc trường visual.
function needsWorker(visual, narration = '') { return count(`${String(visual || '')} ${String(narration || '')}`.toLowerCase(), WORKER_WORDS) > 0; }
function hasWorker(assetText) { return count(assetText, [...WORKER_WORDS, 'người đàn ông', 'ngư dân đang', 'đang làm']) > 0; }

// 3/10 (ChatGPT chấm video lọc nước 7,3/10: "thiếu cảnh chứng minh nước ngọt chảy ra"): video máy lọc nước
// (SEA-40), cảnh giải pháp / phần thưởng cộng +6 cho tư liệu mô tả cảnh nước chảy ra, ly nước, thử nước.
// So nguyên từ trên chữ không dấu: "uống" => "uong" nếu so chuỗi con sẽ dính tường, xương, đường, kiên cường...
// 3/10 (3) — kiểm bản dựng thật: từ ĐƠN bỏ dấu dính oan ("vòi" -> "voi" trúng "với" nên clip khảo sát
// thuyền cũng tính là nước chảy). Chỉ giữ CỤM >= 2 từ an toàn khi bỏ dấu.
const WATER_FLOW_WORDS = ['nước chảy', 'ly nước', 'thử nước', 'nếm thử', 'nước ngọt chảy', 'hứng nước', 'rót nước', 'uống thử'];
const WATER_FLOW_BONUS = 6;
export function isWaterGroup(group) {
  return /loc nuoc|(^|[^a-z])sea-?\d/.test(fold(group));
}
export function showsWaterFlow(asset) {
  const t = fold(textOf(asset || {}));
  return WATER_FLOW_WORDS.some((w) => new RegExp(`(^|[^a-z0-9])${fold(w)}($|[^a-z0-9])`).test(t));
}

// Điểm luật cho 1 tư liệu với 1 vai cảnh (càng cao càng hợp). Dùng cho fallback và để kiểm model.
// opts.productGroup (3/10): nhóm sản phẩm video bán hàng, để cộng điểm cảnh nước chảy cho video lọc nước.
export function ruleScore(asset, role, opts = {}) {
  const t = textOf(asset);
  const overlap = opts.visual ? visualOverlap(opts.visual, asset) : 0;
  const isContentFolder = String(asset.folder || asset.product_group || '') === 'Content';
  let s = 0;
  if (PROBLEM_ROLES.has(role)) {
    s += count(t, PROBLEM_WORDS) * 2;
    if (needsWorker(opts.visual, opts.speech) && !hasWorker(t)) s -= 8; // 1/10: cảnh cần thợ, hình không có ai làm việc
    // 17/9 vòng 6 (ChatGPT: video cộng đồng "bằng chứng làm thật bị dồn về cuối"): cảnh story ưu tiên
    // hình NGƯỜI đang làm việc hơn tàu/cảng chung chung.
    if (role === 'story') s += count(t, ['kỹ thuật', 'thợ', 'thao tác', 'kiểm tra', 'lắp', 'sửa', 'nhân viên']) * 2;
    // 17/9 vòng 7 (ChatGPT soi: clip story chọn theo TIÊU ĐỀ "thợ kiểm tra" nhưng khung hình toàn cận
    // máy, người rõ mãi giây 14): mô tả ghi rõ không thấy người thì cảnh cần người tránh ra.
    if (fold(t).includes('khong thay nguoi')) s -= 6;
    s -= count(t, SHINY_WORDS) * 3;
    if (isContentFolder) s += 3;            // đời sống nghề, tàu thật
    if (isVideoAsset(asset)) s += 2;        // cảnh vấn đề cần chuyển động
    if (asset.fresh) s += 2;                // clip thật mới
  } else {
    s += count(t, SOLUTION_WORDS) * 2;
    if (!isContentFolder) s += 3;           // đúng folder sản phẩm
    if (isVideoAsset(asset)) s += 1;
    s -= count(t, ['hư', 'hỏng', 'cặn', 'đục', 'khói']) * 1; // giải pháp không nên khoe máy hỏng
    // 3/10: video lọc nước, cảnh giải pháp / phần thưởng ưu tiên clip nước ngọt chảy ra (kho chưa có thì không đổi gì).
    if ((role === 'solution' || role === 'reward') && isWaterGroup(opts.productGroup) && showsWaterFlow(asset)) s += WATER_FLOW_BONUS;
  }
  if (!asset.description) s -= 1;          // chưa có mô tả: kém tin cậy hơn
  s += Math.min(overlap, 4) * 2;           // 15/9: hình cần của cảnh trùng từ với tư liệu -> ưu tiên rõ
  return s;
}

// Chọn theo luật cho 1 cảnh, tránh trùng cảnh liền trước và hạn chế lặp trong video.
// 29/9 (Thanh: "1 số video gần đây bắt đầu dùng chung video nội bộ"): thêm recentUse = Map(id -> số
// video 14 ngày gần nhất đã dùng tư liệu đó). Từ khi trọng tâm dồn về một sản phẩm, mọi video cùng
// nhóm nên bộ "điểm cao nhất" thắng y hệt mỗi ngày (5 video 23-29/9 chung đúng 4 clip) — phạt điểm
// theo số lần vừa lên video để kho được xoay đều; kho ít tư liệu thì phạt chỉ đổi thứ tự, không làm rỗng.
export function pickByRole(assets, role, { prevId = null, usedCount = new Map(), visual = '', speech = '', recentUse = new Map(), productGroup = null } = {}) {
  let best = null;
  let bestScore = -Infinity;
  for (const a of assets) {
    let s = ruleScore(a, role, { visual, speech, productGroup });
    if (a.id === prevId) s -= 6;
    s -= (usedCount.get(a.id) || 0) * 2;
    s -= Math.min(recentUse.get(a.id) || 0, 3) * 2;
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return best;
}

// ======================================================================================================
// ĐỢT A (9/10): CHỌN ĐOẠN TRONG CLIP + GIỮ MỘT CỤM TƯ LIỆU XUYÊN SUỐT VIDEO.
// Gốc: scene-match chấm từng cảnh riêng nên video nhảy giữa nhiều buổi quay khác nhau, còn assemble luôn lấy
// clip từ giây 0 và lặp. Nay clip có `segments` (các đoạn 2-12s, mỗi đoạn ghi hành động thấy thật) và
// `shoot_cluster` (cụm buổi quay) thì:
//   1. pickPrimaryCluster chọn MỘT cụm chính cho cả video (cụm phủ nhiều vai cảnh nhất);
//   2. mỗi cảnh chọn đoạn TRONG cụm trước (pickInCluster); chỉ lấy ngoài cụm khi không còn đoạn nào hợp, và
//      ghi rõ lý do vào `why` ("ngoài cụm: ..."); chống lặp / recentUse chỉ xếp thứ tự TRONG cụm, KHÔNG được
//      đá một pick trong cụm ra ngoài cụm;
//   3. allocateSceneSegments (sau khi đã tách cảnh, ghim cảnh 1) gán đoạn chính + các đoạn nối thêm cùng việc.
// Clip KHÔNG có segments: mọi đường cũ chạy y nguyên. VIDEO_SEGMENTS=off bỏ hẳn đường mới.
// ======================================================================================================
// Một đoạn chỉ được xét cho cảnh khi có ÍT NHẤT chừng này tín hiệu liên quan (từ vai cảnh + trùng từ với "hình cần"/lời).
export const CLUSTER_MIN_RELEVANCE = 1;

export function hasSegments(a) {
  return !!a && isVideoAsset(a) && Array.isArray(a.segments) && a.segments.length > 0;
}
export function segmentText(seg) {
  return [seg?.action, seg?.people, seg?.equipment, seg?.setting, seg?.note].map((x) => String(x || '').trim()).filter(Boolean).join('. ');
}
// Tư liệu giả đại diện RIÊNG cho một đoạn: mô tả = chữ của đoạn; tiêu đề / nhãn bỏ để không kéo điểm theo tên clip.
export function segAsset(asset, seg) {
  return { ...asset, title: '', label: '', description: segmentText(seg) };
}
// Điểm một đoạn cho một vai cảnh = điểm luật cũ áp lên chữ của đoạn; đoạn cắt khung dọc không còn thấy chủ thể trừ 3.
export function scoreSegment(asset, seg, role, opts = {}) {
  let s = ruleScore(segAsset(asset, seg), role, opts);
  if (seg?.vertical_ok === false) s -= 3;
  return s;
}
// Số tín hiệu liên quan của đoạn với cảnh: từ vai cảnh có trong chữ đoạn + từ trùng với "hình cần" và lời.
export function segmentRelevance(asset, seg, role, { visual = '', speech = '' } = {}) {
  const sa = segAsset(asset, seg);
  const t = textOf(sa);
  const roleHits = PROBLEM_ROLES.has(role) ? count(t, PROBLEM_WORDS) : count(t, SOLUTION_WORDS);
  return roleHits + visualOverlap(`${visual} ${speech}`, sa);
}
// Tham chiếu một đoạn gắn vào cảnh (gọn, ghi được vào brief).
export function segmentRef(asset, idx) {
  const seg = asset.segments[idx];
  return { assetId: asset.id, idx, start: Number(seg.start), end: Number(seg.end), text: segmentText(seg).slice(0, 200) };
}
function sceneRole(scenes, i) {
  return scenes[i]?.role || (i === 0 ? 'hook' : i === scenes.length - 1 ? 'closing' : 'solution');
}

// Chọn đoạn tốt nhất của MỘT clip cho một cảnh (đoạn chưa dùng); không đoạn nào thì null.
export function chooseSegment(asset, scene, role, { usedSegKeys = new Set(), productGroup = null } = {}) {
  if (!hasSegments(asset)) return null;
  let best = null;
  asset.segments.forEach((seg, idx) => {
    if (usedSegKeys.has(segKey(asset.id, idx)) || segLen(seg) <= 0) return;
    const s = scoreSegment(asset, seg, role, { visual: scene?.visual, speech: scene?.narration, productGroup });
    if (!best || s > best.s) best = { s, idx };
  });
  return best ? segmentRef(asset, best.idx) : null;
}

// Gom clip theo cụm buổi quay. Chỉ tính clip video CÓ đoạn và có shoot_cluster.id.
export function clusterGroups(assets) {
  const m = new Map();
  for (const a of Array.isArray(assets) ? assets : []) {
    const id = a?.shoot_cluster?.id;
    if (!id || !hasSegments(a)) continue;
    if (!m.has(id)) m.set(id, { id, clips: [], sure: true, basis: String(a.shoot_cluster.basis || '') });
    const g = m.get(id);
    g.clips.push(a);
    if (a.shoot_cluster.confidence !== 'chac') g.sure = false;
  }
  return m;
}

// Chọn MỘT cụm chính cho cả video. scenes: [{role, narration, visual}]. Một cảnh được cụm "phủ" khi trong cụm có
// ít nhất một đoạn (của clip được phép cho vai cảnh đó theo problemPool) đủ liên quan. Cảnh mang clip bắt buộc
// (mustAssetId ở mustIdx) tính là phủ nếu clip đó nằm trong cụm. Không cụm nào phủ >= 2 cảnh thì trả null
// (đường cũ chạy nguyên). Hòa: cụm chứa clip bắt buộc, cụm chắc, tổng điểm, số clip, id (tất định).
export function pickPrimaryCluster(scenes, assets, { productGroup = null, mustAssetId = null, mustIdx = 0, minRelevance = CLUSTER_MIN_RELEVANCE } = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  if (!list.length) return null;
  const pools = list.map((_, i) => new Set(problemPool(assets, sceneRole(list, i), productGroup).map((a) => a.id)));
  let best = null;
  for (const g of clusterGroups(assets).values()) {
    if (g.clips.length < 2) continue;
    let covered = 0;
    let total = 0;
    const hasMust = !!mustAssetId && g.clips.some((c) => c.id === mustAssetId);
    for (let i = 0; i < list.length; i++) {
      const role = sceneRole(list, i);
      if (mustAssetId && i === mustIdx) { if (hasMust) covered += 1; continue; }
      let top = -Infinity;
      for (const c of g.clips) {
        if (!pools[i].has(c.id)) continue;
        for (const seg of c.segments) {
          if (segLen(seg) <= 0) continue;
          if (segmentRelevance(c, seg, role, { visual: list[i].visual, speech: list[i].narration }) < minRelevance) continue;
          top = Math.max(top, scoreSegment(c, seg, role, { visual: list[i].visual, speech: list[i].narration, productGroup }));
        }
      }
      if (top > -Infinity) { covered += 1; total += top; }
    }
    const cand = { id: g.id, confidence: g.sure ? 'chac' : 'co_the', basis: g.basis, clipIds: g.clips.map((c) => c.id), covered, total, hasMust };
    if (!best
      || cand.covered > best.covered
      || (cand.covered === best.covered && (
        (cand.hasMust && !best.hasMust)
        || (cand.hasMust === best.hasMust && (
          (cand.confidence === 'chac' && best.confidence !== 'chac')
          || (cand.confidence === best.confidence && (
            cand.total > best.total
            || (cand.total === best.total && (cand.clipIds.length > best.clipIds.length
              || (cand.clipIds.length === best.clipIds.length && cand.id < best.id)))))))))) best = cand;
  }
  return best && best.covered >= 2 ? best : null;
}

// 9/10 (2) SỬA NÓNG: chế độ cụm chính CHỈ cho video content. Video bán hàng bị chọn cụm Content (thợ, động cơ)
// nên cảnh giải pháp và giá mất hình máy (bài 66b894f8), vi phạm luật "hình sản phẩm ra trước giây 15".
// Nhánh bán trả null mà KHÔNG gọi pickPrimaryCluster; cắt đoạn (allocateSceneSegments) vẫn chạy bình thường.
export function pickClusterForVideo(scenes, assets, { contentVideo = false, productGroup = null, mustAssetId = null, mustIdx = 0 } = {}) {
  if (!contentVideo) return null;
  return pickPrimaryCluster(scenes, assets, { productGroup, mustAssetId, mustIdx });
}

// Chọn (clip, đoạn) tốt nhất TRONG cụm cho một cảnh; null khi không còn đoạn nào hợp (caller mới được lấy ngoài cụm).
// Chống lặp / recentUse chỉ phạt điểm để xếp thứ tự trong cụm: không bao giờ làm đoạn rơi ra ngoài cụm.
// Đoạn đã dùng ở cảnh khác bị loại hẳn (không chiếu lại cùng một đoạn). accept(asset, seg): lọc thêm (vd. không trôi lời).
export function pickInCluster(cluster, assets, scene, role, { prevId = null, usedSegKeys = new Set(), usedCount = new Map(), recentUse = new Map(), productGroup = null, modelAssetId = null, minRelevance = CLUSTER_MIN_RELEVANCE, accept = null } = {}) {
  if (!cluster) return null;
  const inCluster = new Set(cluster.clipIds);
  const allowed = new Set(problemPool(assets, role, productGroup).map((a) => a.id));
  let best = null;
  for (const a of assets) {
    if (!inCluster.has(a.id) || !allowed.has(a.id) || !hasSegments(a)) continue;
    a.segments.forEach((seg, idx) => {
      if (segLen(seg) <= 0 || usedSegKeys.has(segKey(a.id, idx))) return;
      if (segmentRelevance(a, seg, role, { visual: scene?.visual, speech: scene?.narration }) < minRelevance) return;
      if (typeof accept === 'function' && !accept(a, seg)) return;
      const base = scoreSegment(a, seg, role, { visual: scene?.visual, speech: scene?.narration, productGroup });
      let s = base;
      if (a.id === prevId) s -= 3;
      s -= (usedCount.get(a.id) || 0);
      s -= Math.min(recentUse.get(a.id) || 0, 3);
      if (modelAssetId && a.id === modelAssetId) s += 3;
      if (!best || s > best.s) best = { s, base, a, idx };
    });
  }
  if (!best) return null;
  return { assetId: best.a.id, score: best.s, base: best.base, segment: segmentRef(best.a, best.idx) };
}

// Gán đoạn chính + đoạn nối thêm cho từng cảnh SAU KHI danh sách cảnh đã chốt (đã tách cảnh, ghim cảnh 1...).
// Sửa tại chỗ. Mỗi cảnh có asset mang segments được: scene.segment ({assetId, idx, start, end, text}) và
// scene.extraSegments (đoạn cùng việc nối thêm khi lời dài hơn đoạn: trước hết đoạn khác CÙNG CLIP theo thứ tự
// thời gian, rồi đoạn đủ liên quan của clip khác CÙNG CỤM); scene.segmentShortSec = phần ước lượng còn thiếu hình
// sau khi hết đoạn (không lặp; assemble giữ khung cuối cho phần thiếu). Cảnh không có segment: scene.segment = null.
// Mọi đoạn chỉ dùng một lần trong cả video. Trả { short: [{scene, shortSec}], noSegment: [scene...] } (scene 1-based).
export function allocateSceneSegments(scenes, assets, { cluster = null, productGroup = null, log = console } = {}) {
  const byId = new Map((assets || []).map((a) => [a.id, a]));
  const used = new Set();
  const report = { short: [], noSegment: [] };
  const list = Array.isArray(scenes) ? scenes : [];
  // Lượt 0: giữ đoạn đã gán nếu còn hợp lệ (đúng clip hiện tại, chỉ số tồn tại, chưa trùng cảnh khác).
  for (const s of list) {
    const a = byId.get(s.assetId);
    const r = s.segment;
    const ok = r && a && r.assetId === s.assetId && hasSegments(a) && a.segments[r.idx] && !used.has(segKey(r.assetId, r.idx));
    if (ok) used.add(segKey(r.assetId, r.idx)); else s.segment = null;
    s.extraSegments = [];
    s.segmentShortSec = 0;
  }
  // Lượt 1: cảnh có clip mang đoạn mà chưa có đoạn thì chọn đoạn hợp nhất chưa dùng.
  list.forEach((s, i) => {
    const a = byId.get(s.assetId);
    if (!hasSegments(a)) { s.segment = null; return; }
    if (!s.segment) {
      s.segment = chooseSegment(a, s, s.role || sceneRole(list, i), { usedSegKeys: used, productGroup });
      if (s.segment) used.add(segKey(s.segment.assetId, s.segment.idx));
    }
    if (!s.segment) { report.noSegment.push(i + 1); log?.warn?.(`[segments] canh ${i + 1}: clip co doan nhung het doan chua dung — canh nay dung kieu cu (lap clip tu giay 0).`); }
  });
  // Lượt 2: nối thêm đoạn cho cảnh có lời dài hơn đoạn chính.
  list.forEach((s, i) => {
    if (!s.segment) return;
    const a = byId.get(s.assetId);
    const role = s.role || sceneRole(list, i);
    const need = estimateSpeechSec(s.narration);
    const target = need * COVER_SLACK;
    let have = segLen(s.segment);
    const same = [];
    a.segments.forEach((seg, idx) => { if (idx !== s.segment.idx && segLen(seg) > 0 && !used.has(segKey(a.id, idx))) same.push(segmentRef(a, idx)); });
    same.sort((x, y) => x.start - y.start);
    const others = [];
    if (cluster) {
      for (const cid of cluster.clipIds) {
        if (cid === a.id) continue;
        const c = byId.get(cid);
        if (!hasSegments(c)) continue;
        c.segments.forEach((seg, idx) => {
          if (segLen(seg) <= 0 || used.has(segKey(c.id, idx))) return;
          if (segmentRelevance(c, seg, role, { visual: s.visual, speech: s.narration }) < CLUSTER_MIN_RELEVANCE) return;
          others.push({ ref: segmentRef(c, idx), score: scoreSegment(c, seg, role, { visual: s.visual, speech: s.narration, productGroup }) });
        });
      }
      others.sort((x, y) => y.score - x.score || x.ref.start - y.ref.start);
    }
    const take = [];
    for (const r of same) { if (have >= target) break; take.push(r); have += segLen(r); used.add(segKey(r.assetId, r.idx)); }
    const takeOther = [];
    for (const o of others) { if (have >= target) break; takeOther.push(o.ref); have += segLen(o.ref); used.add(segKey(o.ref.assetId, o.ref.idx)); }
    // Thứ tự phát: các đoạn CÙNG CLIP (gồm đoạn chính) theo thời gian, rồi đoạn clip khác cùng cụm.
    const playlist = [...[s.segment, ...take].sort((x, y) => x.start - y.start), ...takeOther];
    s.segment = playlist[0];
    s.extraSegments = playlist.slice(1);
    const lack = need - have;
    s.segmentShortSec = lack > 0.3 ? Math.round(lack * 10) / 10 : 0;
    if (s.segmentShortSec) { report.short.push({ scene: i + 1, shortSec: s.segmentShortSec }); log?.warn?.(`[segments] thieu tu lieu canh ${i + 1}: uoc thieu ${s.segmentShortSec}s hinh (het doan cung viec/cung cum) — se giu khung cuoi, KHONG lap.`); }
  });
  return report;
}

// 1/10 (Thanh bỏ bài 22452d7f sau 5 bản dựng): video CONTENT chọn TRỌN BỘ hình trước khi viết
// lời. Bộ 3-4 tư liệu: clip bắt buộc đứng đầu (nếu có), còn lại lấy từ kho đời sống (problemPool
// role 'story'), ưu tiên CLIP hơn ảnh, CÓ MÔ TẢ, ít lên video gần đây (recentUse), không trùng
// nhau; tư liệu mô tả "không thấy người" xếp sau. Trả mảng asset theo thứ tự cảnh.
// mustAsset: object asset (caller tra theo id); size = 4 khi kho đủ, tụt xuống số có được; dưới 2
// tư liệu dùng được thì trả null (caller rơi về đường cũ: viết lời trước, ghép hình sau).
export function pickStoryboard(assets, { mustAsset = null, recentUse = new Map(), size = 4, productGroup = null } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const out = [];
  const used = new Set();
  const must = mustAsset && mustAsset.id ? (list.find((a) => a.id === mustAsset.id) || mustAsset) : null;
  if (must) { out.push(must); used.add(must.id); }
  const want = Math.max(2, Number.isInteger(size) ? size : 4);
  const pool = problemPool(list, 'story', productGroup).filter((a) => a && a.id && !used.has(a.id));
  const scored = pool.map((a, idx) => {
    let s = ruleScore(a, 'story', {});
    s -= Math.min(recentUse.get(a.id) || 0, 3) * 2;
    if (String(a.description || '').trim().length >= 40) s += 3;
    if (isVideoAsset(a)) s += 2;
    if (fold(textOf(a)).includes('khong thay nguoi')) s -= 4;
    return { a, s, idx };
  }).sort((x, y) => (y.s - x.s) || (x.idx - y.idx));
  for (const { a } of scored) {
    if (out.length >= want) break;
    if (used.has(a.id)) continue;
    out.push(a);
    used.add(a.id);
  }
  return out.length >= 2 ? out : null;
}

// 1/10: soát lời từng cảnh với MÔ TẢ tư liệu đã chốt cho cảnh đó (video content storyboard-first).
// scenes: [{narration}]; sb: mảng asset theo thứ tự cảnh. Trả danh sách cảnh LỆCH:
// [{ index, scene (1-based), asset, reason: 'no-overlap'|'drift'|'invented', sentences: [...] }].
// 'no-overlap' (lời không chung từ nào với mô tả) chỉ xét cảnh không phải cảnh cuối: cảnh kết là
// câu hỏi giao lưu nên có thể không chung từ với hình, nhưng vẫn bị soát trôi hình / bịa chi tiết.
export function storyboardDrift(scenes, sb) {
  const out = [];
  const n = Math.min((scenes || []).length, (sb || []).length);
  for (let i = 0; i < n; i++) {
    const a = sb[i];
    const narr = String(scenes[i]?.narration || '');
    if (!a || !narr.trim()) continue;
    const text = `${a.title || ''} ${a.description || ''} ${a.label || ''}`;
    const drift = imageryDriftSentences(narr, text);
    if (drift.length) { out.push({ index: i, scene: i + 1, asset: a, reason: 'drift', sentences: drift }); continue; }
    const invented = inventedDetailSentences(narr, text);
    if (invented.length) { out.push({ index: i, scene: i + 1, asset: a, reason: 'invented', sentences: invented }); continue; }
    if (i < (sb.length - 1) && visualOverlap(narr, a) === 0) out.push({ index: i, scene: i + 1, asset: a, reason: 'no-overlap', sentences: [] });
  }
  return out;
}

// 2/10 đêm (sinh lời 2 bước): storyboardDrift cắt MỌI câu chứa từ tả cảnh không có trong hình, nên model
// chỉ còn đường an toàn là tả từng hình và mạch chuyện không bao giờ hình thành. Bản bọc này chia hai loại:
// câu TẢ (khớp sbDescriptiveSentences: "X đang làm Y", "Đây là...") trôi khỏi hình thì vẫn bị bắt như cũ;
// câu KỂ trôi khỏi hình ("ba giờ sáng giữa khơi, tiếng máy nổ đều") được TỪ THA, chỉ cảnh báo. Câu bịa chi
// tiết (đạo cụ, giới tính người) và no-overlap giữ nguyên hiệu lực cho mọi câu. Hàm gốc storyboardDrift
// không đổi (chỗ khác vẫn dùng). log: null để im lặng (test).
export function storyboardDriftKeChuyen(scenes, sb, { log = console } = {}) {
  const out = [];
  const n = Math.min((scenes || []).length, (sb || []).length);
  for (let i = 0; i < n; i++) {
    const a = sb[i];
    const narr = String(scenes[i]?.narration || '');
    if (!a || !narr.trim()) continue;
    const text = `${a.title || ''} ${a.description || ''} ${a.label || ''}`;
    const drift = imageryDriftSentences(narr, text);
    if (drift.length) {
      const desc = new Set(sbDescriptiveSentences(narr));
      const cut = drift.filter((s) => desc.has(s));
      const tha = drift.filter((s) => !desc.has(s));
      if (tha.length && log) log.warn(`[script] storyboard: canh ${i + 1} co cau ke troi khoi hinh nhung giu (cau ke, khong phai cau ta): "${tha[0].slice(0, 60)}"`);
      if (cut.length) { out.push({ index: i, scene: i + 1, asset: a, reason: 'drift', sentences: cut }); continue; }
    }
    const invented = inventedDetailSentences(narr, text);
    if (invented.length) { out.push({ index: i, scene: i + 1, asset: a, reason: 'invented', sentences: invented }); continue; }
    if (i < (sb.length - 1) && visualOverlap(narr, a) === 0) out.push({ index: i, scene: i + 1, asset: a, reason: 'no-overlap', sentences: [] });
  }
  return out;
}

// Danh sách tư liệu đưa cho model chấm — kèm mô tả, folder, nhãn clip thật.
export function assetListForPrompt(assets) {
  return assets.map((a) => {
    const desc = String(a.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `- id=${a.id} | ${a.kind} | folder: ${a.folder || a.product_group || '?'} | ${a.title || ''}${a.label ? ` | ${a.label}` : ''}${desc ? ` | MÔ TẢ: ${desc}` : ' | (chưa có mô tả)'}`;
  }).join('\n');
}

// scenes: [{role, narration, visual}] ; assets: [{id, kind, title, description, folder, label, fresh}]
// generate: async (params) => res (generateWithRetry của script.mjs, đã có model chain).
// Trả về mảng cùng độ dài scenes: {assetId, fit, why, by: 'model'|'rule'|'must'}.
// mustUseIndex (17/9 chiều): cảnh nào bị ép dùng clip bắt buộc (0 = cảnh 1 như luật 9/9; video bán hàng có clip
// sản phẩm đang chạy thì là cảnh giải pháp, xem rules.mjs mustUseRoleFor).
// productGroup (17/9 chiều (3)): nhóm sản phẩm của video bán hàng, để cảnh nỗi đau loại tư liệu của sản phẩm kia.
// ĐỢT A (9/10): cluster = cụm chính (pickPrimaryCluster) do caller tính sẵn; undefined thì tự tính khi bật
// VIDEO_SEGMENTS (useSegments) và kho có clip mang đoạn; null = đường cũ. Pick có thêm `segment` khi clip mang đoạn.
export async function matchScenesToAssets({ ai, generate, model, scenes, assets, mustUseAssetId = null, mustUseIndex = 0, productGroup = null, recentUse = new Map(), cluster = undefined, useSegments = segmentsEnabled(), log = console }) {
  const ids = new Set(assets.map((a) => a.id));
  const mustIdx = Math.max(0, Math.min(scenes.length - 1, Number.isInteger(mustUseIndex) ? mustUseIndex : 0));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out = scenes.map(() => null);
  const segOn = !!useSegments && assets.some(hasSegments);
  const clusterSel = !segOn ? null
    : cluster !== undefined ? cluster
      : pickPrimaryCluster(scenes, assets, { productGroup, mustAssetId: mustUseAssetId && ids.has(mustUseAssetId) ? mustUseAssetId : null, mustIdx });
  const usedSegKeys = new Set();
  let modelPicks = [];
  if (assets.length && scenes.length) {
    const system = [
      'Bạn là người dựng video cho SDVICO (thiết bị tàu cá). Nhiệm vụ: chọn TƯ LIỆU (ảnh/clip) cho từng CẢNH sao cho HÌNH ĐI ĐÔI VỚI LỜI.',
      'LUẬT CỨNG:',
      '- Cảnh role hook/empathy/story là cảnh VẤN ĐỀ hoặc đời sống: lời nói máy hư, cặn dầu, nước đục, sửa hoài, nằm bờ... thì hình PHẢI là cảnh cũ/hư/bẩn/tàu thật/khoang máy/thợ đang sửa. TUYỆT ĐỐI KHÔNG dùng ảnh sản phẩm mới bóng, ảnh trưng bày, nền trắng cho các cảnh này.',
      '- Cảnh role solution/reward/closing là cảnh GIẢI PHÁP: được dùng ảnh/clip sản phẩm, cảnh lắp đặt, máy chạy, nước trong, dầu sạch.',
      '- Ưu tiên clip (video) cho cảnh có chuyển động; ưu tiên tư liệu có nhãn CLIP THẬT.',
      '- Không dùng cùng một tư liệu cho 2 cảnh liền nhau nếu còn tư liệu khác hợp.',
      '- Chỉ được dùng id có trong danh sách. Không có tư liệu hợp thật sự thì vẫn chọn cái ÍT SAI NHẤT và cho điểm thấp (fit <= 4) kèm lý do.',
      mustUseAssetId && ids.has(mustUseAssetId) ? `- Cảnh ${mustIdx + 1} BẮT BUỘC dùng id=${mustUseAssetId}. Các cảnh khác KHÔNG dùng id này.` : '',
      (() => {
        // 29/9: kể cho model biết tư liệu nào vừa lên các video gần đây để người xem không thấy video nào cũng một bộ hình.
        const worn = assets.filter((a) => (recentUse.get(a.id) || 0) > 0 && a.id !== mustUseAssetId)
          .sort((a, b) => (recentUse.get(b.id) || 0) - (recentUse.get(a.id) || 0)).slice(0, 15);
        return worn.length ? `- Các tư liệu sau VỪA LÊN video trong 2 tuần qua, TRÁNH dùng lại nếu còn tư liệu khác hợp: ${worn.map((a) => `${a.id} (${recentUse.get(a.id)} lần)`).join(', ')}.` : '';
      })(),
      '',
      'TƯ LIỆU CÓ SẴN:',
      assetListForPrompt(assets),
    ].filter(Boolean).join('\n');
    const user = [
      'CÁC CẢNH (theo thứ tự):',
      ...scenes.map((s, i) => `${i + 1}. role=${s.role || '?'} | HÌNH CẦN: ${s.visual || '(không ghi)'} | LỜI: ${String(s.narration || '').slice(0, 220)}`),
      '',
      'Trả về JSON, không thêm chữ ngoài JSON:',
      '{"picks":[{"scene":1,"asset_id":"id","fit":0-10,"why":"1 câu ngắn vì sao hợp"}]}',
      'fit = mức hình khớp lời (10 = đúng y chang, 5 = tạm được, <=3 = lệch). Mỗi cảnh đúng 1 mục.',
    ].join('\n');
    try {
      const res = await generate(ai, { model, contents: user, config: { systemInstruction: system, responseMimeType: 'application/json' } });
      const raw = String(res?.text || '');
      const parsed = extractFirstJson(raw);
      // Chấp nhận vài dạng model hay trả: {picks:[...]}, mảng trần [...], hoặc {"1": {...}, "2": {...}}.
      if (Array.isArray(parsed)) modelPicks = parsed;
      else if (Array.isArray(parsed?.picks)) modelPicks = parsed.picks;
      else if (parsed && typeof parsed === 'object') modelPicks = Object.entries(parsed).filter(([k, v]) => /^\d+$/.test(k) && v && typeof v === 'object').map(([k, v]) => ({ scene: Number(k), ...v }));
      if (!modelPicks.length) log.warn(`[scene-match] model trả JSON không có picks, dùng luật vai cảnh. Đầu trả lời: ${raw.replace(/\s+/g, ' ').slice(0, 200)}`);
    } catch (e) {
      log.warn('[scene-match] model chấm tư liệu lỗi, dùng luật vai cảnh:', e?.message || e);
    }
  }
  const usedCount = new Map();
  for (let i = 0; i < scenes.length; i++) {
    const role = scenes[i].role || (i === 0 ? 'hook' : i === scenes.length - 1 ? 'closing' : 'solution');
    const prevId = i > 0 ? out[i - 1]?.assetId || null : null;
    let pick = null;
    // ĐỢT A: có cụm chính thì chọn đoạn TRONG cụm trước; chỉ khi không còn đoạn hợp mới rơi về đường cũ (ghi lý do).
    let cpick = null;
    let outsideWhy = null;
    if (clusterSel && !(i === mustIdx && mustUseAssetId && ids.has(mustUseAssetId))) {
      const mpC = modelPicks.find((p) => Number(p?.scene) === i + 1);
      cpick = pickInCluster(clusterSel, assets, scenes[i], role, { prevId, usedSegKeys, usedCount, recentUse, productGroup, modelAssetId: mpC ? String(mpC.asset_id || '') : null });
      if (!cpick) outsideWhy = `ngoài cụm ${clusterSel.id}: không còn đoạn nào trong cụm hợp cảnh ${i + 1} (${role})`;
    }
    if (cpick) {
      const act = String(cpick.segment.text || '').split('. ')[0].slice(0, 70);
      pick = { assetId: cpick.assetId, fit: Math.max(0, Math.min(10, 4 + cpick.base / 2)), why: `trong cụm ${clusterSel.id} (${clusterSel.confidence}): ${act}`.slice(0, 200), by: 'cluster', segment: cpick.segment };
    } else if (i === mustIdx && mustUseAssetId && ids.has(mustUseAssetId)) {
      // 17/9 (bài 8c8347a4 lời "cảng cá sương mờ" nhưng clip là văn phòng): vẫn ÉP clip thật
      // (luật 9/9) nhưng điểm khớp phải là điểm THẬT — model chấm nếu có, không thì đo trùng
      // từ với "hình cần"; lệch thì cảnh báo to (script.mjs đã có vòng sinh lại theo mô tả clip).
      const mp = modelPicks.find((p) => Number(p?.scene) === mustIdx + 1);
      const sameId = mp && String(mp.asset_id || '') === mustUseAssetId;
      const mFit = sameId && Number.isFinite(Number(mp.fit)) ? Math.max(0, Math.min(10, Number(mp.fit))) : null;
      const fit = mFit ?? Math.max(0, Math.min(10, 3 + visualOverlap(scenes[mustIdx]?.visual || '', byId.get(mustUseAssetId)) * 2));
      const why = (sameId && mp.why ? String(mp.why).slice(0, 140) + ' — ' : '') + 'clip thật bắt buộc (9/9)';
      if (fit < 5) log.warn(`[scene-match] cảnh ${mustIdx + 1}: clip bắt buộc "${String(byId.get(mustUseAssetId)?.title || '').slice(0, 50)}" khớp lời YẾU (fit=${fit}) — kịch bản chưa viết theo nội dung clip.`);
      pick = { assetId: mustUseAssetId, fit, why, by: 'must' };
    } else {
      const mp = modelPicks.find((p) => Number(p?.scene) === i + 1);
      const mid = mp ? String(mp.asset_id || '') : '';
      const fit = mp ? Number(mp.fit) : NaN;
      const pool = problemPool(assets, role, productGroup);
      if (mid && ids.has(mid) && mid !== mustUseAssetId && Number.isFinite(fit) && fit >= 5) {
        // Kiểm lại bằng luật: cảnh vấn đề mà model chọn ảnh sản phẩm bóng (điểm luật âm) thì bỏ.
        const rs = ruleScore(byId.get(mid), role, { visual: scenes[i].visual });
        if (PROBLEM_ROLES.has(role) && rs < 0) {
          log.warn(`[scene-match] cảnh ${i + 1} (${role}): model chọn "${byId.get(mid).title}" nhưng luật vai cảnh chấm ${rs} (hình mới bóng cho cảnh vấn đề) -> chọn lại theo luật`);
        } else if (PROBLEM_ROLES.has(role) && !pool.some((a) => a.id === mid)) {
          log.warn(`[scene-match] cảnh ${i + 1} (${role}): model chọn "${byId.get(mid).title}" là tư liệu folder sản phẩm (máy SDVICO) cho cảnh vấn đề -> chọn lại trong kho Content`);
        } else if (mid === prevId && assets.length > 1) {
          // 17/9 vòng 9 (ChatGPT: ảnh SF300B đứng 13,7 giây liền — model chọn cùng tư liệu cho các cảnh
          // liên tiếp; luật "không dùng 1 tư liệu cho 2 cảnh liền nhau" mới chỉ nằm trong prompt): ép lại
          // bằng máy — pick của model trùng cảnh liền trước thì chọn theo luật (pickByRole đã phạt prevId).
          log.warn(`[scene-match] cảnh ${i + 1} (${role}): model chọn trùng tư liệu cảnh liền trước "${byId.get(mid).title}" -> chọn lại theo luật để hình đổi`);
        } else if (PROBLEM_ROLES.has(role) && needsWorker(scenes[i].visual, scenes[i].narration) && !hasWorker(textOf(byId.get(mid))) && pool.some((a) => hasWorker(textOf(a)))) {
          // 1/10: cảnh cần người thợ mà model chọn hình không có ai làm việc, kho còn hình có người -> chọn lại.
          log.warn(`[scene-match] cảnh ${i + 1} (${role}): lời cần NGƯỜI THỢ nhưng "${byId.get(mid).title}" không có ai làm việc -> chọn lại theo luật`);
        } else if ((role === 'solution' || role === 'reward') && isWaterGroup(productGroup) && !showsWaterFlow(byId.get(mid)) && pool.some((a) => a.id !== prevId && (usedCount.get(a.id) || 0) === 0 && showsWaterFlow(a))) {
          // 3/10: video lọc nước, kho còn clip nước ngọt chảy ra chưa dùng mà model chọn hình khác.
          // 3/10 (2) — kiểm bản dựng thật: thả xuống vòng chọn-lại chung thì clip nước bị
          // visualOverlap loại ("không còn hình hợp") rồi rớt về clip tệ hơn + cắt câu. Vậy GÁN
          // THẲNG clip nước tốt nhất (ruleScore cao nhất trong các clip nước chưa dùng) tại đây;
          // không bao giờ để cảnh này rơi xuống fallback vì lý do nước chảy.
          const nuoc = pool
            .filter((a) => a.id !== prevId && (usedCount.get(a.id) || 0) === 0 && showsWaterFlow(a))
            .sort((x, y) => ruleScore(y, role, { visual: scenes[i].visual, productGroup }) - ruleScore(x, role, { visual: scenes[i].visual, productGroup }))[0];
          log.warn(`[scene-match] cảnh ${i + 1} (${role}): video lọc nước -> thay "${byId.get(mid).title}" bằng clip nước chảy "${nuoc.title}"`);
          pick = { assetId: nuoc.id, fit: 8, why: 'video lọc nước: cảnh giải pháp phải thấy nước ngọt chảy ra (ChatGPT chấm 3/10)', by: 'rule' };
        } else if ((recentUse.get(mid) || 0) >= 2 && pool.some((a) => a.id !== mid && (recentUse.get(a.id) || 0) < 2)) {
          // 29/9: model chọn tư liệu đã lên >= 2 video gần đây trong khi kho còn cái ít dùng — ép xoay
          // bằng máy (pickByRole phạt recentUse), người xem hết cảnh "video nào cũng đúng bộ clip đó".
          log.warn(`[scene-match] cảnh ${i + 1} (${role}): "${byId.get(mid).title}" đã lên ${recentUse.get(mid)} video 2 tuần qua -> chọn lại theo luật để xoay kho`);
        } else {
          pick = { assetId: mid, fit, why: String(mp.why || '').slice(0, 160), by: 'model' };
        }
      } else if (mid && ids.has(mid)) {
        log.warn(`[scene-match] cảnh ${i + 1} (${role}): model chấm fit=${fit} thấp ("${String(mp?.why || '').slice(0, 80)}") -> chọn theo luật vai cảnh`);
      }
      if (!pick) {
        const a = pickByRole(pool, role, { prevId, usedCount, visual: scenes[i].visual, speech: scenes[i].narration, recentUse, productGroup });
        if (a) pick = { assetId: a.id, fit: Math.max(0, Math.min(10, 4 + ruleScore(a, role, { visual: scenes[i].visual, productGroup }) / 2)), why: 'chọn theo luật vai cảnh (mô tả tư liệu + hình cần)', by: 'rule' };
      }
    }
    if (pick && outsideWhy && pick.by !== 'must') {
      pick.why = `${outsideWhy} | ${pick.why || ''}`.slice(0, 220);
      log.warn(`[scene-match] cảnh ${i + 1} (${role}): ${outsideWhy} -> lấy ngoài cụm "${String(byId.get(pick.assetId)?.title || '').slice(0, 40)}"`);
    }
    // ĐỢT A: pick (kể cả clip bắt buộc, hoặc ngoài cụm) mà clip mang đoạn thì chọn luôn đoạn hợp nhất chưa dùng.
    if (pick && segOn && !pick.segment) {
      const a = byId.get(pick.assetId);
      const seg = hasSegments(a) ? chooseSegment(a, scenes[i], role, { usedSegKeys, productGroup }) : null;
      if (seg) pick = { ...pick, segment: seg };
    }
    if (pick?.segment) usedSegKeys.add(segKey(pick.segment.assetId, pick.segment.idx));
    if (pick) usedCount.set(pick.assetId, (usedCount.get(pick.assetId) || 0) + 1);
    out[i] = pick;
  }
  return out;
}

// 1/10 (Thanh, bài 22452d7f dựng 2 lần vẫn "lời biển - hình cảng"): sau khi ghép hình,
// soát LỜI từng cảnh với MÔ TẢ hình đã chọn. Lệch thì đổi sang hình không lệch (giữ mọi
// luật cũ: vai cảnh, recentUse, không trùng cảnh kề); kho hết hình hợp thì cắt câu lệch;
// cắt rỗng thì giữ nguyên + ghi cảnh báo vào why cho người duyệt thấy ở cột "Ghép từ".
// Cảnh mustIdx miễn: lời cảnh đó đã được sinh lại theo mô tả clip trong attempt loop.
// skip (thêm khi thi công): chỉ số cảnh khác cũng miễn (cảnh 1 bị hookPin ghi đè hình sau đó).
// scenes: [{role, narration, visual}]; picks: kết quả matchScenesToAssets (sửa tại chỗ);
// Trả về { picks, narrations } — narrations là lời từng cảnh SAU khi có thể bị cắt.
// ĐỢT A: cluster = cụm chính. Pick trong cụm (by 'cluster') KHÔNG bao giờ bị đổi sang tư liệu ngoài cụm: lệch lời
// thì thử đoạn khác trong cụm không lệch, hết thì cắt câu lệch như cũ. Chữ so lệch = tiêu đề + mô tả clip + chữ đoạn.
export function refinePicksByImagery({ scenes, picks, assets, mustIdx = 0, skip = [], productGroup = null, recentUse = new Map(), cluster = null, log = console }) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const usedCount = new Map();
  for (const p of picks) if (p?.assetId) usedCount.set(p.assetId, (usedCount.get(p.assetId) || 0) + 1);
  const usedSegKeys = new Set();
  for (const p of picks) if (p?.segment) usedSegKeys.add(segKey(p.segment.assetId, p.segment.idx));
  const driftText = (a, pick) => `${textOf(a || {})} ${pick?.segment?.text || ''}`;
  // Clip bắt buộc chỉ được ở cảnh must (luật 9/9): không đổi các cảnh khác sang nó.
  const mustAssetId = picks[mustIdx]?.by === 'must' ? picks[mustIdx].assetId : null;
  const skipSet = new Set(skip);
  const narrations = scenes.map((s) => s.narration);
  for (let i = 0; i < scenes.length; i++) {
    const pick = picks[i];
    if (!pick || i === mustIdx || skipSet.has(i)) continue;
    const role = scenes[i].role || 'solution';
    const cur = byId.get(pick.assetId);
    const drift = imageryDriftSentences(narrations[i] || '', driftText(cur, pick));
    if (!drift.length) continue;
    const prevId = i > 0 ? picks[i - 1]?.assetId || null : null;
    const nextId = picks[i + 1]?.assetId || null;
    if (cluster && pick.by === 'cluster') {
      // Thử đoạn khác TRONG cụm mà lời không trôi; nhả đoạn cũ trước để khỏi tự chặn mình.
      if (pick.segment) usedSegKeys.delete(segKey(pick.segment.assetId, pick.segment.idx));
      const alt = pickInCluster(cluster, assets, { ...scenes[i], narration: narrations[i] }, role, {
        prevId, usedSegKeys, usedCount, recentUse, productGroup,
        accept: (a, seg) => !imageryDriftSentences(narrations[i] || '', `${textOf(a)} ${segmentText(seg)}`).length,
      });
      if (alt) {
        usedCount.set(pick.assetId, Math.max(0, (usedCount.get(pick.assetId) || 0) - 1));
        usedCount.set(alt.assetId, (usedCount.get(alt.assetId) || 0) + 1);
        usedSegKeys.add(segKey(alt.segment.assetId, alt.segment.idx));
        log.warn(`[scene-match] cảnh ${i + 1} (${role}): lời lệch đoạn đã chọn ("${drift[0].slice(0, 50)}") -> đổi sang đoạn khác TRONG cụm "${String(byId.get(alt.assetId)?.title || '').slice(0, 40)}"`);
        picks[i] = { assetId: alt.assetId, fit: Math.max(0, Math.min(10, 4 + alt.base / 2)), why: `trong cụm ${cluster.id} (${cluster.confidence}): đổi đoạn cho khớp lời (soát sau ghép)`, by: 'cluster', segment: alt.segment };
        continue;
      }
      if (pick.segment) usedSegKeys.add(segKey(pick.segment.assetId, pick.segment.idx));
      const cutIn = cutImageryDrift(narrations[i] || '', driftText(cur, pick));
      if (cutIn && cutIn.trim()) {
        log.warn(`[scene-match] cảnh ${i + 1} (${role}): trong cụm không còn đoạn hợp, cắt câu lệch "${drift[0].slice(0, 50)}"`);
        narrations[i] = cutIn;
      } else {
        log.warn(`[scene-match] cảnh ${i + 1} (${role}): lời lệch đoạn trong cụm nhưng cắt sẽ rỗng — GIỮ NGUYÊN, người duyệt tự cân.`);
        picks[i] = { ...pick, why: `${pick.why || ''} | CẢNH BÁO: lời có thể lệch hình ("${drift[0].slice(0, 60)}")`.slice(0, 220) };
      }
      continue;
    }
    const pool = problemPool(assets, role, productGroup);
    const fit = pool.filter((a) => a.id !== pick.assetId && a.id !== prevId && a.id !== nextId && a.id !== mustAssetId
      && !imageryDriftSentences(narrations[i] || '', textOf(a)).length);
    if (fit.length) {
      usedCount.set(pick.assetId, Math.max(0, (usedCount.get(pick.assetId) || 0) - 1));
      const a = pickByRole(fit, role, { prevId, usedCount, visual: scenes[i].visual, speech: narrations[i], recentUse, productGroup });
      usedCount.set(a.id, (usedCount.get(a.id) || 0) + 1);
      log.warn(`[scene-match] cảnh ${i + 1} (${role}): lời lệch hình "${String(cur?.title || '').slice(0, 40)}" ("${drift[0].slice(0, 50)}") -> đổi sang "${String(a.title || '').slice(0, 40)}"`);
      picks[i] = { assetId: a.id, fit: Math.max(0, Math.min(10, 4 + ruleScore(a, role, { visual: scenes[i].visual, productGroup }) / 2)), why: 'đổi hình cho khớp lời (soát sau ghép 1/10)', by: 'imagery' };
      continue;
    }
    const cut = cutImageryDrift(narrations[i] || '', textOf(cur || {}));
    if (cut && cut.trim()) {
      log.warn(`[scene-match] cảnh ${i + 1} (${role}): không còn hình hợp, cắt câu lệch "${drift[0].slice(0, 50)}"`);
      narrations[i] = cut;
    } else {
      log.warn(`[scene-match] cảnh ${i + 1} (${role}): lời lệch hình nhưng cắt sẽ rỗng — GIỮ NGUYÊN, người duyệt tự cân.`);
      picks[i] = { ...pick, why: `${pick.why || ''} | CẢNH BÁO: lời có thể lệch hình ("${drift[0].slice(0, 60)}")`.slice(0, 220) };
    }
  }
  return { picks, narrations };
}
