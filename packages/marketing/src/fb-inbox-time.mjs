// fb-inbox-time.mjs — mốc lọc tin nhắn hộp thư Facebook + đọc chuỗi giờ của Meta Business Suite.
//
// Vì sao (Thanh 9/9/2026: "chỉ lấy tin nhắn từ tháng 7 trở lên vì trước đó tôi không có can thiệp vào"):
// hộp thư page có hội thoại cũ từ tháng 4, tháng 6 (khách hỏi phụ tùng, đã trôi). Lượt đọc 8/9 nhập
// cả tin "26 April" thành lead mới, hiện "18 giờ trước" vì created_at là giờ nhập. Từ nay mọi đường
// thu tin (Graph API lib/fb-inbox.ts + phiên Chrome fb-inbox-import.mjs) đều bỏ tin khách gửi
// TRƯỚC 1/7/2026 giờ Việt Nam. Đổi mốc bằng env FB_INBOX_SINCE (ISO có múi giờ) nếu cần.
//
// Business Suite hiện giờ tin theo dạng tương đối, không có năm nếu cùng năm:
//   "15:45" | "Today" | "Yesterday" | "Wed" | "Wednesday" | "Wed 15:45" | "Wednesday, 15:45"
//   "25 August" | "26 April" | "25 Aug" | "23 Aug 2026, 21:48" | "2026-09-07 14:03" | ISO.
// parseSuiteTime đổi về mili giây epoch (giờ VN, UTC+7), trả null nếu không hiểu để nơi gọi tự quyết.

export const INBOX_SINCE_ISO = process.env.FB_INBOX_SINCE || '2026-07-01T00:00:00+07:00';
export const INBOX_SINCE_MS = Date.parse(INBOX_SINCE_ISO);
export const INBOX_SINCE_LABEL = '1/7/2026';

const VN_OFFSET_MS = 7 * 3600e3;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// Các trường ngày giờ VN của một mốc epoch.
function vnParts(ms) {
  const d = new Date(ms + VN_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}
// Ghép ngày giờ VN thành epoch.
const vnMs = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m, d, hh, mm) - VN_OFFSET_MS;

export function parseSuiteTime(str, refMs = Date.now()) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const ref = vnParts(refMs);

  // ISO hoặc "2026-09-07 14:03" (giờ VN).
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (m) {
    if (m[6]) { const t = Date.parse(s); return Number.isNaN(t) ? null : t; }
    return vnMs(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }

  // "23 Aug 2026, 21:48" | "25 August" | "26 April" | "25 Aug" | "23 Aug 2026".
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?(?: (\d{4}))?(?:,? (\d{1,2}):(\d{2}))?$/);
  if (m) {
    const low = m[2].toLowerCase();
    const mon = MONTHS[low.slice(0, 4)] ?? MONTHS[low.slice(0, 3)];
    if (mon === undefined) return null;
    const y = m[3] ? +m[3] : ref.y;
    let t = vnMs(y, mon, +m[1], +(m[4] || 0), +(m[5] || 0));
    // Không ghi năm = cùng năm với lúc đọc; nếu rơi vào tương lai (đọc đầu tháng 1) thì là năm trước.
    if (!m[3] && t > refMs + 86400e3) t = vnMs(y - 1, mon, +m[1], +(m[4] || 0), +(m[5] || 0));
    return t;
  }

  // "Today" | "Yesterday" | "15:45" | "Today 15:45" | "Yesterday, 15:45".
  m = s.match(/^(?:(Today|Yesterday),? ?)?(?:(\d{1,2}):(\d{2}))?$/i);
  if (m && (m[1] || m[2])) {
    const back = m[1] && m[1].toLowerCase() === 'yesterday' ? 1 : 0;
    return vnMs(ref.y, ref.m, ref.d - back, +(m[2] || 0), +(m[3] || 0));
  }

  // "Wed" | "Wednesday" | "Wed 15:45" | "Wednesday, 15:45": thứ trong 7 ngày gần nhất.
  m = s.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,? ?(?:(\d{1,2}):(\d{2}))?$/i);
  if (m) {
    const dow = DOW[m[1].toLowerCase()];
    let back = (ref.dow - dow + 7) % 7;
    if (back === 0) back = 7; // hôm nay thì Suite ghi giờ, không ghi thứ
    return vnMs(ref.y, ref.m, ref.d - back, +(m[2] || 0), +(m[3] || 0));
  }

  return null;
}

// true nếu chuỗi giờ đọc được và nằm TRƯỚC mốc lọc; không đọc được -> false (giữ tin, không mất lead).
export function isBeforeSince(str, refMs = Date.now(), sinceMs = INBOX_SINCE_MS) {
  const t = parseSuiteTime(str, refMs);
  return t !== null && t < sinceMs;
}
