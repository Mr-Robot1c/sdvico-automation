'use client';

import { useState } from 'react';
import { decideForm } from './actions';

// Ô ghi chú, ô hẹn giờ đăng (không bắt buộc) và hai nút quyết.
// Hẹn giờ: để trống -> đăng ngay khi bấm Duyệt. Có giờ -> Facebook nhận scheduled_publish_time,
// tự đăng đúng giờ (FB yêu cầu tối thiểu 10 phút, tối đa 6 tháng kể từ hiện tại).
// Từ chối là hành động khó lấy lại, hỏi lại một lần trước khi gửi.
export default function DecideActions({ id, title }: { id: string; title: string }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [schedule, setSchedule] = useState('');

  return (
    <form
      className="row"
      action={decideForm}
      onSubmit={(e) => {
        const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
        if (action === 'reject') {
          const ok = window.confirm(`Từ chối mục này?\n\n"${title}"`);
          if (!ok) { e.preventDefault(); return; }
        }
        if (action === 'approve' && schedule) {
          const t = new Date(schedule).getTime();
          const now = Date.now();
          const min = now + 11 * 60 * 1000; // FB tối thiểu 10 phút, chừa 1 phút an toàn
          const max = now + 180 * 24 * 60 * 60 * 1000; // FB tối đa 6 tháng
          if (t < min) {
            alert('Facebook yêu cầu hẹn giờ ít nhất 11 phút sau hiện tại.');
            e.preventDefault();
            return;
          }
          if (t > max) {
            alert('Facebook chỉ cho hẹn tối đa 6 tháng.');
            e.preventDefault();
            return;
          }
        }
        setBusy(action as 'approve' | 'reject');
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input className="note" name="note" placeholder="Ghi chú (không bắt buộc)" aria-label="Ghi chú" />
      <label className="schedule-lbl" title="Để trống = đăng ngay khi bấm Duyệt. Có giờ = Facebook tự đăng đúng giờ hẹn.">
        <span aria-hidden="true">⏰</span>
        <input
          type="datetime-local"
          name="scheduled_at"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          aria-label="Hẹn giờ đăng (không bắt buộc)"
        />
      </label>
      <button className="btn ok" name="action" value="approve" disabled={busy !== null}>
        {busy === 'approve' ? (schedule ? 'Đang hẹn...' : 'Đang duyệt...') : (schedule ? 'Duyệt + Hẹn giờ' : 'Duyệt')}
      </button>
      <button className="btn no" name="action" value="reject" disabled={busy !== null}>
        {busy === 'reject' ? 'Đang từ chối...' : 'Từ chối'}
      </button>
    </form>
  );
}
