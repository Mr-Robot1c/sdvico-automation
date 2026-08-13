'use client';

import { useState } from 'react';
import { decideForm, approveAndPublish, approveAndSchedule, dismissQueueItem } from './actions';

type Props = {
  id: string;
  title: string;
  kind: string;
  postId?: string | null;
};

const QUICK_SLOTS = [
  { label: '30 phút', minutes: 30 },
  { label: '2 giờ', minutes: 120 },
  { label: '6 giờ', minutes: 360 },
  { label: 'Ngày mai', minutes: 1440 },
];

// Bộ nút quyết. Với tin tuyển dụng Facebook (hr_job_post) có thêm tuỳ chọn
// đặt lịch ngay tại trang Duyệt — không phải chuyển sang trang khác.
// Điều cấm 1: người bấm là cổng kiểm soát, không có nút nào tự động bỏ qua người.
export default function DecideActions({ id, title, kind, postId }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [customAt, setCustomAt] = useState('');

  const isJobPost = kind === 'hr_job_post' && postId;

  if (isJobPost) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {/* Đăng ngay */}
          <form action={approveAndPublish} onSubmit={() => setBusy('publish')}>
            <input type="hidden" name="queue_id" value={id} />
            <input type="hidden" name="post_id" value={postId} />
            <button className="btn ok" disabled={busy !== null}>
              {busy === 'publish' ? 'Đang đăng...' : 'Duyệt và đăng ngay'}
            </button>
          </form>

          {/* Đặt lịch */}
          {!showSchedule ? (
            <button className="btn ghost" onClick={() => setShowSchedule(true)} disabled={busy !== null}>
              Duyệt, đặt lịch...
            </button>
          ) : null}

          {/* Từ chối */}
          <form
            action={decideForm}
            onSubmit={(e) => {
              if (!window.confirm(`Từ chối mục này?\n\n"${title}"`)) { e.preventDefault(); return; }
              setBusy('reject');
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="reject" />
            <button className="btn no" disabled={busy !== null}>
              {busy === 'reject' ? 'Đang từ chối...' : 'Từ chối'}
            </button>
          </form>

          {/* Xóa khỏi hàng đợi — hủy bản nháp để worker soạn lại */}
          <form
            action={dismissQueueItem}
            onSubmit={(e) => {
              if (!window.confirm(`Xóa mục này khỏi hàng đợi?\n\n"${title}"\n\nBài nháp sẽ bị hủy và worker sẽ soạn lại.`)) { e.preventDefault(); return; }
              setBusy('dismiss');
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="post_id" value={postId || ''} />
            <button className="btn ghost" disabled={busy !== null} style={{ fontSize: '0.85em', color: 'var(--ink-2)' }}>
              {busy === 'dismiss' ? 'Đang xóa...' : 'Xóa'}
            </button>
          </form>
        </div>

        {showSchedule ? (
          <div className="settings-box" style={{ margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: '0.88em', fontWeight: 600 }}>
              Duyệt và đặt lịch — worker tự đăng khi đến giờ
            </span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
              {QUICK_SLOTS.map((s) => (
                <form key={s.minutes} action={approveAndSchedule} onSubmit={() => setBusy('schedule')}>
                  <input type="hidden" name="queue_id" value={id} />
                  <input type="hidden" name="post_id" value={postId} />
                  <input type="hidden" name="minutes" value={s.minutes} />
                  <button className="btn ghost" disabled={busy !== null} style={{ fontSize: '0.85em' }}>
                    {busy === 'schedule' ? 'Đang đặt...' : s.label}
                  </button>
                </form>
              ))}
            </div>
            <div className="row" style={{ gap: 5 }}>
              <input
                className="note"
                type="datetime-local"
                value={customAt}
                onChange={(e) => setCustomAt(e.target.value)}
                aria-label="Chọn giờ cụ thể"
                style={{ flex: 1 }}
              />
              {customAt ? (
                <form action={approveAndSchedule} onSubmit={() => setBusy('schedule')}>
                  <input type="hidden" name="queue_id" value={id} />
                  <input type="hidden" name="post_id" value={postId} />
                  <input type="hidden" name="scheduled_at" value={customAt} />
                  <button className="btn ghost" disabled={busy !== null} style={{ fontSize: '0.85em' }}>
                    {busy === 'schedule' ? 'Đang đặt...' : 'Đặt giờ này'}
                  </button>
                </form>
              ) : null}
            </div>
            <button
              className="btn ghost"
              onClick={() => setShowSchedule(false)}
              style={{ fontSize: '0.8em', alignSelf: 'flex-start' }}
            >
              Đóng
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // Các loại khác: nút Duyệt/Từ chối/Xóa.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <form
        className="row"
        action={decideForm}
        onSubmit={(e) => {
          const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
          if (action === 'reject') {
            if (!window.confirm(`Từ chối mục này?\n\n"${title}"`)) { e.preventDefault(); return; }
          }
          setBusy(action as string);
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input className="note" name="note" placeholder="Ghi chú (không bắt buộc)" aria-label="Ghi chú" />
        <button className="btn ok" name="action" value="approve" disabled={busy !== null}>
          {busy === 'approve' ? 'Đang duyệt...' : 'Duyệt'}
        </button>
        <button className="btn no" name="action" value="reject" disabled={busy !== null}>
          {busy === 'reject' ? 'Đang từ chối...' : 'Từ chối'}
        </button>
      </form>
      <form
        action={dismissQueueItem}
        onSubmit={(e) => {
          if (!window.confirm(`Xóa mục này khỏi hàng đợi?\n\n"${title}"`)) { e.preventDefault(); return; }
          setBusy('dismiss');
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button className="btn ghost" disabled={busy !== null} style={{ fontSize: '0.85em', color: 'var(--ink-2)' }}>
          {busy === 'dismiss' ? 'Đang xóa...' : 'Xóa khỏi hàng đợi'}
        </button>
      </form>
    </div>
  );
}
