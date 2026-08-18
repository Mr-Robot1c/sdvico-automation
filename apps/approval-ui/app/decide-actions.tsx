'use client';

import { useState } from 'react';
import { decideForm } from './actions';

// Ô ghi chú, ô hẹn giờ đăng (không bắt buộc) và hai nút quyết.
// Hẹn giờ: để trống -> đăng ngay khi bấm Duyệt. Có giờ -> Facebook nhận scheduled_publish_time,
// tự đăng đúng giờ (FB yêu cầu tối thiểu 10 phút, tối đa 6 tháng kể từ hiện tại).
// Từ chối là hành động khó lấy lại, hỏi lại một lần trước khi gửi.
// Đổi giá trị datetime-local ("YYYY-MM-DDTHH:mm") thành chuỗi tiếng Việt dễ đọc để user
// kiểm lại (tránh nhầm AM/PM: 12:00 AM là 0h khuya, không phải 12h trưa).
function humanVN(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  const buoi = d.getHours() < 5 ? 'khuya' : d.getHours() < 11 ? 'sáng' : d.getHours() < 13 ? 'trưa' : d.getHours() < 18 ? 'chiều' : 'tối';
  return `${hh}:${mm} ${buoi} ${dd}/${mo}/${y}`;
}

export default function DecideActions({ id, title }: { id: string; title: string }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [schedule, setSchedule] = useState('');
  const preview = humanVN(schedule);

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
          const min = now + 11 * 60 * 1000;
          const max = now + 180 * 24 * 60 * 60 * 1000;
          if (t < min) {
            const chosen = humanVN(schedule);
            const nowStr = humanVN(new Date(now - now % 60000).toISOString().slice(0, 16));
            alert(`Giờ hẹn "${chosen}" đã qua hoặc quá gần.\n\nHiện tại: ${nowStr}.\n\nHẹn ít nhất 11 phút sau hiện tại. Lưu ý: 12:00 AM = 0h khuya (không phải trưa), 12:00 PM = 12h trưa.`);
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
      <label className="schedule-lbl" title="Để trống = đăng ngay khi bấm Duyệt. Có giờ = Facebook tự đăng đúng giờ hẹn. Lưu ý AM = sáng/khuya, PM = trưa/chiều/tối.">
        <span aria-hidden="true">⏰</span>
        <input
          type="datetime-local"
          name="scheduled_at"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          aria-label="Hẹn giờ đăng (không bắt buộc). AM = sáng, PM = chiều tối"
        />
        {preview ? <span className="schedule-preview">→ {preview}</span> : null}
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
