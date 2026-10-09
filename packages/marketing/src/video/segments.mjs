// segments.mjs — hàm THUẦN cho "đoạn trong clip" (ĐỢT A, 9/10). Không gọi mạng, không đụng DB, test được.
//
// Gốc: assemble.mjs luôn lấy clip từ giây 0 và LẶP nếu ngắn, nên lời 10 giây phủ bằng đoạn 3 giây lặp 3 lần.
// Nay mỗi clip trong kho có thể mang `segments` (brand_assets.segments): các đoạn 2 tới 12 giây, mỗi đoạn ghi
// hành động THỰC SỰ thấy. Cảnh video chọn đúng đoạn, cắt `-ss start -t dur`, không lặp.
//
// Hai kiểu đối tượng đoạn:
//   - đoạn LƯU TRONG DB (clip.segments[i]): { start, end, action, people, equipment, setting, vertical_ok, note,
//       subject, product_visible, product_clear_from, stage }   (4 nhãn cuối thêm ở ĐỢT A2, 9/10; đoạn cũ không có = "không biết")
//   - đoạn THAM CHIẾU trong cảnh (scene.segment / scene.extraSegments[i]): { assetId, idx, start, end, ...nhãn }

export const SEG_MIN_SEC = 2;
export const SEG_MAX_SEC = 12;
// Tốc độ đọc ước lượng để xếp đủ hình trước khi biết độ dài tiếng thật (VieNeu ~3,6 từ/giây; xem rules.mjs splitLongImageScenes).
export const WORDS_PER_SEC = 3.6;
export const SPEECH_PAD_SEC = 0.4;
// Dư 10% khi xếp đoạn, để lệch ước lượng không làm thiếu hình.
export const COVER_SLACK = 1.1;

// Công tắc: VIDEO_SEGMENTS=off bỏ hẳn đường mới (mặc định on, chỉ có tác dụng với clip CÓ segments).
export function segmentsEnabled(env = process.env) {
  return String(env?.VIDEO_SEGMENTS ?? 'on').trim().toLowerCase() !== 'off';
}

// "12.5" | 12.5 | "0:12" | "01:05.5" | "1:02:03" -> giây. Không đọc được thì null.
export function parseTime(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

const r2 = (n) => Math.round(n * 100) / 100;
const str = (v, n = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---- ĐỢT A2 (9/10): nhãn đoạn ----
export const SUBJECTS = ['nguoi', 'thiet_bi', 'ca_hai', 'canh_chung'];
export const PRODUCT_VIS = ['ro_tu_dau', 'ro_sau', 'mo', 'khong'];
export const STAGES = ['chuan_bi', 'thao_tac', 'hoan_tat', 'van_hanh', 'khac'];
// Đoạn "ro_sau" chỉ dùng cho cảnh sản phẩm khi phần còn lại SAU product_clear_from dài ít nhất chừng này.
export const CLEAR_MIN_SEC = 1.5;

function normEnum(v, allowed, fallback) {
  if (v === undefined || v === null || String(v).trim() === '') return null; // model không ghi = không biết
  const k = String(v).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.includes(k) ? k : fallback;
}
// Thu nhãn "sản phẩm hiện rõ" về đúng khoảng [s, e] của một khúc đã cắt: ro_sau cần giây hiện rõ nằm trong khúc;
// hiện rõ từ trước khúc thì khúc là ro_tu_dau; hiện rõ sau khúc thì khúc là mo. product_clear_from chỉ giữ cho ro_sau.
function fitProduct(pv, from, s, e) {
  if (pv !== 'ro_sau') return { product_visible: pv, product_clear_from: null };
  if (from === null || !Number.isFinite(from)) return { product_visible: 'mo', product_clear_from: null };
  if (from >= e - 1e-9) return { product_visible: 'mo', product_clear_from: null };
  if (from <= s + 0.05) return { product_visible: 'ro_tu_dau', product_clear_from: null };
  return { product_visible: 'ro_sau', product_clear_from: r2(from) };
}

// Chuẩn hóa đoạn model trả về: kẹp trong [0, duration], bỏ đoạn trống / không có hành động, cắt chồng lấn,
// tách đoạn quá dài thành các khúc đều <= max, bỏ đoạn ngắn hơn min. Trả mảng đã sắp theo start.
export function normalizeSegments(raw, duration, { min = SEG_MIN_SEC, max = SEG_MAX_SEC } = {}) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.segments) ? raw.segments : [];
  const dur = Number(duration);
  const hasDur = Number.isFinite(dur) && dur > 0;
  const minLen = hasDur ? Math.min(min, dur) : min;
  const cleaned = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    let s = parseTime(it.start);
    let e = parseTime(it.end);
    if (s === null || e === null) continue;
    s = Math.max(0, s);
    if (hasDur) e = Math.min(dur, e);
    if (!(e > s)) continue;
    const action = str(it.action);
    if (!action) continue; // không ghi được hành động thấy thì không giữ đoạn
    cleaned.push({
      start: s,
      end: e,
      action,
      people: str(it.people),
      equipment: str(it.equipment),
      setting: str(it.setting),
      vertical_ok: it.vertical_ok === true || it.vertical_ok === 'true' ? true : it.vertical_ok === false || it.vertical_ok === 'false' ? false : null,
      note: str(it.note, 200),
      // ĐỢT A2 (9/10): nhãn phục vụ chọn đoạn theo câu. Thiếu nhãn = null (không biết); nhãn lạ = giá trị trung tính.
      subject: normEnum(it.subject, SUBJECTS, 'canh_chung'),
      product_visible: normEnum(it.product_visible, PRODUCT_VIS, 'mo'),
      product_clear_from: parseTime(it.product_clear_from),
      stage: normEnum(it.stage, STAGES, 'khac'),
    });
  }
  cleaned.sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let prevEnd = 0;
  for (const c of cleaned) {
    const s = Math.max(c.start, prevEnd);
    if (c.end - s < minLen - 1e-9) continue;
    prevEnd = c.end;
    const len = c.end - s;
    const n = Math.max(1, Math.ceil(len / max - 1e-9));
    const chunk = len / n;
    for (let k = 0; k < n; k++) {
      const cs = r2(s + chunk * k);
      const ce = r2(k === n - 1 ? c.end : s + chunk * (k + 1));
      out.push({ ...c, start: cs, end: ce, ...fitProduct(c.product_visible, c.product_clear_from, cs, ce) });
    }
  }
  return out;
}

export function segLen(seg) {
  const l = Number(seg?.end) - Number(seg?.start);
  return Number.isFinite(l) && l > 0 ? l : 0;
}

// Khóa định danh 1 đoạn trong kho: "<assetId>#<idx>".
export function segKey(assetId, idx) { return `${assetId}#${idx}`; }

// Ước lượng giây tiếng đọc của một lời thoại (trước khi chạy TTS).
export function estimateSpeechSec(narration) {
  const words = String(narration || '').trim().split(/\s+/).filter(Boolean).length;
  return words / WORDS_PER_SEC + SPEECH_PAD_SEC;
}

// Kế hoạch cắt hình cho 1 cảnh có đoạn, theo độ dài tiếng THẬT của cảnh.
// scene.segment + scene.extraSegments (đã xếp thứ tự): lấy lần lượt cho tới khi đủ durationSec.
// Hết đoạn mà vẫn thiếu thì KHÔNG lặp: trả shortSec (phần thiếu), assemble giữ khung cuối cho phần đó.
// Trả { pieces: [{ assetId, start, dur }], shortSec, covered }.
export function planSceneSegments(durationSec, scene) {
  const need = Number(durationSec) || 0;
  const refs = [scene?.segment, ...(Array.isArray(scene?.extraSegments) ? scene.extraSegments : [])]
    .filter((r) => r && r.assetId && segLen(r) > 0);
  const pieces = [];
  let remaining = need;
  for (const r of refs) {
    if (remaining <= 0.04) break;
    const take = Math.min(segLen(r), remaining);
    pieces.push({ assetId: r.assetId, start: r2(Number(r.start)), dur: r2(take) });
    remaining -= take;
  }
  const shortSec = remaining > 0.04 ? r2(remaining) : 0;
  return { pieces, shortSec, covered: r2(need - shortSec) };
}

// ======================================================================================================
// ĐỢT A2 (9/10): CHỌN ĐOẠN PHỤC VỤ ĐÚNG CÂU ĐANG NÓI. Hàm thuần, không mạng.
// Review đợt A: "cắt đoạn có hành động chưa đủ; phải cắt đoạn phục vụ đúng câu đang nói". Câu nói về người thì hình
// phải có người; cảnh sản phẩm (giải pháp, giá) thì thiết bị chính phải hiện rõ NGAY khi cảnh bắt đầu.
// ======================================================================================================

function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}
// Tách câu ở . ! ? … và xuống dòng (giữ câu không rỗng).
function sentencesOfText(text) {
  return String(text || '').split(/(?<=[.!?…])\s+|\n+/u).map((x) => x.trim()).filter(Boolean);
}

// Từ chỉ NGƯỜI. So trên chữ thường CÓ DẤU, nguyên từ ("tay" không dính "tây", "chú" không dính "chú ý").
const PERSON_WORDS = ['thợ', 'anh em', 'kỹ thuật viên', 'kĩ thuật viên', 'kỹ thuật', 'kĩ thuật', 'nhân viên', 'công nhân', 'người', 'bác', 'chú', 'ông', 'chủ tàu', 'thuyền trưởng', 'thuyền viên', 'bà con', 'ngư dân', 'đội ngũ', 'đội', 'mồ hôi', 'tay', 'tài công', 'anh', 'chị'];
const PERSON_RE = new RegExp(`(^|[^\\p{L}])(?:${PERSON_WORDS.map((w) => w.replace(/\s+/g, '\\s+')).join('|')})(?=$|[^\\p{L}])(?!\\s+ý(?:$|[^\\p{L}]))`, 'iu');
// Từ chỉ SẢN PHẨM của SDVICO (khớp trên chữ không dấu). "thiết bị" trần KHÔNG tính (quá chung).
const PRODUCT_RE = /(?:^|[^a-z0-9])(?:loc dau|loc nuoc|bo loc|may loc|sf-?\d|sd\d{2}|sea-?\d|s-?tracking|thuraya|marinestar|viettel|vishipel|vnpt|dinh vi|giam sat hanh trinh|dien thoai ve tinh|pvoil|graphene|xu ly dau)(?=$|[^a-z0-9])/;

// 'nguoi' khi câu nói về người, 'san_pham' khi nhắc tên / loại sản phẩm (kể cả khi có người, vì hình sản phẩm khó bù hơn),
// còn lại 'chung'. productTerms: tên công khai / mã máy của video (publicName...) để nhận cả tên riêng.
export function sentenceSubject(sentence, { productTerms = [] } = {}) {
  const raw = String(sentence || '').toLowerCase();
  if (!raw.trim()) return 'chung';
  const f = fold(raw);
  const extra = (Array.isArray(productTerms) ? productTerms : []).map((t) => fold(t).trim()).filter((t) => t.length >= 3);
  if (PRODUCT_RE.test(f) || extra.some((t) => f.includes(t))) return 'san_pham';
  if (PERSON_RE.test(raw)) return 'nguoi';
  return 'chung';
}

// Cần gì từ ĐOẠN HÌNH của một cảnh. role: vai cảnh; salesVideo: video bán hàng.
// Trả { subject: 'nguoi'|'san_pham'|'chung' (chủ thể cả cảnh), nguoi: bool, product: bool, productFolderOnly: bool, price: bool }.
//  - nguoi: có câu thuần nói về người (và vai không phải cảnh sản phẩm của video bán, nơi hình máy được ưu tiên hơn).
//  - product: vai solution/price/reward của video BÁN, hoặc có câu nhắc sản phẩm.
//  - productFolderOnly: video bán thì đoạn "thấy rõ máy" phải đến từ tư liệu THƯ MỤC SẢN PHẨM (đúng máy), không lấy từ kho Content.
export function sceneNeed(scene, role, { salesVideo = false, productTerms = [] } = {}) {
  let nguoi = 0;
  let sp = 0;
  for (const s of sentencesOfText(scene?.narration)) {
    const k = sentenceSubject(s, { productTerms });
    if (k === 'nguoi') nguoi += 1; else if (k === 'san_pham') sp += 1;
  }
  const roleProduct = !!salesVideo && ['solution', 'price', 'reward'].includes(role);
  const product = roleProduct || sp > 0;
  return {
    subject: sp > 0 ? 'san_pham' : nguoi > 0 ? 'nguoi' : 'chung',
    nguoi: nguoi > 0 && !roleProduct,
    product,
    productFolderOnly: !!salesVideo && product,
    price: role === 'price',
  };
}

// Trạng thái "sản phẩm hiện rõ" của đoạn cho cảnh cần sản phẩm.
// level 3 = ro_tu_dau; 2 = ro_sau và phần còn lại từ product_clear_from >= CLEAR_MIN_SEC (cắt bắt đầu từ đó);
// 1 = đoạn cũ không có nhãn (không biết); 0 = đã biết là mờ / không thấy / ro_sau mà phần rõ quá ngắn.
export function segProductState(seg) {
  const pv = seg?.product_visible;
  if (pv === undefined || pv === null) return { level: 1, cutFrom: null };
  if (pv === 'ro_tu_dau') return { level: 3, cutFrom: null };
  if (pv === 'ro_sau') {
    const from = Number(seg.product_clear_from);
    const start = Number(seg.start);
    const end = Number(seg.end);
    if (!Number.isFinite(from)) return { level: 0, cutFrom: null };
    if (from <= start + 0.05) return { level: 3, cutFrom: null };
    if (end - from >= CLEAR_MIN_SEC - 1e-9) return { level: 2, cutFrom: r2(from) };
    return { level: 0, cutFrom: null };
  }
  return { level: 0, cutFrom: null };
}
export function segSubjectState(seg) {
  const sj = seg?.subject;
  if (sj === undefined || sj === null) return 1;
  return sj === 'nguoi' || sj === 'ca_hai' ? 3 : 0;
}
// Mức hợp của đoạn với nhu cầu của cảnh: 3 tốt nhất, 1 chưa biết (đoạn cũ), 0 trái nhu cầu. Không nhu cầu = 3.
// asset (tuỳ chọn): để loại tư liệu Content khỏi cảnh sản phẩm của video bán.
export function segFitLevel(seg, need, asset = null) {
  if (!need) return { level: 3, cutFrom: null, unmet: [] };
  let level = 3;
  let cutFrom = null;
  const unmet = [];
  if (need.product) {
    const folder = String(asset?.folder || asset?.product_group || '');
    if (need.productFolderOnly && folder === 'Content') { level = 0; unmet.push('máy không từ thư mục sản phẩm'); }
    else {
      const p = segProductState(seg);
      level = Math.min(level, p.level);
      cutFrom = p.cutFrom;
      if (p.level === 0) unmet.push('máy chưa hiện rõ');
      else if (p.level === 1) unmet.push('đoạn cũ chưa gán nhãn máy');
    }
  }
  if (need.nguoi) {
    const s = segSubjectState(seg);
    level = Math.min(level, s);
    if (s === 0) unmet.push('đoạn không có người');
    else if (s === 1) unmet.push('đoạn cũ chưa gán nhãn chủ thể');
  }
  return { level, cutFrom: level >= 2 ? cutFrom : null, unmet };
}

// ---- Diễn tiến (chuẩn bị -> thao tác -> hoàn tất / vận hành), chống quẩn ----
const STAGE_RANK = { chuan_bi: 0, thao_tac: 1, hoan_tat: 2, van_hanh: 2 };
// Hạng của stage; 'khac' / thiếu = null (trung tính).
export function stageRank(stage) { return Object.prototype.hasOwnProperty.call(STAGE_RANK, stage) ? STAGE_RANK[stage] : null; }

const ACTION_STOP = new Set(['cua', 'cho', 'voi', 'tren', 'trong', 'dang', 'mot', 'cac', 'nhung', 'nay', 'kia', 'va', 'hoac', 'vao', 'ra', 'len', 'xuong', 'nguoi', 'tay', 'khi', 'thi', 'ma', 'dap', 'sau', 'truoc', 'duoc']);
export function actionTokens(text) {
  return new Set(fold(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !ACTION_STOP.has(w)));
}
// Độ giống 0..1 của hai câu hành động (Jaccard trên từ có nghĩa, không dấu).
export function actionSimilarity(a, b) {
  const x = actionTokens(a);
  const y = actionTokens(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n += 1;
  return n / (x.size + y.size - n);
}
export const SIMILAR_ACTION = 0.5;
// Tỉ lệ giây chồng nhau so với đoạn NGẮN hơn (0..1).
export function overlapFraction(aStart, aEnd, bStart, bEnd) {
  const ov = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  const m = Math.min(aEnd - aStart, bEnd - bStart);
  return ov > 0 && m > 0 ? ov / m : 0;
}
// Cùng stage (thiếu / 'khac' tính chung một nhóm trung tính).
export function sameStage(a, b) { return (a || 'khac') === (b || 'khac'); }

// Điểm cộng / trừ theo DIỄN TIẾN cho đoạn ứng viên cand ({assetId, stage, action, start, end}) so với các đoạn đã
// xếp cho các cảnh trước (prevRefs, theo thứ tự). Trả { adj, reasons }.
//  - stage lùi so với đoạn trước có stage rõ: -4; tiến: +1.
//  - dùng lại CÙNG clip, cùng stage VÀ action gần giống đoạn đã dùng: -8 (đoạn đổi stage hoặc việc mới thì cho qua).
export function progressAdjust(cand, prevRefs = []) {
  let adj = 0;
  const reasons = [];
  const r = stageRank(cand.stage);
  let lastRank = null;
  for (const p of prevRefs) { const k = stageRank(p?.stage); if (k !== null) lastRank = k; }
  if (r !== null && lastRank !== null) {
    if (r < lastRank) { adj -= 4; reasons.push('stage lùi'); } else if (r > lastRank) { adj += 1; }
  }
  for (const p of prevRefs) {
    if (!p || p.assetId !== cand.assetId) continue;
    if (sameStage(p.stage, cand.stage) && actionSimilarity(p.action || p.text, cand.action) >= SIMILAR_ACTION) { adj -= 8; reasons.push('lặp việc cùng clip'); break; }
  }
  return { adj, reasons };
}
