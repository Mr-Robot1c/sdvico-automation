'use client';

import { useState } from 'react';
import { bossSubmitDecision } from '../../actions';

type Slot = { date: string; time: string };

const DEFAULT_TIMES = ['09:00', '10:30', '14:00', '15:30'];

// Ngày mặc định = ngày mai (VN local).
function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function BossDecisionForm({ token }: { token: string }) {
  const [mode, setMode] = useState<'menu' | 'interview' | 'reject' | 'hold'>('menu');
  const [slots, setSlots] = useState<Slot[]>([{ date: tomorrowIso(), time: DEFAULT_TIMES[0] }]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const btnBase = {
    padding: '14px 18px', borderRadius: 12, border: '2px solid', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', flex: 1, minWidth: 160,
  } as const;

  if (mode === 'menu') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" onClick={() => setMode('interview')}
          style={{ ...btnBase, borderColor: '#0b4da2', background: '#fff', color: '#0b4da2' }}>
          Hẹn phỏng vấn
        </button>
        <button type="button" onClick={() => setMode('reject')}
          style={{ ...btnBase, borderColor: '#c0392b', background: '#fff', color: '#c0392b' }}>
          Không phù hợp
        </button>
        <button type="button" onClick={() => setMode('hold')}
          style={{ ...btnBase, borderColor: '#8a8a8a', background: '#fff', color: '#33475b' }}>
          Chờ thêm thông tin
        </button>
      </div>
    );
  }

  if (mode === 'interview') {
    const slotsPayload = slots
      .filter((s) => s.date && s.time)
      .map((s) => `${s.date}|${s.time}`)
      .join('\n');
    return (
      <form
        action={bossSubmitDecision}
        onSubmit={(e) => {
          if (slots.filter((s) => s.date && s.time).length === 0) {
            e.preventDefault();
            alert('Vui lòng chọn ít nhất 1 khung giờ.');
            return;
          }
          if (!window.confirm(`Xác nhận HẸN PHỎNG VẤN với ${slots.length} khung giờ?\n\nHR sẽ nhận thư mời trong hàng đợi để bấm gửi cho ứng viên. Link này sẽ được thu hồi.`)) {
            e.preventDefault();
            return;
          }
          setBusy(true);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="decision" value="interview" />
        <input type="hidden" name="slots" value={slotsPayload} />

        <div style={{ background: '#f0f7ff', border: '1px solid #cfe0f5', borderRadius: 8, padding: 12, fontSize: 14 }}>
          Chọn 1-3 khung giờ đề xuất. Ứng viên sẽ nhận thư mời và tự chọn 1 khung phù hợp (hoặc đề xuất giờ khác).
        </div>

        {slots.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 14, color: '#33475b', minWidth: 60 }}>Khung {i + 1}</label>
            <input
              type="date"
              value={s.date}
              min={tomorrowIso()}
              onChange={(e) => setSlots((prev) => prev.map((p, idx) => idx === i ? { ...p, date: e.target.value } : p))}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #c5d0dd', fontSize: 15 }}
            />
            <select
              value={s.time}
              onChange={(e) => setSlots((prev) => prev.map((p, idx) => idx === i ? { ...p, time: e.target.value } : p))}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #c5d0dd', fontSize: 15 }}
            >
              {DEFAULT_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {slots.length > 1 ? (
              <button type="button" onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14 }}>
                Xóa
              </button>
            ) : null}
          </div>
        ))}

        {slots.length < 3 ? (
          <button
            type="button"
            onClick={() => setSlots((prev) => [...prev, { date: tomorrowIso(), time: DEFAULT_TIMES[0] }])}
            style={{ background: 'none', border: '1px dashed #c5d0dd', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', color: '#0b4da2', fontSize: 14 }}
          >
            + Thêm khung giờ
          </button>
        ) : null}

        <label style={{ fontSize: 14, color: '#33475b', fontWeight: 600 }}>
          Ghi chú cho HR (không bắt buộc)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            name="note"
            placeholder="Ví dụ: mời phỏng vấn online, ưu tiên tuần sau..."
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #c5d0dd', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: busy ? '#5b6b7f' : '#0b4da2', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Đang gửi...' : 'Xác nhận hẹn phỏng vấn'}
          </button>
          <button type="button" onClick={() => setMode('menu')} disabled={busy}
            style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #c5d0dd', background: '#fff', color: '#33475b', fontSize: 15, cursor: 'pointer' }}>
            Hủy
          </button>
        </div>
      </form>
    );
  }

  // reject or hold — cùng form đơn giản với textarea note.
  const isReject = mode === 'reject';
  return (
    <form
      action={bossSubmitDecision}
      onSubmit={(e) => {
        if (!window.confirm(isReject
          ? 'Xác nhận đánh giá ứng viên này KHÔNG PHÙ HỢP?\n\nHR sẽ được thông báo. Link này sẽ được thu hồi.'
          : 'Xác nhận CHỜ THÊM THÔNG TIN?\n\nGhi chú sẽ chuyển cho HR. Link này sẽ được thu hồi.')) {
          e.preventDefault();
          return;
        }
        setBusy(true);
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decision" value={mode} />

      <label style={{ fontSize: 14, color: '#33475b', fontWeight: 600 }}>
        {isReject ? 'Lý do (không bắt buộc)' : 'Nội dung cần làm rõ thêm'}
        <textarea
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder={isReject ? 'Ví dụ: chưa đủ kinh nghiệm...' : 'Ví dụ: cần bổ sung chứng chỉ, hoặc trao đổi thêm về mức lương...'}
          style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #c5d0dd', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={busy}
          style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: busy ? '#5b6b7f' : (isReject ? '#c0392b' : '#33475b'), color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Đang gửi...' : (isReject ? 'Xác nhận không phù hợp' : 'Chuyển HR chờ thêm')}
        </button>
        <button type="button" onClick={() => setMode('menu')} disabled={busy}
          style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #c5d0dd', background: '#fff', color: '#33475b', fontSize: 15, cursor: 'pointer' }}>
          Hủy
        </button>
      </div>
    </form>
  );
}
