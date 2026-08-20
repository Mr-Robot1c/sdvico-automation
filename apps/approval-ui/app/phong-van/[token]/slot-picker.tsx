'use client';

import { useState } from 'react';
import { chooseInterviewSlot, proposeInterviewSlot } from '../../actions';

export default function SlotPicker({ token, slots }: { token: string; slots: string[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showPropose, setShowPropose] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {slots.map((s, i) => (
        <form
          key={i}
          action={chooseInterviewSlot}
          onSubmit={() => setBusy(s)}
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

      {/* Đề xuất giờ khác — hiện khi ứng viên không sắp xếp được 3 khung trên */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #dbe5f1' }}>
        {!showPropose ? (
          <button
            type="button"
            onClick={() => setShowPropose(true)}
            disabled={busy !== null}
            style={{
              background: 'none', border: 'none', color: '#0b4da2', cursor: 'pointer',
              fontSize: 15, textDecoration: 'underline', padding: 4,
            }}
          >
            Không khung nào phù hợp? Đề xuất giờ khác
          </button>
        ) : (
          <form
            action={proposeInterviewSlot}
            onSubmit={(e) => {
              const form = e.currentTarget as HTMLFormElement;
              const proposal = (form.elements.namedItem('proposal') as HTMLInputElement)?.value?.trim();
              if (!proposal) { e.preventDefault(); return; }
              setBusy('propose');
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <input type="hidden" name="token" value={token} />
            <label style={{ fontSize: 14, color: '#33475b', fontWeight: 600 }}>
              Ngày giờ bạn có thể sắp xếp
              <input
                type="text"
                name="proposal"
                required
                maxLength={500}
                placeholder="Ví dụ: Thứ Ba 26/8, 15:00 hoặc chiều 27/8"
                style={{
                  width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #c5d0dd', fontSize: 15, fontFamily: 'inherit',
                }}
              />
            </label>
            <label style={{ fontSize: 14, color: '#33475b', fontWeight: 600 }}>
              Ghi chú (không bắt buộc)
              <textarea
                name="note"
                maxLength={1000}
                rows={3}
                placeholder="Ví dụ: sáng cuối tuần cũng được, ưu tiên online..."
                style={{
                  width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #c5d0dd', fontSize: 15, fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={busy !== null}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none',
                  background: busy === 'propose' ? '#5b6b7f' : '#0b4da2', color: '#fff',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {busy === 'propose' ? 'Đang gửi...' : 'Gửi đề xuất'}
              </button>
              <button
                type="button"
                onClick={() => setShowPropose(false)}
                disabled={busy !== null}
                style={{
                  padding: '12px 16px', borderRadius: 10, border: '1px solid #c5d0dd',
                  background: '#fff', color: '#33475b', fontSize: 15, cursor: 'pointer',
                }}
              >
                Hủy
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
