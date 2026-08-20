// Kill switch cho toàn bộ mảng "trang tuyển dụng public + XML feed Jooble".
// Đặt biến JOBS_PUBLIC_ENABLED=false trên Vercel để tắt tức thì mà không cần deploy code:
//   - /api/jobs/feed.xml trả 404 (JoobleBot dừng crawl, sau 24h feed biến mất khỏi Jooble)
//   - /tuyen-dung và /tuyen-dung/[slug] trả 404 (link Jooble cũ vẫn dẫn về, nhưng ứng viên
//     thấy 404 sạch — không lộ dữ liệu, không lỗi 500)
// Bật lại: xoá biến hoặc đặt JOBS_PUBLIC_ENABLED=true, redeploy.
//
// Mặc định BẬT khi biến không được đặt — không phá luồng đã deploy.
export function jobsPublicEnabled(): boolean {
  const raw = (process.env.JOBS_PUBLIC_ENABLED || '').toLowerCase().trim();
  if (!raw) return true;
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'no';
}
