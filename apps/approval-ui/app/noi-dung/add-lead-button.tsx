'use client';
// Nút "+💬 Ghi Zalo/inbox" trên card bài — Playbook 26/8 item 1: đo Zalo thay view.
// Bấm mở popover form nhỏ, nhập ngắn (kênh + tên + SDT + tin nhắn) → server action
// addLeadManual với content_id để BOSS xếp hạng bài theo lead thay vì chỉ engagement.
//
// Không dùng modal lớn — details/summary HTML thuần cho gọn nhất, portal-free.

import { useState, useRef } from 'react';
import { addLeadManual } from '../actions';

export default function AddLeadButton({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (fd: FormData) => {
    if (pending) return;
    setPending(true);
    try {
      await addLeadManual(fd);
      setDone(true);
      formRef.current?.reset();
      setTimeout(() => { setDone(false); setOpen(false); }, 1200);
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen((v) => !v)}
        title="Ghi 1 khách hỏi mua từ bài này (Zalo, inbox, gọi, gặp mặt) — BOSS sẽ đưa số Zalo vào xếp hạng sản phẩm tuần"
      >
        +💬 Ghi Zalo/inbox
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
            background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8,
            padding: 12, minWidth: 260, boxShadow: '0 4px 16px rgba(0,0,0,.15)',
          }}
        >
          <form ref={formRef} action={submit} style={{ display: 'grid', gap: 6 }}>
            <input type="hidden" name="content_id" value={contentId} />
            <label className="sub" style={{ fontSize: '.8rem' }}>Kênh khách hỏi mua</label>
            <select name="channel" defaultValue="zalo" className="input" style={{ padding: '4px 6px' }}>
              <option value="zalo">Zalo</option>
              <option value="inbox">Facebook Inbox</option>
              <option value="call">Gọi điện</option>
              <option value="meet">Gặp mặt</option>
            </select>
            <label className="sub" style={{ fontSize: '.8rem' }}>Tên khách (tùy)</label>
            <input name="name" placeholder="VD: Anh Ba, chú Bảy..." className="input" style={{ padding: '4px 6px' }} />
            <label className="sub" style={{ fontSize: '.8rem' }}>SĐT / Zalo (tùy)</label>
            <input name="contact" placeholder="VD: 0939..." className="input" style={{ padding: '4px 6px' }} />
            <label className="sub" style={{ fontSize: '.8rem' }}>Ghi chú (khách hỏi gì)</label>
            <input name="message" placeholder="VD: hỏi giá SEA-40, cần lắp Vũng Tàu" className="input" style={{ padding: '4px 6px' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button type="submit" className="btn ok sm" disabled={pending}>
                {pending ? 'Đang ghi...' : done ? '✓ Đã ghi' : 'Ghi lead'}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Đóng</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
