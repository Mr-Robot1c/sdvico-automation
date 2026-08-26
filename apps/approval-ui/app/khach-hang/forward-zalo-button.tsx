'use client';
import { useEffect, useRef, useState } from 'react';

// Nút "📱 Chuyển NV" ở /khach-hang — user 25/8: "gửi thông tin đó cho zalo nhân viên
// kinh doanh". Zalo OA chưa xác thực nên KHÔNG tự động gửi được — cách thay thế: copy
// nội dung lead vào clipboard + mở tab zalo.me/{phone-nv}, NV tự paste vào chat cá nhân.
//
// UI (revised 25/8, user: "sửa lại UI nha"):
// - 0 NV: chip mờ, hover chỉ tôi tới khối config
// - 1 NV: nút thẳng "📱 → <tên>" click 1 phát chuyển ngay, không dropdown
// - ≥2 NV: nút mở dropdown chọn NV, tự đóng khi click ra ngoài
// - Fallback: name rỗng → hiển thị "NV chưa đặt tên" thay vì space trống nhìn hỏng
export default function ForwardZaloButton({
  leadSummary,
  salesPeople,
}: {
  leadSummary: string;
  salesPeople: Array<{ name: string; phone: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>('');
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Tự đóng khi click ra ngoài (UX chuẩn dropdown).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!salesPeople.length) {
    return (
      <span className="sub" title="Chưa cấu hình NV Zalo — mở khối 'NV kinh doanh nhận Zalo' bên trên để nhập">
        📱 Chưa có NV
      </span>
    );
  }

  const nameOf = (p: { name: string; phone: string }) => p.name?.trim() || 'NV chưa đặt tên';

  async function forwardTo(person: { name: string; phone: string }) {
    try {
      await navigator.clipboard.writeText(leadSummary);
      setStatus('✓ Đã copy, mở Zalo...');
    } catch {
      setStatus('⛔ Copy fail, bấm phải copy tay');
    }
    window.open(`https://zalo.me/${person.phone}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => { setOpen(false); setStatus(''); }, 3500);
  }

  // LUON dung dropdown ke ca 1 NV (user 26/8: "van chua thay dropdown"). Truoc do co
  // special case 1 NV click thang khong dropdown — nhung user muon nhat quan UX, va khi
  // them NV sau khong phai nho doi cach bam.
  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ whiteSpace: 'nowrap' }}
      >
        📱 Chuyển NV ▾
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
            padding: 6, minWidth: 200, boxShadow: '0 6px 20px rgba(15,23,42,.18)',
          }}
        >
          <div className="sub" style={{ fontSize: '.72rem', padding: '4px 8px 6px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            Chọn NV nhận Zalo:
          </div>
          {salesPeople.map((p) => (
            <button
              key={p.phone}
              type="button"
              onClick={() => forwardTo(p)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
                color: 'var(--ink)', font: 'inherit', fontSize: '.88rem',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontWeight: 600 }}>{nameOf(p)}</div>
              <div className="sub" style={{ fontSize: '.72rem' }}>{p.phone}</div>
            </button>
          ))}
          {status ? (
            <div className="sub" style={{ fontSize: '.72rem', padding: '6px 8px 2px', borderTop: '1px solid var(--line)', marginTop: 4 }}>
              {status}
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
