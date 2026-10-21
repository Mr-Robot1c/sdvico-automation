// youtube-schedule.ts — đổi giờ hẹn của người duyệt sang publishAt của YouTube (21/10). Không import gì để test chạy thẳng bằng node.

// "YYYY-MM-DDTHH:mm" giờ VN -> ISO UTC cho status.publishAt của YouTube. Trống, sai dạng hoặc còn dưới 15 phút thì
// null (đăng ngay), cùng ngưỡng isFutureVNLocal của Facebook.
export function youtubePublishAt(scheduledAt: string | null, now: number = Date.now()): string | null {
  const m = String(scheduledAt || '').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const t = new Date(`${m[1]}:${m[2] || '00'}+07:00`).getTime();
  if (!Number.isFinite(t) || t - now < 15 * 60 * 1000) return null;
  return new Date(t).toISOString();
}
