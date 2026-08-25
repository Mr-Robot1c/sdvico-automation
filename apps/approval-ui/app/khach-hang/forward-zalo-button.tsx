'use client';
import { useState } from 'react';

// Nút "📱 Chuyển NV" ở /khach-hang — user 25/8: "gửi thông tin đó cho zalo nhân viên
// kinh doanh". Zalo OA chưa xác thực nên KHÔNG tự động gửi được — cách thay thế: copy
// nội dung lead vào clipboard + mở tab zalo.me/{phone-nv}, NV tự paste vào chat cá nhân.
export default function ForwardZaloButton({
  leadSummary,
  salesPeople,
}: {
  leadSummary: string;
  salesPeople: Array<{ name: string; phone: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>('');

  if (!salesPeople.length) {
    return (
      <span className="sub" title="Chưa cấu hình danh sách NV Zalo — mở khối 'NV kinh doanh nhận Zalo' bên trên nhập vào">📱 —</span>
    );
  }

  async function handleForward(person: { name: string; phone: string }) {
    try {
      await navigator.clipboard.writeText(leadSummary);
      setStatus(`✓ Đã copy, mở Zalo...`);
    } catch {
      setStatus('⛔ Copy fail, tự copy tay');
    }
    // Mở tab mới tới zalo.me — Zalo tự nhận diện số phone, mở chat cá nhân với NV đó.
    window.open(`https://zalo.me/${person.phone}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => { setOpen(false); setStatus(''); }, 3000);
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="btn ghost sm" onClick={() => setOpen(!open)}>📱 Chuyển NV</button>
      {open ? (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 10,
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8,
          padding: 8, minWidth: 180, boxShadow: '0 4px 12px rgba(15,23,42,.14)',
        }}>
          <div className="sub" style={{ fontSize: '.75rem', marginBottom: 6 }}>Chọn NV nhận:</div>
          {salesPeople.map((p) => (
            <button
              key={p.phone} type="button"
              className="btn sm"
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, background: 'transparent', border: '1px solid var(--line)' }}
              onClick={() => handleForward(p)}
            >
              {p.name} <span className="sub" style={{ fontSize: '.75rem' }}>({p.phone})</span>
            </button>
          ))}
          {status ? <div className="sub" style={{ fontSize: '.75rem', marginTop: 4 }}>{status}</div> : null}
        </div>
      ) : null}
    </span>
  );
}
