// segments.mjs — hàm THUẦN cho "đoạn trong clip" (ĐỢT A, 9/10). Không gọi mạng, không đụng DB, test được.
//
// Gốc: assemble.mjs luôn lấy clip từ giây 0 và LẶP nếu ngắn, nên lời 10 giây phủ bằng đoạn 3 giây lặp 3 lần.
// Nay mỗi clip trong kho có thể mang `segments` (brand_assets.segments): các đoạn 2 tới 12 giây, mỗi đoạn ghi
// hành động THỰC SỰ thấy. Cảnh video chọn đúng đoạn, cắt `-ss start -t dur`, không lặp.
//
// Hai kiểu đối tượng đoạn:
//   - đoạn LƯU TRONG DB (clip.segments[i]): { start, end, action, people, equipment, setting, vertical_ok, note }
//   - đoạn THAM CHIẾU trong cảnh (scene.segment / scene.extraSegments[i]): { assetId, idx, start, end }

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
      out.push({ ...c, start: r2(s + chunk * k), end: r2(k === n - 1 ? c.end : s + chunk * (k + 1)) });
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
