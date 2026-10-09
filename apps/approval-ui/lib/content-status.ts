// Trạng thái hiển thị của một bài (2/10, audit đợt A: "bài Đã từ chối mà vẫn có link FB/TikTok").
//
// Hai nguồn sự thật khác nhau:
//   - approval_queue: PHIẾU duyệt (pending, approved, rejected). Một bài có thể có nhiều phiếu; phiếu MỚI NHẤT thắng.
//   - mkt_posts: lượt đăng thật (status published). Đây là bằng chứng bài đã lên kênh.
// Trước đây /noi-dung chỉ nhìn phiếu, nên bài bị bấm Từ chối nhầm sau khi đã đăng vẫn hiện "Đã từ chối".
// Quy tắc mới: còn phiếu chờ duyệt thì là "Chờ duyệt"; không thì đã có lượt đăng thật là "Đã đăng", bất kể phiếu
// gần nhất là gì (phiếu lệch vẫn được ghi chú nhỏ cạnh badge). Chỉ đổi cách HIỂN THỊ, không đổi dữ liệu hay hành vi đăng.

/** Lượt đăng đã tới giờ (published_at có và không ở tương lai). Cùng định nghĩa với cột Trạng thái của Bảng bài viết. */
export function isLivePost(p: { published_at?: string | null }, nowIso: string = new Date().toISOString()): boolean {
  return !!p.published_at && String(p.published_at) <= nowIso;
}

/** Lượt đăng hẹn giờ chưa tới giờ (published_at ở tương lai, vd Facebook scheduled_publish_time). */
export function isScheduledPost(p: { published_at?: string | null }, nowIso: string = new Date().toISOString()): boolean {
  return !!p.published_at && String(p.published_at) > nowIso;
}

/**
 * Bài nào tính là "Đã đăng": có ít nhất 1 lượt đã tới giờ VÀ không còn lượt hẹn giờ nào chưa tới giờ.
 * 9/10 (Thanh: "cái nào hẹn giờ thì ở tab hẹn giờ"): bản tin lên YouTube ngay nhưng Facebook hẹn 17:00
 * từng bị xếp "Đã đăng" vì YouTube đã lên. Còn kênh đang hẹn thì bài vẫn là Lên lịch tới giờ hẹn.
 */
export function liveContentIds(
  posts: Array<{ content_id?: string | null; published_at?: string | null }> | null | undefined,
  nowIso: string = new Date().toISOString(),
): Set<string> {
  const live = new Set<string>();
  const waiting = new Set<string>();
  for (const p of posts || []) {
    const cid = p?.content_id ? String(p.content_id) : '';
    if (!cid) continue;
    if (isScheduledPost(p, nowIso)) waiting.add(cid);
    else if (isLivePost(p, nowIso)) live.add(cid);
  }
  for (const cid of waiting) live.delete(cid);
  return live;
}

export function effContentStatus(
  queueStatus: string | undefined,
  hasLivePost: boolean,
  rowStatus: string | null | undefined,
): string {
  if (queueStatus === 'pending') return 'review';
  if (hasLivePost) return 'published';
  if (queueStatus === 'approved') return 'approved';
  if (queueStatus === 'rejected') return 'rejected';
  return rowStatus || 'draft';
}

/** Gom phiếu theo content_id, MỖI BÀI GIỮ PHIẾU MỚI NHẤT. Phiếu phải đã sắp created_at giảm dần (dòng đầu thắng). */
export function latestQueueStatusByCid(rows: Array<{ payload?: any; status?: string | null }> | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const q of rows || []) {
    const cid = q?.payload && typeof q.payload === 'object' ? (q.payload as any).content_id : null;
    if (typeof cid === 'string' && cid && !m.has(cid)) m.set(cid, String(q.status || ''));
  }
  return m;
}
