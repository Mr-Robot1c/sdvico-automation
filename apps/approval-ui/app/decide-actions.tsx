'use client';

import { useMemo, useState } from 'react';
import { decideForm } from './actions';

// Ô ghi chú, bộ HẸN GIỜ (không bắt buộc) và hai nút quyết.
// Hẹn giờ: để trống -> đăng ngay khi bấm Duyệt. Có giờ -> Facebook nhận scheduled_publish_time,
// tự đăng đúng giờ (FB yêu cầu tối thiểu 10 phút, tối đa 6 tháng kể từ hiện tại).
//
// v2 (18/8, user "không thể bấm hẹn giờ được"): bỏ input datetime-local thô (4 ô nhỏ
// mm/dd/yyyy --:-- -- kiểu Mỹ, khó bấm, dễ nhầm AM/PM). Thay bằng 2 dropdown: NGÀY (Hôm nay,
// Ngày mai, Ngày kia, hoặc chọn ngày) + GIỜ (8:00, 11:30, 19:00 = 3 khung giờ đăng của vòng
// xoay, hoặc giờ khác). Ghép ra "YYYY-MM-DDTHH:mm" gửi lên field scheduled_at như cũ nên
// server không đổi. Nhãn tiếng Việt, 24h, xem trước "→ 19:00 tối 19/08/2026".
// Từ chối là hành động khó lấy lại, hỏi lại một lần trước khi gửi.

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dmy(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }

// Đổi "YYYY-MM-DDTHH:mm" thành chuỗi tiếng Việt dễ đọc để user kiểm lại.
function humanVN(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const buoi = h < 5 ? 'khuya' : h < 11 ? 'sáng' : h < 13 ? 'trưa' : h < 18 ? 'chiều' : 'tối';
  return `${pad(h)}:${pad(d.getMinutes())} ${buoi} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// 3 khung giờ đăng chuẩn (khớp lịch vòng xoay 8h / 11h30 / 19h). "Giờ khác" mở ô time.
const TIME_PRESETS: Array<{ v: string; label: string }> = [
  { v: '08:00', label: '8:00 sáng' },
  { v: '11:30', label: '11:30 trưa' },
  { v: '19:00', label: '19:00 tối' },
];

export default function DecideActions({ id, title }: { id: string; title: string }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [dayKey, setDayKey] = useState<string>('');      // '' | 'd0' | 'd1' | 'd2' | 'custom'
  const [customDay, setCustomDay] = useState<string>(''); // YYYY-MM-DD khi dayKey=custom
  const [timeKey, setTimeKey] = useState<string>('19:00'); // preset hoặc 'custom'
  const [customTime, setCustomTime] = useState<string>('');

  // Danh sách ngày gợi ý: hôm nay, mai, mốt (nhãn có thứ + ngày).
  const dayOptions = useMemo(() => {
    const names = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const out: Array<{ key: string; ymd: string; label: string }> = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const pre = i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : 'Ngày kia';
      out.push({ key: `d${i}`, ymd: ymd(d), label: `${pre} (${names[d.getDay()]} ${dmy(d)})` });
    }
    return out;
  }, []);

  // Ghép giá trị scheduled_at. Trống nếu chưa chọn ngày.
  const schedule = useMemo(() => {
    let day = '';
    if (dayKey === 'custom') day = customDay;
    else if (dayKey) day = dayOptions.find((o) => o.key === dayKey)?.ymd || '';
    if (!day) return '';
    const time = timeKey === 'custom' ? customTime : timeKey;
    if (!time) return '';
    return `${day}T${time}`;
  }, [dayKey, customDay, timeKey, customTime, dayOptions]);
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
        if (action === 'approve' && dayKey && !schedule) {
          alert('Đã chọn ngày nhưng chưa có giờ. Chọn một khung giờ hoặc bỏ chọn ngày để đăng ngay.');
          e.preventDefault();
          return;
        }
        if (action === 'approve' && schedule) {
          const t = new Date(schedule).getTime();
          const now = Date.now();
          const min = now + 11 * 60 * 1000;
          const max = now + 180 * 24 * 60 * 60 * 1000;
          if (t < min) {
            alert(`Giờ hẹn "${humanVN(schedule)}" đã qua hoặc quá gần. Hẹn ít nhất 11 phút sau bây giờ, hoặc bỏ chọn ngày để đăng ngay.`);
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
      {/* Server đọc field scheduled_at như cũ; rỗng = đăng ngay. */}
      <input type="hidden" name="scheduled_at" value={schedule} />
      <input className="note" name="note" placeholder="Ghi chú (không bắt buộc)" aria-label="Ghi chú" />

      <span className="schedule-lbl" title="Để trống = đăng ngay khi bấm Duyệt. Chọn ngày + giờ = Facebook tự đăng đúng giờ hẹn.">
        <span aria-hidden="true">⏰</span>
        <select value={dayKey} onChange={(e) => setDayKey(e.target.value)} aria-label="Ngày đăng">
          <option value="">Đăng ngay</option>
          {dayOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          <option value="custom">Ngày khác...</option>
        </select>
        {dayKey === 'custom' ? (
          <input type="date" value={customDay} min={ymd(new Date())} onChange={(e) => setCustomDay(e.target.value)} aria-label="Chọn ngày" />
        ) : null}
        {dayKey ? (
          <>
            <select value={timeKey} onChange={(e) => setTimeKey(e.target.value)} aria-label="Giờ đăng">
              {TIME_PRESETS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              <option value="custom">Giờ khác...</option>
            </select>
            {timeKey === 'custom' ? (
              <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} aria-label="Chọn giờ" />
            ) : null}
          </>
        ) : null}
        {preview ? <span className="schedule-preview">→ {preview}</span> : null}
      </span>

      <button className="btn ok" name="action" value="approve" disabled={busy !== null}>
        {busy === 'approve' ? (schedule ? 'Đang hẹn...' : 'Đang duyệt...') : (schedule ? 'Duyệt + Hẹn giờ' : 'Duyệt')}
      </button>
      <button className="btn no" name="action" value="reject" disabled={busy !== null}>
        {busy === 'reject' ? 'Đang từ chối...' : 'Từ chối'}
      </button>
    </form>
  );
}
