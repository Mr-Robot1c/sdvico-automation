'use client';

import { useState } from 'react';
import { decideForm, approveAndPublish, approveAndSchedule, dismissQueueItem } from './actions';

type Props = {
  id: string;
  title: string;
  kind: string;
  postId?: string | null;
  platform?: string | null;
  linkedinReady?: boolean;
  oldPostId?: string | null;
  oldFbPostId?: string | null;
  oldPostTitle?: string | null;
  oldPostedAt?: string | null;
};

const QUICK_SLOTS = [
  { label: '30 phút', minutes: 30 },
  { label: '2 giờ', minutes: 120 },
  { label: '6 giờ', minutes: 360 },
  { label: 'Ngày mai', minutes: 1440 },
];

// Tính chuỗi datetime-local cho lần tiếp theo của giờ VN (UTC+7).
// Trả về "YYYY-MM-DDTHH:00" ở múi giờ Việt Nam để parseVNTime xử lý đúng phía server.
function nextVNPeak(hourVN: number): string {
  const nowUtcMs = Date.now();
  const vnMs = nowUtcMs + 7 * 3600 * 1000; // UTC+7
  const vnDate = new Date(vnMs);

  const candidate = new Date(vnMs);
  candidate.setUTCHours(hourVN, 0, 0, 0);
  if (candidate <= vnDate) candidate.setUTCDate(candidate.getUTCDate() + 1);

  const y = candidate.getUTCFullYear();
  const m = String(candidate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(candidate.getUTCDate()).padStart(2, '0');
  const h = String(hourVN).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00`;
}

const PEAK_SLOTS = [
  { label: '7h sáng', hourVN: 7 },
  { label: '12h trưa', hourVN: 12 },
  { label: '7h tối', hourVN: 19 },
];

// Bộ nút quyết. Với tin tuyển dụng Facebook (hr_job_post) có thêm tuỳ chọn đặt lịch giờ vàng
// và gỡ bài cũ khi có bài cần refresh. Điều cấm 1: người bấm là cổng kiểm soát.
export default function DecideActions({ id, title, kind, postId, platform, linkedinReady, oldPostId, oldFbPostId, oldPostTitle, oldPostedAt }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [customAt, setCustomAt] = useState('');
  const [deleteOld, setDeleteOld] = useState(false);

  const hasOldPost = Boolean(oldPostId && oldFbPostId);
  const isJobPost = kind === 'hr_job_post' && postId;
  const isLinkedIn = platform === 'linkedin';

  // Chạy server action rồi nhả nút ra.
  // Trước đây busy chỉ được đặt chứ không bao giờ gỡ, dựa vào việc mục luôn biến mất khỏi
  // hàng đợi sau khi bấm. Từ khi mục gửi mail hỏng được trả lại hàng đợi, giả định đó sai:
  // mục ở lại mà mọi nút vẫn kẹt ở "Đang duyệt...", không bấm lại được.
  const run = (fn: (fd: FormData) => Promise<void>) => async (fd: FormData) => {
    try {
      await fn(fd);
    } finally {
      setBusy(null);
    }
  };

  if (isJobPost) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {isLinkedIn && !linkedinReady ? (
          <div className="err" role="alert" style={{ fontSize: '0.85em' }}>
            Chưa nối API LinkedIn (hoặc token hết hạn) — không thể tự đăng lên LinkedIn. Hãy Duyệt rồi dùng nút &quot;Copy nội dung&quot; để đăng tay lên Company Page.
          </div>
        ) : null}

        {/* Thông tin bài cũ cần gỡ — hiện chỉ khi đây là bài refresh */}
        {hasOldPost ? (
          <div className="old-post-warning">
            <strong>Bài đang chạy:</strong>{' '}
            {oldPostTitle || 'Bài cũ'}
            {oldPostedAt ? ` — đăng ${new Date(oldPostedAt).toLocaleDateString('vi-VN')}` : ''}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={deleteOld}
                onChange={(e) => setDeleteOld(e.target.checked)}
              />
              Gỡ bài cũ khỏi Facebook khi duyệt đăng bài này
            </label>
          </div>
        ) : null}

        <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {/* Đăng ngay */}
          <form action={run(approveAndPublish)} onSubmit={() => setBusy('publish')}>
            <input type="hidden" name="queue_id" value={id} />
            <input type="hidden" name="post_id" value={postId} />
            {deleteOld && oldPostId && oldFbPostId ? (
              <>
                <input type="hidden" name="delete_old_post" value="yes" />
                <input type="hidden" name="delete_old_post_id" value={oldPostId} />
                <input type="hidden" name="delete_old_fb_post_id" value={oldFbPostId} />
              </>
            ) : null}
            <button className="btn ok" disabled={busy !== null}>
              {busy === 'publish' ? 'Đang đăng...' : isLinkedIn ? 'Duyệt & đăng LinkedIn' : 'Duyệt và đăng ngay'}
            </button>
          </form>

          {/* Đặt lịch */}
          {!showSchedule ? (
            <button className="btn ghost" onClick={() => setShowSchedule(true)} disabled={busy !== null}>
              Duyệt, đặt lịch...
            </button>
          ) : null}

          {/* Xóa khỏi hàng đợi (đã bỏ "Từ chối" cho tin tuyển dụng: với bài máy tự soạn
              chỉ cần Duyệt hoặc Xóa; "Từ chối" giữ nguyên bản nháp làm kẹt vị trí) */}
          <form
            action={run(dismissQueueItem)}
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

            {/* Giờ vàng VN */}
            <div>
              <p style={{ fontSize: '0.8em', color: 'var(--ink-2)', margin: '0 0 4px' }}>Giờ vàng (lần tiếp theo):</p>
              <div className="peak-slots">
                {PEAK_SLOTS.map((s) => (
                  <form key={s.hourVN} action={run(approveAndSchedule)} onSubmit={() => setBusy('schedule')}>
                    <input type="hidden" name="queue_id" value={id} />
                    <input type="hidden" name="post_id" value={postId} />
                    <input type="hidden" name="scheduled_at" value={nextVNPeak(s.hourVN)} />
                    {hasOldPost && deleteOld ? (
                      <>
                        <input type="hidden" name="delete_old_post" value="yes" />
                        <input type="hidden" name="delete_old_post_id" value={oldPostId!} />
                        <input type="hidden" name="delete_old_fb_post_id" value={oldFbPostId!} />
                      </>
                    ) : null}
                    <button type="submit" className="peak-slot" disabled={busy !== null}>
                      {s.label}
                    </button>
                  </form>
                ))}
              </div>
            </div>

            {/* Slot cách X phút */}
            <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
              {QUICK_SLOTS.map((s) => (
                <form key={s.minutes} action={run(approveAndSchedule)} onSubmit={() => setBusy('schedule')}>
                  <input type="hidden" name="queue_id" value={id} />
                  <input type="hidden" name="post_id" value={postId} />
                  <input type="hidden" name="minutes" value={s.minutes} />
                  {hasOldPost && deleteOld ? (
                    <>
                      <input type="hidden" name="delete_old_post" value="yes" />
                      <input type="hidden" name="delete_old_post_id" value={oldPostId!} />
                      <input type="hidden" name="delete_old_fb_post_id" value={oldFbPostId!} />
                    </>
                  ) : null}
                  <button className="btn ghost" disabled={busy !== null} style={{ fontSize: '0.85em' }}>
                    {busy === 'schedule' ? 'Đang đặt...' : s.label}
                  </button>
                </form>
              ))}
            </div>

            {/* Giờ tùy chọn */}
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
                <form action={run(approveAndSchedule)} onSubmit={() => setBusy('schedule')}>
                  <input type="hidden" name="queue_id" value={id} />
                  <input type="hidden" name="post_id" value={postId} />
                  <input type="hidden" name="scheduled_at" value={customAt} />
                  {hasOldPost && deleteOld ? (
                    <>
                      <input type="hidden" name="delete_old_post" value="yes" />
                      <input type="hidden" name="delete_old_post_id" value={oldPostId!} />
                      <input type="hidden" name="delete_old_fb_post_id" value={oldFbPostId!} />
                    </>
                  ) : null}
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
        action={run(decideForm)}
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
        action={run(dismissQueueItem)}
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
