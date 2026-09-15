// Username TikTok chính thức của SDVICO, MỘT chỗ duy nhất cho mọi màn (Kênh, Đo lường, Nội dung).
// 15/9 (sếp): kênh cũ @sdvico_tbtc đã MẤT, kênh hiện tại là @sdvico_tbtauca (nối OAuth 13/9).
// Env NEXT_PUBLIC_TIKTOK_USERNAME ghi đè nếu sau này đổi kênh (Next inline biến NEXT_PUBLIC_ lúc build).
export const TIKTOK_USERNAME = (process.env.NEXT_PUBLIC_TIKTOK_USERNAME || 'sdvico_tbtauca').trim();
export const TIKTOK_PROFILE_URL = `https://www.tiktok.com/@${TIKTOK_USERNAME}`;

// 15/9 (sếp: thẻ TikTok /kenh "view vẫn sai tè le" — hiện 900, thật chỉ 84): mkt_metrics source=tiktok
// còn giữ snapshot 6 video của kênh cũ @sdvico_tbtc (816 lượt xem) nên mọi chỗ cộng dồn bị lẫn kênh cũ.
// Lọc theo tên kênh trong shareUrl (TikTok API luôn trả share_url có @username). Dòng không có shareUrl
// (không xác định được kênh) vẫn giữ để không mất số bài ghép tay. Không xóa dữ liệu kênh cũ.
export function isCurrentTikTokMetric(metrics: any): boolean {
  const url = String(metrics?.shareUrl || '');
  if (!url) return true;
  const m = url.match(/tiktok\.com\/@([^/?#]+)/i);
  if (!m) return true;
  return m[1].toLowerCase() === TIKTOK_USERNAME.toLowerCase();
}
