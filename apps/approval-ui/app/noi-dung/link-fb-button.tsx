'use client';

// 28/8 (user): nut "Ghep FB chinh" — dan link bai da dang TAY tren Page SDVICOVN vao bai
// nay; chip Facebook tren card se uu tien mo link do. Popover nho: input + Luu / Bo link.
// Pattern portal + fixed nhu link-tiktok-button (mau dung CSS var that cho dark mode).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { linkFacebookRealUrl } from '../actions';

export default function LinkFbButton({ contentId, linkedUrl }: { contentId: string; linkedUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = 360;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const top = Math.min(r.bottom + 6, window.innerHeight - 180);
      setPos({ top, left });
      setMsg('');
    }
    setOpen((o) => !o);
  };

  const save = async (url: string) => {
    setPending(true);
    setMsg('');
    const fd = new FormData();
    fd.set('content_id', contentId);
    fd.set('fb_url', url);
    const r = await linkFacebookRealUrl(fd);
    setPending(false);
    setMsg(r.msg);
    if (r.ok) setTimeout(() => setOpen(false), 700);
  };

  const pop = open && pos ? (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Ghép link bài Page chính"
      style={{
        position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 360,
        background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
        padding: 12, boxShadow: '0 14px 42px rgba(0,0,0,.28)', color: 'var(--ink)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>
        Dán link bài đã đăng tay trên <b>facebook.com/SDVICOVN</b> — chip Facebook của bài sẽ mở link này.
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); save(inputRef.current?.value.trim() || ''); }}
        style={{ display: 'flex', gap: 6 }}
      >
        <input
          ref={inputRef}
          type="url"
          defaultValue={linkedUrl || ''}
          placeholder="https://www.facebook.com/SDVICOVN/posts/..."
          className="note"
          style={{ flex: 1, minWidth: 0, maxWidth: 'none' }}
          disabled={pending}
        />
        <button type="submit" className="btn ok sm" disabled={pending}>Lưu</button>
      </form>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        {linkedUrl ? (
          <button type="button" className="btn ghost sm" onClick={() => save('')} disabled={pending}>🔗❌ Bỏ link</button>
        ) : <span />}
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Đóng</button>
      </div>
      {msg ? <div className="sub" style={{ marginTop: 8, fontSize: 12, padding: 6, background: 'var(--surface-2)', borderRadius: 6 }}>{msg}</div> : null}
    </div>
  ) : null;

  return (
    <span style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        className="btn ghost sm"
        onClick={toggle}
        title={linkedUrl ? 'Đã ghép link bài trên Page chính SDVICO VN — bấm để đổi/bỏ' : 'Dán link bài đã đăng tay trên Page chính SDVICO VN'}
        style={linkedUrl ? { color: 'var(--ok)' } : undefined}
      >
        {linkedUrl ? '📘✓ Đã ghép FB chính' : '📘 Ghép FB chính'}
      </button>
      {mounted && pop ? createPortal(pop, document.body) : null}
    </span>
  );
}
