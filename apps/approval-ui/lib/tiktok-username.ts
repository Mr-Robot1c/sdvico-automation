// Username TikTok chính thức của SDVICO, MỘT chỗ duy nhất cho mọi màn (Kênh, Đo lường, Nội dung).
// 15/9 (sếp): kênh cũ @sdvico_tbtc đã MẤT, kênh hiện tại là @sdvico_tbtauca (nối OAuth 13/9).
// Env NEXT_PUBLIC_TIKTOK_USERNAME ghi đè nếu sau này đổi kênh (Next inline biến NEXT_PUBLIC_ lúc build).
export const TIKTOK_USERNAME = (process.env.NEXT_PUBLIC_TIKTOK_USERNAME || 'sdvico_tbtauca').trim();
export const TIKTOK_PROFILE_URL = `https://www.tiktok.com/@${TIKTOK_USERNAME}`;
