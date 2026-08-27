'use client';

// Tile "Người hỏi mua hôm nay" ở Tổng quan. User 27/8: "giữ lại trong tổng quan luôn chứ
// không phải bấm vô là nhảy sang trang khác" — nghĩa là modal phải có ĐỦ control quản lý
// (đổi status + ghi chú + Chuyển NV + Xoá), người dùng không cần qua /khach-hang cho case
// hằng ngày. Trang /khach-hang giờ chỉ dùng khi cần các setting rộng (thêm khách nhập tay,
// list NV kinh doanh).

import { useRef } from 'react';
import Link from 'next/link';
import LeadStatusSelect from '../khach-hang/lead-status-select';
import ForwardZaloButton from '../khach-hang/forward-zalo-button';
import DeleteLeadButton from '../khach-hang/delete-lead-button';
import { updateLeadStatus } from '../actions';

export type QuickLead = {
  id: string;
  source: string;
  fbUserName: string | null;
  fbProfileUrl: string | null;
  message: string;
  createdAt: string;
  contentId: string | null;
  contentTitle: string | null;
  status: string;
  note: string;
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

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).format(d);
}

export default function LeadQuickView({
  leads,
  count,
  salesPeople,
}: {
  leads: QuickLead[];
  count: number;
  salesPeople: Array<{ name: string; phone: string }>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="board-stat"
        style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)', font: 'inherit', color: 'inherit' }}
        onClick={() => dialogRef.current?.showModal()}
        title="Bấm xem + quản lý danh sách người hỏi mua hôm nay"
      >
        <div className="stat-lbl">Người hỏi mua hôm nay</div>
        <div className="stat-num">{count.toLocaleString('vi-VN')}</div>
        <div className="sub" style={{ fontSize: '.76rem', marginTop: 2 }}>bấm mở & quản lý</div>
      </button>

      <dialog ref={dialogRef} className="plan-quick-dialog" style={{ maxWidth: '95vw', width: 1100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div>
            <b style={{ fontSize: '1.05rem' }}>👥 Người hỏi mua hôm nay ({count.toLocaleString('vi-VN')})</b>
            <div className="sub" style={{ fontSize: '.8rem', marginTop: 2 }}>
              Đổi trạng thái, ghi chú, chuyển NV, xoá — tất cả ở đây. Không cần qua trang khác.
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => dialogRef.current?.close()}>✕ Đóng</button>
        </div>

        {leads.length === 0 ? (
          <div className="empty" style={{ padding: '20px 8px' }}>
            <div className="empty-icon" aria-hidden="true">👥</div>
            <p style={{ margin: 0 }}>Chưa có ai hỏi mua hôm nay.</p>
            <p className="sub" style={{ margin: '4px 0 0' }}>Webhook Facebook bắt comment hỏi mua tự động dưới bài đăng.</p>
          </div>
        ) : (
          <div className="tablewrap" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="datatable" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Lúc</th>
                  <th style={{ width: 90 }}>Nguồn</th>
                  <th style={{ width: 140 }}>Người</th>
                  <th>Hỏi gì</th>
                  <th style={{ width: 140 }}>Bài</th>
                  <th style={{ width: 130 }}>Trạng thái</th>
                  <th style={{ width: 110 }}>Chuyển NV</th>
                  <th style={{ width: 70 }}></th>
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
                    <td style={{ maxWidth: 260 }}>{l.message}</td>
                    <td className="sub" style={{ fontSize: '.8rem' }}>{l.contentTitle || '—'}</td>
                    <td>
                      <LeadStatusSelect leadId={l.id} status={l.status} note={l.note} action={updateLeadStatus} />
                    </td>
                    <td>
                      <ForwardZaloButton
                        salesPeople={salesPeople}
                        leadSummary={[
                          `🔔 Lead mới từ SDVICO (${fmtDateTime(l.createdAt)})`,
                          `Nguồn: ${SOURCE_LABEL[l.source] || l.source}`,
                          `Người: ${l.fbUserName || '(chưa lấy được tên)'}`,
                          `Hỏi: ${l.message}`,
                          l.contentTitle ? `Bài liên quan: ${l.contentTitle}` : '',
                          l.fbProfileUrl ? `Link: ${l.fbProfileUrl}` : '',
                          `Mở dashboard: https://sdvico-mktit.vercel.app/khach-hang`,
                        ].filter(Boolean).join('\n')}
                      />
                    </td>
                    <td>
                      <DeleteLeadButton
                        leadId={l.id}
                        leadSummary={`${SOURCE_LABEL[l.source] || l.source} · ${l.fbUserName || '(chưa lấy được tên)'} · "${(l.message || '').slice(0, 80)}"`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/khach-hang" className="btn ghost sm" title="Thêm khách tay + cấu hình NV kinh doanh nhận Zalo">⚙️ Cấu hình NV / thêm khách tay</Link>
          <span className="sub" style={{ fontSize: '.75rem' }}>Danh sách trên đây tự động lọc bỏ lead "Rác".</span>
        </div>
      </dialog>
    </>
  );
}
