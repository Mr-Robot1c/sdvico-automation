'use client';
import { useRef } from 'react';
import Link from 'next/link';

// Tile "Kế hoạch đang áp" ở Tổng quan — user 26/8: "chỗ này hiện kế hoạch của NGÀY HÔM ĐÓ".
// Đọc daily_schedule[today] từ bản live plan (query o tong-quan-section.tsx), truyền vào
// đây làm todayPlan. Modal xem nhanh hiện chi tiết hôm nay: hướng bán A+B, content, nhóm.
type TodayPlan = {
  date?: string;
  dow?: string;
  direction?: { title?: string; product?: string; variant?: 'A' | 'B' | 'AB'; done?: boolean } | null;
  sales?: Array<{ product: string; count: number }>;
  contentKind?: string;
  contentKindLabel?: string;
  contentPurpose?: string;
  contentStructure?: string;
  groups?: string[];
} | null;

function fmtDateVN(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function PlanQuickView({ todayPlan }: { todayPlan: TodayPlan }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (!todayPlan) {
    return (
      <div className="board-stat" style={{ opacity: 0.6 }}>
        <div className="stat-lbl">Kế hoạch hôm nay</div>
        <div className="stat-num" style={{ fontSize: '1.05rem' }}>—</div>
        <div className="sub" style={{ fontSize: '.76rem', marginTop: 2 }}>Chưa có lịch</div>
      </div>
    );
  }

  const dayLabel = todayPlan.dow && todayPlan.date
    ? `${todayPlan.dow.replace('Chủ nhật', 'CN').replace('Thứ ', 'T')} ${fmtDateVN(todayPlan.date).slice(0, 5)}`
    : '';
  const dirTitle = todayPlan.direction?.title || (todayPlan.sales?.length ? todayPlan.sales.map((s) => s.product).join(' + ') : '—');
  const dirDone = !!todayPlan.direction?.done;

  return (
    <>
      <button
        type="button"
        className="board-stat"
        style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)', font: 'inherit', color: 'inherit' }}
        onClick={() => dialogRef.current?.showModal()}
      >
        <div className="stat-lbl">Kế hoạch hôm nay · {dayLabel}</div>
        <div className="stat-num" style={{ fontSize: '.95rem', lineHeight: 1.3, marginTop: 4 }}>
          {dirTitle}
          {dirDone ? <span className="badge tone-ok" style={{ marginLeft: 6, fontSize: '.7rem' }}>✓ đã sinh</span> : null}
        </div>
        <div className="sub" style={{ fontSize: '.76rem', marginTop: 2 }}>bấm xem chi tiết</div>
      </button>

      <dialog ref={dialogRef} className="plan-quick-dialog">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: '1.05rem' }}>📋 Kế hoạch {dayLabel}</b>
          <button type="button" className="btn ghost sm" onClick={() => dialogRef.current?.close()}>✕ Đóng</button>
        </div>

        <table className="datatable" style={{ margin: 0 }}>
          <tbody>
            <tr>
              <td style={{ whiteSpace: 'nowrap', width: 130 }}><b>🕗 8h — Bài bán 1</b><div className="sub">theo hướng đi</div></td>
              <td>
                <b>{dirTitle}</b>
                {todayPlan.direction?.product ? <div className="sub">{todayPlan.direction.product}</div> : null}
                {dirDone ? <div className="sub" style={{ color: 'var(--ok, #16a34a)' }}>✓ đã sinh</div> : null}
              </td>
            </tr>
            <tr>
              <td style={{ whiteSpace: 'nowrap' }}><b>🕐 14h — Bài bán 2</b><div className="sub">hướng đi kế tiếp</div></td>
              <td>Cùng hướng, xoáy insight khác để so bản nào bà con thích hơn.</td>
            </tr>
            <tr>
              <td style={{ whiteSpace: 'nowrap' }}><b>🕐 14h — Content</b><div className="sub">{todayPlan.contentKindLabel || 'Content'}</div></td>
              <td>
                {todayPlan.contentPurpose ? <>Mục đích: <b>{todayPlan.contentPurpose}</b></> : <span className="sub">(theo lịch tuần)</span>}
                {todayPlan.contentStructure ? <div className="sub">Cấu trúc: {todayPlan.contentStructure}</div> : null}
              </td>
            </tr>
            {todayPlan.groups && todayPlan.groups.length ? (
              <tr>
                <td style={{ whiteSpace: 'nowrap' }}><b>📣 Nhóm</b><div className="sub">chia sẻ tay</div></td>
                <td>{todayPlan.groups.join(', ')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <Link href="/ke-hoach" className="btn ok sm">Mở kế hoạch tuần đầy đủ →</Link>
        </div>
      </dialog>
    </>
  );
}
