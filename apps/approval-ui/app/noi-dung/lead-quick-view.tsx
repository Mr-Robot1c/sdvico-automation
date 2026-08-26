'use client';

// Tile "Người hỏi mua hôm nay" ở Tổng quan — user 26/8: "trong trang tổng quan, khi bấm khách
// hàng thì nó hiện Ở TRANG TỔNG QUAN LUÔN chứ không phải bay ra trang khác". Modal xem nhanh
// hiện danh sách lead hôm nay (nguồn + người + hỏi gì + link mở bài). Nút "Xem đầy đủ →" mở
// /khach-hang cho ai muốn quản lý trạng thái + forward Zalo (chức năng nặng, không nhét vào
// modal). Query lead full trong tong-quan-section.tsx rồi truyền props xuống đây.
//
// Pattern copy từ [[plan-quick-view.tsx]] — dialog HTML5 native, showModal/close.

import { useRef } from 'react';
import Link from 'next/link';

export type QuickLead = {
  id: string;
  source: string;
  fbUserName: string | null;
  fbProfileUrl: string | null;
  message: string;
  createdAt: string;
  contentTitle: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  facebook_comment: '💬 Cmt FB',
  facebook_message: '📩 Tin nhắn FB',
  manual: '✍️ Nhập tay',
};

function fmtHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23'
  }).formatToParts(d);
  return `${p.find((x) => x.type === 'hour')?.value}:${p.find((x) => x.type === 'minute')?.value}`;
}

export default function LeadQuickView({ leads, count }: { leads: QuickLead[]; count: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="board-stat"
        style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)', font: 'inherit', color: 'inherit' }}
        onClick={() => dialogRef.current?.showModal()}
        title="Bấm xem danh sách người hỏi mua hôm nay"
      >
        <div className="stat-lbl">Người hỏi mua hôm nay</div>
        <div className="stat-num">{count.toLocaleString('vi-VN')}</div>
        <div className="sub" style={{ fontSize: '.76rem', marginTop: 2 }}>bấm xem chi tiết</div>
      </button>

      <dialog ref={dialogRef} className="plan-quick-dialog">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: '1.05rem' }}>👥 Người hỏi mua hôm nay ({count.toLocaleString('vi-VN')})</b>
          <button type="button" className="btn ghost sm" onClick={() => dialogRef.current?.close()}>✕ Đóng</button>
        </div>

        {leads.length === 0 ? (
          <div className="empty" style={{ padding: '20px 8px' }}>
            <div className="empty-icon" aria-hidden="true">👥</div>
            <p style={{ margin: 0 }}>Chưa có ai hỏi mua hôm nay.</p>
            <p className="sub" style={{ margin: '4px 0 0' }}>Webhook Facebook bắt comment hỏi mua tự động dưới bài đăng.</p>
          </div>
        ) : (
          <div className="tablewrap" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="datatable" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Lúc</th>
                  <th style={{ width: 90 }}>Nguồn</th>
                  <th style={{ width: 140 }}>Người</th>
                  <th>Hỏi gì</th>
                  <th style={{ width: 160 }}>Bài</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtHm(l.createdAt)}</td>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{SOURCE_LABEL[l.source] || l.source}</td>
                    <td>
                      {l.fbUserName || <span className="muted">(chưa lấy được tên)</span>}
                      {l.fbProfileUrl ? (
                        <div style={{ marginTop: 2 }}>
                          <a className="src" href={l.fbProfileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '.75rem' }}>↗ Mở</a>
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 320 }}>{l.message}</td>
                    <td className="sub" style={{ fontSize: '.8rem' }}>{l.contentTitle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/khach-hang" className="btn ok sm">Xem đầy đủ + quản lý trạng thái →</Link>
        </div>
      </dialog>
    </>
  );
}
