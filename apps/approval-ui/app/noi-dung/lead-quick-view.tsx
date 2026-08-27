'use client';

// Tile "Người hỏi mua" ở Tổng quan. User 27/8 muốn KHÔNG cần rời modal — nhét full CRM:
// tabs status (Tất cả/Mới/Đã liên hệ/Xong), form "Thêm khách tay", section NV Zalo,
// nút "Dọn tin trùng". Trang /khach-hang riêng vẫn giữ cho ai muốn URL riêng.

import { useMemo, useRef, useState } from 'react';
import LeadStatusSelect from '../khach-hang/lead-status-select';
import ForwardZaloButton from '../khach-hang/forward-zalo-button';
import DeleteLeadButton from '../khach-hang/delete-lead-button';
import SalesZaloEditor from '../khach-hang/sales-zalo-editor';
import { updateLeadStatus, addLeadManual, dedupLeadsByContent } from '../actions';

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

const STATUS_LABEL: Record<string, string> = {
  new: '🆕 Mới',
  contacted: '📞 Đã liên hệ',
  closed: '✅ Xong',
  spam: '⛔ Rác',
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).format(d);
}

type FilterKey = 'all' | 'new' | 'contacted' | 'closed';

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
  const [filter, setFilter] = useState<FilterKey>('all');
  const [msg, setMsg] = useState('');
  const [busyAdd, setBusyAdd] = useState(false);
  const [busyDedup, setBusyDedup] = useState(false);
  const addFormRef = useRef<HTMLFormElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSales, setShowSales] = useState(false);

  const counts = useMemo(() => {
    const c = { all: 0, new: 0, contacted: 0, closed: 0 };
    for (const l of leads) {
      c.all++;
      const s = l.status as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    if (filter === 'all') return leads;
    return leads.filter((l) => l.status === filter);
  }, [leads, filter]);

  const submitAdd = async (fd: FormData) => {
    if (busyAdd) return;
    setBusyAdd(true);
    setMsg('');
    try {
      await addLeadManual(fd);
      addFormRef.current?.reset();
      setMsg('✓ Đã thêm. Cuộn lên để xem.');
      setTimeout(() => setMsg(''), 3000);
    } finally {
      setBusyAdd(false);
    }
  };

  const runDedup = async () => {
    if (busyDedup) return;
    if (!window.confirm('Dọn tin nhắn trùng nội dung (cùng khách + cùng câu trong 5 phút, giữ tin đầu, xoá tin sau)?')) return;
    setBusyDedup(true);
    setMsg('Đang dọn...');
    try {
      const r = await dedupLeadsByContent();
      setMsg(r.msg);
      setTimeout(() => setMsg(''), 5000);
    } finally {
      setBusyDedup(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="board-stat"
        style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)', font: 'inherit', color: 'inherit' }}
        onClick={() => dialogRef.current?.showModal()}
        title="Bấm mở CRM khách hàng đầy đủ — không nhảy trang"
      >
        <div className="stat-lbl">Người hỏi mua hôm nay</div>
        <div className="stat-num">{count.toLocaleString('vi-VN')}</div>
        <div className="sub" style={{ fontSize: '.76rem', marginTop: 2 }}>bấm mở CRM ({leads.length} lead 30 ngày)</div>
      </button>

      <dialog ref={dialogRef} className="plan-quick-dialog" style={{ maxWidth: '96vw', width: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div>
            <b style={{ fontSize: '1.05rem' }}>👥 CRM khách hỏi mua ({leads.length.toLocaleString('vi-VN')} lead 30 ngày)</b>
            <div className="sub" style={{ fontSize: '.8rem', marginTop: 2 }}>
              Full quản lý ở đây — đổi trạng thái, ghi chú, chuyển NV, xoá, thêm khách tay, cấu hình NV. Không cần qua trang khác.
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => dialogRef.current?.close()}>✕ Đóng</button>
        </div>

        {/* Thanh action */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <button type="button" className="btn ghost sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? '➖ Ẩn form thêm khách' : '➕ Thêm khách tay'}
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setShowSales((v) => !v)}>
            {showSales ? '➖ Ẩn NV Zalo' : '📱 NV kinh doanh Zalo'} ({salesPeople.length})
          </button>
          <button type="button" className="btn ghost sm" onClick={runDedup} disabled={busyDedup} style={{ color: 'var(--tone-warn, #d97706)' }}>
            {busyDedup ? '⏳ Đang dọn...' : '🧹 Dọn tin trùng nội dung'}
          </button>
          {msg ? <span className="sub" style={{ fontSize: '.85rem' }}>{msg}</span> : null}
        </div>

        {/* Form thêm khách tay (collapsible) */}
        {showAdd ? (
          <div style={{ padding: 10, background: 'var(--bg-2, #f3f4f6)', borderRadius: 8, marginBottom: 10 }}>
            <form ref={addFormRef} action={submitAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input name="name" placeholder="Tên khách (VD: Anh Ba)" className="input" style={{ flex: '1 1 180px', padding: '4px 8px' }} />
              <input name="contact" placeholder="SĐT / Zalo (VD: 0939...)" className="input" style={{ flex: '1 1 180px', padding: '4px 8px' }} />
              <input name="message" placeholder="Hỏi gì (VD: hỏi giá SEA-40)" className="input" style={{ flex: '2 1 260px', padding: '4px 8px' }} />
              <select name="channel" defaultValue="zalo" className="input" style={{ padding: '4px 8px' }}>
                <option value="zalo">Zalo</option>
                <option value="inbox">Inbox FB</option>
                <option value="call">Gọi</option>
                <option value="meet">Gặp</option>
              </select>
              <button type="submit" className="btn ok sm" disabled={busyAdd}>{busyAdd ? 'Đang thêm...' : 'Thêm'}</button>
            </form>
          </div>
        ) : null}

        {/* Cấu hình NV Zalo (collapsible) */}
        {showSales ? (
          <div style={{ padding: 10, background: 'var(--bg-2, #f3f4f6)', borderRadius: 8, marginBottom: 10 }}>
            <p className="sub" style={{ margin: '0 0 6px', fontSize: '.8rem' }}>
              NV nhận Zalo forward — bấm "Chuyển NV" ở mỗi lead sẽ copy nội dung + mở tab zalo.me tới NV bạn chọn.
            </p>
            <SalesZaloEditor initial={salesPeople} />
          </div>
        ) : null}

        {/* Tabs status */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {(['all', 'new', 'contacted', 'closed'] as FilterKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`btn sm ${filter === k ? 'ok' : 'ghost'}`}
              onClick={() => setFilter(k)}
            >
              {k === 'all' ? `Tất cả (${counts.all})` : `${STATUS_LABEL[k]} (${counts[k]})`}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: '20px 8px' }}>
            <div className="empty-icon" aria-hidden="true">👥</div>
            <p style={{ margin: 0 }}>Chưa có lead nào trong nhóm này.</p>
          </div>
        ) : (
          <div className="tablewrap" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="datatable" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Lúc</th>
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
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.createdAt)}</td>
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
                          `Mở dashboard: https://sdvico-mktit.vercel.app`,
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
      </dialog>
    </>
  );
}
