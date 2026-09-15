// Username TikTok chính thức của SDVICO, MỘT chỗ duy nhất cho mọi màn (Kênh, Đo lường, Nội dung).
// 15/9 (sếp): kênh cũ @sdvico_tbtc đã MẤT, kênh hiện tại là @sdvico_tbtauca (nối OAuth 13/9).
// Env NEXT_PUBLIC_TIKTOK_USERNAME ghi đè nếu sau này đổi kênh (Next inline biến NEXT_PUBLIC_ lúc build).
export const TIKTOK_USERNAME = (process.env.NEXT_PUBLIC_TIKTOK_USERNAME || 'sdvico_tbtauca').trim();
export const TIKTOK_PROFILE_URL = `https://www.tiktok.com/@${TIKTOK_USERNAME}`;

// 15/9 (Thanh: "view của block TikTok đang bị sai"): snapshot mkt_metrics source=tiktok còn lẫn video của
// kênh cũ (989 lượt xem cộng cả 2 kênh). Snapshot không lưu username, nên lọc theo:
//   1. danh sách id video hiện còn trên kênh (Display API /v2/video/list/, lib/tiktok.ts getTikTokVideoIds) — chính xác;
//   2. không có danh sách (API lỗi) -> mốc nối kênh mới: video có createTime từ ngày này trở đi.
export const TIKTOK_CONNECTED_AT = (process.env.NEXT_PUBLIC_TIKTOK_CONNECTED_AT || '2026-09-13').trim();
const CONNECTED_TS = Math.floor(new Date(TIKTOK_CONNECTED_AT + 'T00:00:00+07:00').getTime() / 1000);

export function isCurrentTikTokMetric(m: any, ids: Set<string> | null | undefined): boolean {
  if (!m) return false;
  const vid = m.videoId ? String(m.videoId) : '';
  if (ids && ids.size) return !!vid && ids.has(vid);
  const ct = Number(m.createTime) || 0;
  return ct >= CONNECTED_TS;
}
