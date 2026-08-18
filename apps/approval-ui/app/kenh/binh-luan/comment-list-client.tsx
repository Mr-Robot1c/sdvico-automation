'use client';

import { Fragment, useState } from 'react';
import { decideCommentReply, ignoreCommentReply } from '../../actions';
import { formatRelative } from '../../labels';

export type PendingReply = {
  queueId: string;
  commentId: string;
  fromName: string | null;
  message: string | null;
  goiYTraLoi: string;
  postTitle: string | null;
  createdAt: string;
};

// Rút gọn nội dung bình luận cho cột hiển thị. Dài quá sẽ ellipsis, mở expand xem đủ.
function shortMessage(m: string | null): string {
  if (!m) return '';
  const s = m.replace(/\s+/g, ' ').trim();
  return s.length > 100 ? s.slice(0, 100) + '…' : s;
}

// Nội dung expand: bình luận đầy đủ + textarea sửa gợi ý trả lời + nút Duyệt/Bỏ qua.
function CommentDetail({ item }: { item: PendingReply }) {
  const [text, setText] = useState(item.goiYTraLoi);
  const [busy, setBusy] = useState<string | null>(null);

  const run = (fn: (fd: FormData) => Promise<void>) => async (fd: FormData) => {
    try { await fn(fd); } finally { setBusy(null); }
  };

  return (
    <div className="comment-detail">
      <div className="content-preview">
        <div className="content-block">
          <div className="content-label">Nội dung bình luận</div>
          <pre className="content-body">{item.message || '(không có nội dung)'}</pre>
        </div>
      </div>

      <label className="muted" style={{ fontSize: '0.82em' }}>
        Câu trả lời (có thể sửa trước khi duyệt):
      </label>
      <textarea
        className="note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{ width: '100%', marginTop: 4, resize: 'vertical' }}
      />

      <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
        <form action={run(decideCommentReply)} onSubmit={() => setBusy('approve')}>
          <input type="hidden" name="queue_id" value={item.queueId} />
          <input type="hidden" name="comment_id" value={item.commentId} />
          <input type="hidden" name="reply_text" value={text} />
          <button className="btn ok" type="submit" disabled={busy !== null || !text.trim()}>
            {busy === 'approve' ? 'Đang duyệt...' : 'Duyệt trả lời'}
          </button>
        </form>
        <form
          action={run(ignoreCommentReply)}
          onSubmit={(e) => {
            if (!window.confirm('Bỏ qua bình luận này, không trả lời?')) e.preventDefault();
            else setBusy('ignore');
          }}
        >
          <input type="hidden" name="queue_id" value={item.queueId} />
          <input type="hidden" name="comment_id" value={item.commentId} />
          <button className="btn ghost" type="submit" disabled={busy !== null}>
            {busy === 'ignore' ? 'Đang bỏ qua...' : 'Bỏ qua'}
          </button>
        </form>
      </div>

      <p className="muted" style={{ fontSize: '0.78em', marginTop: 8 }}>
        Duyệt xong, hệ thống đăng trả lời thật trong đợt chạy nền tiếp theo (khoảng 15 phút).
      </p>
    </div>
  );
}

export default function CommentListClient({ items }: { items: PendingReply[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">💬</div>
        <p>Không có bình luận nào chờ trả lời.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="cmt-table">
        <thead>
          <tr>
            <th className="cmt-th-from">Người bình luận</th>
            <th className="cmt-th-post">Bài liên quan</th>
            <th className="cmt-th-msg">Bình luận</th>
            <th className="cmt-th-time">Nhận</th>
            <th className="cmt-th-caret" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const isOpen = openId === it.queueId;
            return (
              <Fragment key={it.queueId}>
                <tr
                  className={`cmt-row${isOpen ? ' is-open' : ''}`}
                  onClick={() => setOpenId((cur) => (cur === it.queueId ? null : it.queueId))}
                >
                  <td className="cmt-td-from">
                    <div className="cmt-from-name">{it.fromName || 'Ẩn danh'}</div>
                  </td>
                  <td className="cmt-td-post">
                    {it.postTitle ? (
                      <span className="cmt-post-title">{it.postTitle}</span>
                    ) : (
                      <span className="muted">Không rõ bài</span>
                    )}
                  </td>
                  <td className="cmt-td-msg">
                    <span className="cmt-msg-preview">{shortMessage(it.message) || <span className="muted">(không có nội dung)</span>}</span>
                  </td>
                  <td className="cmt-td-time muted" suppressHydrationWarning>{formatRelative(it.createdAt)}</td>
                  <td className="cmt-td-caret">
                    <span className={`caret${isOpen ? ' open' : ''}`} aria-hidden="true">›</span>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="cmt-expand-row">
                    <td colSpan={5}>
                      <CommentDetail item={it} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
