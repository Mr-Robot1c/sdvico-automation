'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { STEP_LABEL } from './lead-stepper';

// 2/10 (Đợt B1, Thanh gật theo audit mobile): bảng Khách hàng rộng 1.160px không hợp điện thoại.
// Cách dựng: server vẫn render NGUYÊN các ô của hàng như cũ (form, server action, id không đổi),
// LeadRow chỉ bọc <tr> và thêm 2 ô phụ NẰM CUỐI hàng (không làm lệch nth-child của bảng desktop):
//   - ô tóm tắt (.lead-sum-cell): chỉ hiện dưới 768px, thành thẻ gọn, bấm là mở ngăn chi tiết;
//   - ô đầu ngăn (.lead-drawer-head): tên khách + nút Đóng, chỉ hiện khi ngăn đang mở.
// Khi mở, chính <tr> đó chuyển thành ngăn trượt từ phải bằng CSS (position fixed), nên không có
// bản sao DOM nào. Từ 768px trở lên cả hai ô phụ và lớp mờ bị ẩn, bảng giữ nguyên như cũ.

export default function LeadRow({
  name, icon, sourceLabel, time, message, status, hasDraft, children,
}: {
  name: string; icon: string; sourceLabel: string; time: string; message: string;
  status: string; hasDraft: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Kéo cửa sổ rộng ra máy tính khi ngăn đang mở thì tự đóng, khỏi khóa cuộn trang.
    const onResize = () => { if (window.innerWidth >= 768) setOpen(false); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const opener = openRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prev;
      opener?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {open ? (
        <tr className="lead-backdrop-row" aria-hidden="true">
          <td onClick={close} />
        </tr>
      ) : null}
      <tr
        className={`lead-row${open ? ' lead-open' : ''}`}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? `Chi tiết khách ${name}` : undefined}
      >
        {children}
        <td className="lead-sum-cell">
          <button type="button" ref={openRef} className="lead-sum" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
            <span className="lead-sum-top">
              <span className="lead-sum-name"><span aria-hidden="true">{icon}</span> {name}</span>
              <span className="lead-sum-time">{time}</span>
            </span>
            <span className="lead-sum-msg">{message}</span>
            <span className="lead-sum-foot">
              <span className={`lead-step-badge ${status}`}>{STEP_LABEL[status] || status}</span>
              <span className="lead-sum-src">{sourceLabel}</span>
              {hasDraft ? <span className="lead-sum-draft">Có nháp chờ gửi</span> : null}
            </span>
          </button>
        </td>
        <td className="lead-drawer-head">
          <span className="lead-drawer-title">{name}</span>
          <button type="button" ref={closeRef} className="lead-drawer-close" onClick={close} aria-label="Đóng chi tiết khách">✕</button>
        </td>
      </tr>
    </>
  );
}

// Ô "Xoá": trên máy tính nút Xoá vẫn nằm thẳng trong ô như cũ (nút ⋯ bị ẩn). Dưới 768px nút Xoá
// bị giấu, bấm ⋯ mới hiện (CSS dùng aria-expanded của nút ⋯ để mở nút Xoá kề sau nó).
export function LeadMore({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <>
      <button type="button" className="lead-more-btn btn ghost" aria-expanded={on} onClick={() => setOn((v) => !v)} title="Thao tác khác">⋯ Khác</button>
      {children}
    </>
  );
}
