'use client';
import { useState, useTransition } from 'react';
import { updateLeadStatus } from '../actions';

// 15/9 (Thanh, kế hoạch sửa web): sếp chê trang khách hàng rối, "phải là 1 flow chặt chẽ".
// Một khách đi đúng MỘT đường: Mới -> Đã liên hệ -> Đã mua hoặc Không chốt (kèm lý do).
// Ô này chỉ hiện bước hiện tại + nút bước KẾ TIẾP, không còn select 6 trạng thái.
// Rác (spam) và Xong (cũ) nằm trong "⋯ khác" cho trường hợp ngoại lệ.

export const STEP_LABEL: Record<string, string> = {
  new: '🆕 Mới', contacted: '📞 Đã liên hệ', won: '💰 Đã mua', lost: '❌ Không chốt', closed: '✅ Xong', spam: '🚫 Rác',
};

export default function LeadStepper({ leadId, status, note, lostReason }: { leadId: string; status: string; note: string; lostReason: string }) {
  const [pending, start] = useTransition();
  const [cur, setCur] = useState(status);
  const [askLost, setAskLost] = useState(false);
  const [reason, setReason] = useState(lostReason || '');
  const [more, setMore] = useState(false);

  const go = (next: string, extra?: Record<string, string>) => {
    if (pending) return;
    const fd = new FormData();
    fd.set('lead_id', leadId); fd.set('status', next); fd.set('note', note || '');
    for (const [k, v] of Object.entries(extra || {})) fd.set(k, v);
    start(async () => { await updateLeadStatus(fd); setCur(next); setAskLost(false); setMore(false); });
  };

  return (
    <div className="lead-step">
      <span className={`lead-step-badge ${cur}`}>{STEP_LABEL[cur] || cur}</span>
      {pending ? <span className="sub">⏳</span> : null}
      {!pending && cur === 'new' ? (
        <button type="button" className="btn ok sm" onClick={() => go('contacted')} title="Đã nhắn / gọi cho khách">→ Đã liên hệ</button>
      ) : null}
      {!pending && cur === 'contacted' ? (
        <>
          <button type="button" className="btn ok sm" onClick={() => go('won')} title="Khách đã chốt mua">→ Đã mua</button>
          <button type="button" className="btn ghost sm" onClick={() => setAskLost((v) => !v)} title="Không chốt được, ghi lý do">→ Không chốt</button>
        </>
      ) : null}
      {!pending && (cur === 'won' || cur === 'lost' || cur === 'closed' || cur === 'spam') ? (
        <button type="button" className="btn ghost sm" onClick={() => go('contacted')} title="Mở lại khách này">↺ Mở lại</button>
      ) : null}
      {askLost ? (
        <form
          onSubmit={(e) => { e.preventDefault(); go('lost', { lost_reason: reason }); }}
          style={{ display: 'flex', gap: 4, alignItems: 'center', flexBasis: '100%' }}
        >
          <input className="note" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do không chốt (giá cao, đã mua nơi khác...)" style={{ flex: 1, fontSize: '.82rem' }} autoFocus required />
          <button className="btn ghost sm" type="submit">Lưu</button>
        </form>
      ) : null}
      {cur === 'lost' && lostReason ? <span className="sub" style={{ fontSize: '.78rem', flexBasis: '100%' }}>Lý do: {lostReason}</span> : null}
      {!pending && cur !== 'spam' ? (
        <button type="button" className="btn ghost sm" style={{ color: 'var(--ink-2)' }} onClick={() => setMore((v) => !v)} title="Trạng thái khác">⋯</button>
      ) : null}
      {more ? (
        <span style={{ display: 'inline-flex', gap: 4, flexBasis: '100%' }}>
          {cur !== 'new' ? <button type="button" className="btn ghost sm" onClick={() => go('new')}>Về Mới</button> : null}
          <button type="button" className="btn ghost sm" onClick={() => go('spam')}>🚫 Rác</button>
        </span>
      ) : null}
    </div>
  );
}
