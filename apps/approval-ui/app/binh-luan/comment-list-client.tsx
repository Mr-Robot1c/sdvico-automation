'use client';

import { useState } from 'react';
import { decideCommentReply, ignoreCommentReply } from '../actions';

export type PendingReply = {
  queueId: string;
  commentId: string;
  fromName: string | null;
  message: string | null;
  goiYTraLoi: string;
  postTitle: string | null;
  createdAt: string;
};

function ReplyRow({ item }: { item: PendingReply }) {
  const [text, setText] = useState(item.goiYTraLoi);
  const [busy, setBusy] = useState<string | null>(null);

  const run = (fn: (fd: FormData) => Promise<void>) => async (fd: FormData) => {
    try { await fn(fd); } finally { setBusy(null); }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{item.fromName || 'Ẩn danh'}</b>
        {item.postTitle ? <span className="muted">trên bài: {item.postTitle}</span> : null}
      </div>
      <p style={{ margin: '8px 0' }}>{item.message || <span className="muted">(không có nội dung)</span>}</p>

      <label className="muted" style={{ fontSize: '0.82em' }}>Câu trả lời (có thể sửa trước khi duyệt):</label>
      <textarea
        className="note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{ width: '100%', marginTop: 4, resize: 'vertical' }}
      />

      <div className="row" style={{ marginTop: 8 }}>
        <form action={run(decideCommentReply)} onSubmit={() => setBusy('approve')}>
          <input type="hidden" name="queue_id" value={item.queueId} />
          <input type="hidden" name="comment_id" value={item.commentId} />
          <input type="hidden" name="reply_text" value={text} />
          <button className="btn ok" type="submit" disabled={busy !== null || !text.trim()}>
            {busy === 'approve' ? 'Đang duyệt...' : 'Duyệt'}
          </button>
        </form>
        <form
          action={run(ignoreCommentReply)}
          onSubmit={(e) => { if (!window.confirm('Bỏ qua bình luận này, không trả lời?')) e.preventDefault(); else setBusy('ignore'); }}
        >
          <input type="hidden" name="queue_id" value={item.queueId} />
          <input type="hidden" name="comment_id" value={item.commentId} />
          <button className="btn ghost" type="submit" disabled={busy !== null}>
            {busy === 'ignore' ? 'Đang bỏ qua...' : 'Bỏ qua'}
          </button>
        </form>
      </div>
      <p className="muted" style={{ fontSize: '0.78em', marginTop: 6 }}>
        Duyệt xong, hệ thống đăng trả lời thật trong đợt chạy nền tiếp theo (khoảng 15 phút).
      </p>
    </div>
  );
}

export default function CommentListClient({ items }: { items: PendingReply[] }) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">💬</div>
        <p>Không có bình luận nào chờ trả lời.</p>
      </div>
    );
  }
  return <div>{items.map((item) => <ReplyRow key={item.queueId} item={item} />)}</div>;
}
