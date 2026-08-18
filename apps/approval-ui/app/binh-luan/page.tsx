import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import CommentListClient, { type PendingReply } from './comment-list-client';

export const dynamic = 'force-dynamic';

type QueueRow = {
  id: string;
  created_at: string;
  payload: { comment_id?: string; message?: string; goi_y_tra_loi?: string } | null;
};
type CommentRow = { id: string; from_name: string | null; job_post_id: string | null; trang_thai: string; created_at: string };
type PostRow = { id: string; tieu_de: string };

export default async function Page() {
  const client = getServerClient();

  const [queueRes, historyRes] = await Promise.all([
    client
      .from('approval_queue')
      .select('id, created_at, payload')
      .eq('kind', 'fb_comment_reply')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    client
      .from('hr_fb_comments')
      .select('id, from_name, job_post_id, trang_thai, created_at')
      .in('trang_thai', ['replied', 'ignored', 'failed', 'reacted'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Kiểm hr_fb_comments (historyRes), không phải approval_queue — approval_queue luôn tồn tại
  // sẵn, nên trước đây kiểm nhầm bảng khiến lỗi "chưa chạy migration" bị nuốt im lặng và trang
  // chỉ hiện "không có bình luận" dù bảng thật sự chưa được tạo.
  const missing = (code?: string) => code === 'PGRST205' || code === '42P01';
  const needMigration = missing(historyRes.error?.code);

  const queueRows = (queueRes.data || []) as QueueRow[];
  const commentIds = queueRows.map((q) => q.payload?.comment_id).filter(Boolean) as string[];

  const commentById = new Map<string, CommentRow>();
  if (commentIds.length) {
    const { data } = await client.from('hr_fb_comments').select('id, from_name, job_post_id, trang_thai, created_at').in('id', commentIds);
    for (const r of (data || []) as CommentRow[]) commentById.set(r.id, r);
  }

  const postIds = [...commentById.values()].map((c) => c.job_post_id).filter(Boolean) as string[];
  const postTitleById = new Map<string, string>();
  if (postIds.length) {
    const { data } = await client.from('hr_job_posts').select('id, tieu_de').in('id', postIds);
    for (const r of (data || []) as PostRow[]) postTitleById.set(r.id, r.tieu_de);
  }

  const items: PendingReply[] = queueRows
    .filter((q) => q.payload?.comment_id)
    .map((q) => {
      const c = commentById.get(q.payload!.comment_id!);
      return {
        queueId: q.id,
        commentId: q.payload!.comment_id!,
        fromName: c?.from_name || null,
        message: q.payload?.message || null,
        goiYTraLoi: q.payload?.goi_y_tra_loi || '',
        postTitle: c?.job_post_id ? postTitleById.get(c.job_post_id) || null : null,
        createdAt: q.created_at,
      };
    });

  const history = (historyRes.data || []) as CommentRow[];
  const HIST_LABEL: Record<string, { label: string; tone: string }> = {
    replied: { label: 'Đã trả lời', tone: 'ok' },
    reacted: { label: 'Đã react (tích cực)', tone: 'ok' },
    ignored: { label: 'Đã bỏ qua', tone: 'default' },
    failed: { label: 'Lỗi khi đăng', tone: 'no' },
  };

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Bình luận Facebook</h1>
          <p className="sub">
            Bình luận công khai trên bài đã đăng. Máy tự phân loại: hỏi thêm chi tiết thì soạn câu
            mời nhắn Messenger (chờ ở đây, người bấm Duyệt mới đăng) · khen/ủng hộ thì máy tự react
            like, không cần duyệt · còn lại thì bỏ qua. Xem cột &quot;Lịch sử gần đây&quot; bên dưới
            để biết bình luận đã được xử lý ra sao.
          </p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {needMigration ? (
        <div className="err" role="alert">
          Chưa bật đủ tính năng. Chạy các migration <code>20260818020000_hr_fb_comments.sql</code> và{' '}
          <code>20260818040000_hr_fb_comments_classify.sql</code> trong Supabase rồi tải lại.
        </div>
      ) : (
        <>
          <CommentListClient items={items} />

          {history.length > 0 ? (
            <div style={{ marginTop: 24 }}>
              <b>Lịch sử gần đây</b>
              <table className="run-log" style={{ marginTop: 8 }}>
                <thead><tr><th>Từ</th><th>Trạng thái</th><th>Lúc</th></tr></thead>
                <tbody>
                  {history.map((h) => {
                    const st = HIST_LABEL[h.trang_thai] || { label: h.trang_thai, tone: 'default' };
                    return (
                      <tr key={h.id}>
                        <td>{h.from_name || 'Ẩn danh'}</td>
                        <td><span className={`stage tone-${st.tone}`}>{st.label}</span></td>
                        <td className="muted">{new Date(h.created_at).toLocaleString('vi-VN')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
