'use client';
// Thanh action nhỏ trên đầu kanban khách hàng: nút dọn tin trùng nội dung + link xem Rác.
import { useState } from 'react';
import Link from 'next/link';
import { dedupLeadsByContent } from '../actions';

export default function DedupLeadsBar({ racCount }: { racCount: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    if (busy) return;
    if (!window.confirm('Dọn tin nhắn trùng nội dung (cùng khách + cùng câu trong 5 phút, giữ tin đầu, xoá tin sau)?')) return;
    setBusy(true);
    setMsg('Đang dọn...');
    try {
      const r = await dedupLeadsByContent();
      setMsg(r.msg);
      setTimeout(() => setMsg(''), 5000);
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
      <button type="button" className="btn ghost sm" onClick={run} disabled={busy} style={{ color: 'var(--tone-warn, #d97706)' }}>
        {busy ? '⏳ Đang dọn...' : '🧹 Dọn tin trùng nội dung'}
      </button>
      {racCount > 0 ? (
        <Link href="/khach-hang?status=spam" className="btn ghost sm" style={{ color: 'var(--muted)' }}>
          ⛔ Xem Rác ({racCount})
        </Link>
      ) : null}
      {msg ? <span className="sub" style={{ fontSize: '.85rem' }}>{msg}</span> : null}
    </div>
  );
}
