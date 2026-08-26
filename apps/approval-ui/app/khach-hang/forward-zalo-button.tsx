'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Nút "📱 Chuyển NV" ở /khach-hang — user 25/8: "gửi thông tin đó cho zalo nhân viên
// kinh doanh". Zalo OA chưa xác thực nên KHÔNG tự động gửi được — cách thay thế: copy
// nội dung lead vào clipboard + mở tab zalo.me/{phone-nv}, NV tự paste vào chat cá nhân.
//
// UI:
// - 0 NV: chip mờ "📱 Chưa có NV"
// - ≥1 NV: LUÔN dropdown (user 26/8 chốt: nhất quán, khi thêm NV sau khỏi phải đổi cách bấm)
// - Fallback: name rỗng → "NV chưa đặt tên" thay vì space trống
//
// PORTAL FIX (26/8 chiều): dropdown trước dùng position:absolute trong <td>, bị clip vì
// .tablewrap có `overflow-x: auto` — CSS spec ép overflow-y AUTO theo → menu bị cắt cụt,
// user chỉ thấy header "Chọn NV nhận Zalo" mà không thấy tên NV. Fix bằng createPortal
// render menu vào document.body + position:fixed tính top/left theo getBoundingClientRect
// của button. Bypass mọi overflow parent, luôn hiện đủ.
export default function ForwardZaloButton({
  leadSummary,
  salesPeople,
}: {
  leadSummary: string;
  salesPeople: Array<{ name: string; phone: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // createPortal cần document.body — chỉ có sau khi mount ở client (SSR không có).
  useEffect(() => { setMounted(true); }, []);

  // Tính position menu theo button mỗi khi mở, hoặc khi window resize/scroll.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const compute = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  // Tự đóng khi click ra ngoài button VÀ menu (menu ở portal nên phải check cả 2 ref).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const menu = open && pos ? (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000,
        background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
        padding: 6, minWidth: 220, boxShadow: '0 8px 24px rgba(15,23,42,.22)',
        color: 'var(--ink)',
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
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ whiteSpace: 'nowrap' }}
      >
        📱 Chuyển NV ▾
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  );
}
