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
