'use client';
import { useState, useTransition } from 'react';
import { draftReplyAction, markReplySentAction } from '../actions';

// 24/9 (sếp Long: "câu trả lời đầu tiên của em chưa chuẩn"): nút soạn nháp trả lời + nháp nhắc lại 3 chạm.
// ĐIỀU CẤM 1: máy chỉ SOẠN. Ở đây không có nút nào gửi tin cho khách: người chép, tự gửi trong Messenger
// rồi bấm "Đã gửi tay" (chính cú bấm đó là quyết định duyệt).

export type PendingDraft = { queueId: string; body: string; note: string; risk: string; needsManager: boolean; touch: number };

export default function DraftReplyButton({ leadId, fbUrl, pending }: { leadId: string; fbUrl: string | null; pending: PendingDraft | null }) {
  const [busy, start] = useTransition();
  const [draft, setDraft] = useState<PendingDraft | null>(pending);
  const [text, setText] = useState(pending?.body || '');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const compose = () => {
    if (busy) return;
    setErr('');
    start(async () => {
      const fd = new FormData();
      fd.set('lead_id', leadId);
      const r = await draftReplyAction(fd);
      if (!r.ok) { setErr(r.error); return; }
      setDraft({ queueId: r.queueId, body: r.body, note: r.note, risk: r.risk, needsManager: r.needsManager, touch: 0 });
      setText(r.body);
    });
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setErr('Trình duyệt không cho chép, bôi đen rồi Ctrl+C nhé.'); }
  };

  const markSent = () => {
    if (busy || !draft) return;
    const fd = new FormData();
    fd.set('queue_id', draft.queueId); fd.set('lead_id', leadId);
    start(async () => { await markReplySentAction(fd); setSent(true); });
  };

  if (sent) return <div className="sub" style={{ fontSize: '.78rem', marginTop: 4 }}>✓ Đã ghi nhận đã gửi tay</div>;

  if (!draft) {
    return (
      <div style={{ marginTop: 4 }}>
        <button type="button" className="btn ghost sm" onClick={compose} disabled={busy} title="Bot soạn nháp câu trả lời, người sửa và tự gửi trong Messenger">
          {busy ? '⏳ Đang soạn...' : '🤖 Soạn trả lời'}
        </button>
        {err ? <div style={{ color: '#c0392b', fontSize: '.78rem', marginTop: 2 }}>{err}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 520 }}>
      <div className="sub" style={{ fontSize: '.78rem' }}>{draft.touch >= 1 ? `Chạm ${draft.touch}: nháp nhắc lại, ` : 'Nháp trả lời, '}sửa theo ý mình rồi tự gửi trong Messenger.</div>
      <textarea className="note" rows={5} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', fontSize: '.85rem' }} aria-label="Nháp trả lời" />
      {draft.note ? <div className="sub" style={{ fontSize: '.78rem' }}>{draft.note}</div> : null}
      {draft.risk === 'red' || draft.needsManager ? (
        <div style={{ color: '#c0392b', fontSize: '.8rem', fontWeight: 600 }}>Nội dung chạm quy định, phải cấp quản lý duyệt trước khi gửi (Điều cấm 3).</div>
      ) : null}
      {draft.risk === 'amber' ? <div style={{ color: '#b9770e', fontSize: '.78rem' }}>Có thông số hoặc tên đối tác cần soát lại trước khi gửi.</div> : null}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn ghost sm" onClick={copy}>{copied ? '✓ Đã chép' : '📋 Chép'}</button>
        {fbUrl ? <a className="btn ghost sm" href={fbUrl} target="_blank" rel="noreferrer">↗ Mở hộp thư</a> : null}
        <button type="button" className="btn ok sm" onClick={markSent} disabled={busy} title="Bấm sau khi bạn đã tự gửi tin trong Messenger">✅ Đã gửi tay</button>
      </div>
      {err ? <div style={{ color: '#c0392b', fontSize: '.78rem' }}>{err}</div> : null}
    </div>
  );
}
