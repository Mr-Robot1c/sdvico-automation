'use client';

import { useState } from 'react';
import { chooseInterviewSlot } from '../../actions';

export default function SlotPicker({ token, slots }: { token: string; slots: string[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {slots.map((s, i) => (
        <form
          key={i}
          action={chooseInterviewSlot}
          onSubmit={(e) => {
            if (!window.confirm(`Xác nhận chọn khung giờ:\n\n${s}\n\nBạn có chắc không?`)) {
              e.preventDefault();
              return;
            }
            setBusy(s);
          }}
        >
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="slot" value={s} />
          <button
            type="submit"
            disabled={busy !== null}
            style={{
              width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 12,
              border: '2px solid #0b4da2', background: busy === s ? '#0b4da2' : '#fff',
              color: busy === s ? '#fff' : '#0b4da2', fontSize: 17, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {busy === s ? 'Đang lưu...' : s}
          </button>
        </form>
      ))}
    </div>
  );
}
