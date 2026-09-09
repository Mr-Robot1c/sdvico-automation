'use client';
import { useState, useTransition } from 'react';
import { deleteProductQa, toggleProductQaVerified, updateProductQa } from '../actions';

// Nút thao tác 1 dòng hỏi đáp: xác nhận / bỏ xác nhận, sửa (mở form), xoá. Gọi thẳng server action.
export default function QaRowActions({
  id, verified, question, answer, source, confirmedBy,
}: { id: string; verified: boolean; question: string; answer: string; source: string; confirmedBy: string }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);

  if (gone) return <span className="sub">✓ Đã xoá</span>;

  const toggle = () => start(async () => {
    const fd = new FormData(); fd.set('id', id); fd.set('verified', verified ? '0' : '1');
    await toggleProductQaVerified(fd);
  });
  const remove = () => start(async () => {
    const fd = new FormData(); fd.set('id', id);
    await deleteProductQa(fd); setGone(true);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost sm" onClick={toggle} disabled={pending} title={verified ? 'Bỏ dấu đã xác nhận' : 'Đánh dấu đã xác nhận đúng'}>
          {verified ? '↩ Bỏ xác nhận' : '✔ Xác nhận'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setEditing((v) => !v)} disabled={pending}>✏️ Sửa</button>
        <button type="button" className="btn ghost sm" onClick={remove} disabled={pending} style={{ color: 'var(--tone-no, #dc2626)' }} title="Xoá hẳn, không hoàn tác">🗑</button>
      </div>
      {editing ? (
        <form
          action={async (fd) => { await updateProductQa(fd); setEditing(false); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}
        >
          <input type="hidden" name="id" value={id} />
          <input name="question" defaultValue={question} className="note" placeholder="Câu hỏi" required />
          <textarea name="answer" defaultValue={answer} className="note" rows={4} placeholder="Câu trả lời" required />
          <input name="source" defaultValue={source} className="note" placeholder="Nguồn (văn bản, ai nói, ngày)" />
          <input name="confirmed_by" defaultValue={confirmedBy} className="note" placeholder="Ai xác nhận" />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ok sm" type="submit">Lưu</button>
            <button className="btn ghost sm" type="button" onClick={() => setEditing(false)}>Huỷ</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
