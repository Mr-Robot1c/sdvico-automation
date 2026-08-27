'use client';
// Nút "+💬 Ghi Zalo/inbox" trên card bài — Playbook 26/8 item 1: đo Zalo thay view.
// Bấm mở popover form nhỏ, nhập ngắn (kênh + tên + SDT + tin nhắn) → server action
// addLeadManual với content_id để BOSS xếp hạng bài theo lead thay vì chỉ engagement.
//
// User 27/8: fix popover cùng pattern ShareGroups — dùng createPortal + position:fixed để
// không bị table overflow cắt hoặc bị card khác đè lên.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addLeadManual } from '../actions';

export default function AddLeadButton({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const popW = 280;
      // Ưu tiên căn trái theo button; nếu tràn phải màn hình thì kéo về mép phải.
      let left = Math.round(r.left);
      if (left + popW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popW - 8);
      setPos({ top: Math.round(r.bottom + 6), left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPop = popRef.current && popRef.current.contains(target);
      const inBtn = btnRef.current && btnRef.current.contains(target);
      if (!inPop && !inBtn) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

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

  const popContent = open && pos ? (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Ghi khách hỏi mua"
      style={{
        position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
        background: 'var(--bg-1, #ffffff)', border: '1px solid var(--line, #d1d5db)', borderRadius: 10,
        padding: 12, width: 280, boxShadow: '0 14px 42px rgba(0,0,0,.28)',
        color: 'var(--ink, #111827)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form ref={formRef} action={submit} style={{ display: 'grid', gap: 6 }}>
        <input type="hidden" name="content_id" value={contentId} />
        <label className="sub" style={{ fontSize: '.8rem', fontWeight: 600 }}>Kênh khách hỏi mua</label>
        <select name="channel" defaultValue="zalo" className="input" style={{ padding: '4px 6px' }}>
          <option value="zalo">Zalo</option>
          <option value="inbox">Facebook Inbox</option>
          <option value="call">Gọi điện</option>
          <option value="meet">Gặp mặt</option>
        </select>
        <label className="sub" style={{ fontSize: '.8rem', fontWeight: 600 }}>Tên khách (tùy)</label>
        <input name="name" placeholder="VD: Anh Ba, chú Bảy..." className="input" style={{ padding: '4px 6px' }} />
        <label className="sub" style={{ fontSize: '.8rem', fontWeight: 600 }}>SĐT / Zalo (tùy)</label>
        <input name="contact" placeholder="VD: 0939..." className="input" style={{ padding: '4px 6px' }} />
        <label className="sub" style={{ fontSize: '.8rem', fontWeight: 600 }}>Ghi chú (khách hỏi gì)</label>
        <input name="message" placeholder="VD: hỏi giá SEA-40, cần lắp Vũng Tàu" className="input" style={{ padding: '4px 6px' }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button type="submit" className="btn ok sm" disabled={pending}>
            {pending ? 'Đang ghi...' : done ? '✓ Đã ghi' : 'Ghi lead'}
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Đóng</button>
        </div>
      </form>
    </div>
  ) : null;

  return (
    <span style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen((v) => !v)}
        title="Ghi 1 khách hỏi mua từ bài này (Zalo, inbox, gọi, gặp mặt) — BOSS sẽ đưa số Zalo vào xếp hạng sản phẩm tuần"
      >
        +💬 Ghi Zalo/inbox
      </button>
      {mounted && popContent ? createPortal(popContent, document.body) : null}
    </span>
  );
}
