// page-origin.mjs — bài này nằm trên PAGE CHÍNH (page hệ thống đang đăng) hay PAGE KHÁC?
//
// User 22/8: "ở chỗ đo lường khi thêm video/post khác page thì note lại là không phải page
// chính". Bài nhập tay (importManualFacebookPost) có thể lấy từ page chính thức hoặc page
// khác; số liệu của page khác (lượng theo dõi khác, khách khác) không so ngang với bài hệ
// thống đăng được -> đánh dấu rõ ở Đo lường + báo cáo tuần.
//
// Page chính = FACEBOOK_PAGE_ID (page token đăng bài). Nhận dạng page của một bài:
//   1. external_url dạng facebook.com/<pageId>_<postId> hoặc /<pageId>/videos/<id> -> so id.
//   2. Không có id trong URL -> dựa brief.page (nhãn token khi nhập: 'test' | 'real'):
//      'real' mà page chính đang là test (hoặc ngược lại) -> page khác.
// Không đủ dữ kiện -> coi là page chính (không gắn nhãn bừa).

export function pageIdFromUrl(url) {
  const s = String(url || '');
  let m = s.match(/facebook\.com\/(\d{6,})_\d+/);
  if (m) return m[1];
  m = s.match(/facebook\.com\/(\d{6,})\/(?:videos|posts|reel)\//);
  if (m) return m[1];
  return null;
}

// env: { mainPageId, realPageId } — truyền vào để test được; mặc định đọc process.env.
export function isOtherPage(url, brief = {}, env = null) {
  const e = env || { mainPageId: process.env.FACEBOOK_PAGE_ID || '', realPageId: process.env.FACEBOOK_REAL_PAGE_ID || '' };
  const main = String(e.mainPageId || '').trim();
  const pid = pageIdFromUrl(url);
  if (pid && main) return pid !== main;
  const label = String((brief && brief.page) || '').trim();
  if (!label) return false;
  // Nhãn token lúc nhập: page chính đang là token nào?
  const mainIsReal = !!main && !!e.realPageId && main === String(e.realPageId).trim();
  if (label === 'real') return !mainIsReal;
  if (label === 'test') return mainIsReal;
  return false;
}

export const OTHER_PAGE_LABEL = 'Page khác';
export const OTHER_PAGE_HINT = 'Bài nhập từ page khác, không phải page chính hệ thống đang đăng. Số liệu chỉ để tham khảo, không so ngang với bài trên page chính.';
