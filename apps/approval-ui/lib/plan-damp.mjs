// plan-damp.mjs — điều chỉnh trọng số TỪNG CHÚT MỘT theo số liệu ngày (user 22/8).
//
// Nguyên tắc BOSS (user chốt): đo lường THEO TUẦN -> kế hoạch tổng quát cho tuần sau;
// đo lường TỪNG NGÀY -> chỉ điều chỉnh kế hoạch đó từng chút một. Trước đây mỗi tối máy
// THAY HẲN trọng số bằng số liệu tuần-đang-chạy, tức là ngày nào cũng "lật" kế hoạch tuần.
// Giờ: trọng số đang áp chỉ DỊCH tối đa `step` điểm mỗi tối về phía trọng số số liệu ngày
// đề xuất (thang 1..3: từ 1 lên 3 mất 4 tối). Sản phẩm mới chưa có trong bản áp thì bắt đầu
// ở sàn 1 rồi cũng dịch dần.
//
// Module JS thuần để test bằng node không cần build (cùng kiểu lib/gen/*.mjs).

export const DEFAULT_STEP = 0.5;
export const W_MIN = 1;
export const W_MAX = 3;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1(v) { return Math.round(v * 10) / 10; }

// baseWeights: trọng số ĐANG ÁP (kế hoạch tuần đã chỉnh tới hôm qua).
// liveWeights: trọng số số liệu ngày đề xuất (refreshLiveProposal).
// Trả { weights, changes: [{product, from, to, target}] } — changes chỉ gồm sản phẩm có đổi.
export function dampWeights(baseWeights = {}, liveWeights = {}, step = DEFAULT_STEP) {
  const s = Number(step) > 0 ? Number(step) : DEFAULT_STEP;
  const products = new Set([...Object.keys(baseWeights || {}), ...Object.keys(liveWeights || {})]);
  const weights = {};
  const changes = [];
  for (const p of products) {
    const hasBase = baseWeights && baseWeights[p] != null;
    const cur = hasBase ? Number(baseWeights[p]) : W_MIN;
    const target = liveWeights && liveWeights[p] != null ? Number(liveWeights[p]) : cur;
    const next = round1(clamp(cur + clamp(target - cur, -s, s), W_MIN, W_MAX));
    weights[p] = next;
    if (next !== round1(cur)) changes.push({ product: p, from: round1(cur), to: next, target: round1(target) });
  }
  return { weights, changes };
}

// Dòng narrative tiếng Việt cho các thay đổi tối nay (số theo chuẩn VN: dấu phẩy thập phân).
export function describeChanges(changes = []) {
  if (!changes.length) return 'Số liệu ngày chưa đủ lệch để chỉnh trọng số, giữ nguyên kế hoạch tuần.';
  const vn = (n) => String(n).replace('.', ',');
  return 'Điều chỉnh dần theo số liệu ngày: ' + changes
    .map((c) => `${c.product} ${vn(c.from)} lên ${vn(c.to)}`.replace(' lên ', c.to < c.from ? ' xuống ' : ' lên ') + (c.target !== c.to ? ` (đang hướng ${vn(c.target)})` : ''))
    .join('; ') + '.';
}
