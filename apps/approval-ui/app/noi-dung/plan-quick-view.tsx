'use client';
import { useRef } from 'react';
import Link from 'next/link';

// Tile "Kế hoạch đang áp" ở Tổng quan — bấm PHÓNG RA modal xem nhanh tại chỗ, KHÔNG chuyển
// trang (user 24/8: "bấm kế hoạch đang áp thì phóng ra cái kế hoạch chứ đừng bắt t chuyển
// trang, load rất lâu"). Chi tiết đầy đủ (bảng sản phẩm, lịch tuần) vẫn ở /ke-hoach qua link
// trong modal, cho ai cần đào sâu.
export default function PlanQuickView({
  createdAtLabel,
  cadenceLabel,
  goal,
  suggestionsCount,
}: {
  createdAtLabel: string;
  cadenceLabel: string;
  goal: string;
  suggestionsCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="board-stat"
        style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)', font: 'inherit', color: 'inherit' }}
        onClick={() => dialogRef.current?.showModal()}
      >
        <div className="stat-lbl">Kế hoạch đang áp</div>
        <div className="stat-num" style={{ fontSize: '1.1rem' }}>{createdAtLabel || '—'}</div>
        <div className="sub" style={{ fontSize: '.76rem', marginTop: 2 }}>{cadenceLabel} · bấm xem nhanh</div>
      </button>

      <dialog ref={dialogRef} className="plan-quick-dialog">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <b style={{ fontSize: '1.05rem' }}>📋 Kế hoạch đang áp</b>
          <button type="button" className="btn ghost sm" onClick={() => dialogRef.current?.close()}>✕ Đóng</button>
        </div>
        <p className="sub" style={{ margin: '8px 0 4px' }}>Sinh {createdAtLabel || '—'} · {cadenceLabel} · {suggestionsCount} hướng đi</p>
        {goal ? (
          <p style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}><b>Mục tiêu:</b> {goal}</p>
        ) : (
          <p className="sub" style={{ margin: '10px 0 0' }}>Chưa đặt mục tiêu tuần.</p>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Link href="/ke-hoach" className="btn ok sm">Mở đầy đủ →</Link>
        </div>
      </dialog>
    </>
  );
}
