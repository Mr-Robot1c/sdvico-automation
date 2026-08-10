'use client';

import { useState } from 'react';
import { decideForm } from './actions';

// Ô ghi chú và hai nút quyết cho một mục.
// Từ chối là hành động khó lấy lại, nên hỏi lại một lần trước khi gửi.
export default function DecideActions({ id, title }: { id: string; title: string }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  return (
    <form
      className="row"
      action={decideForm}
      onSubmit={(e) => {
        const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
        if (action === 'reject') {
          const ok = window.confirm(`Từ chối mục này?\n\n"${title}"`);
          if (!ok) {
            e.preventDefault();
            return;
          }
        }
        setBusy(action as 'approve' | 'reject');
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input className="note" name="note" placeholder="Ghi chú (không bắt buộc)" aria-label="Ghi chú" />
      <button className="btn ok" name="action" value="approve" disabled={busy !== null}>
        {busy === 'approve' ? 'Đang duyệt...' : 'Duyệt'}
      </button>
      <button className="btn no" name="action" value="reject" disabled={busy !== null}>
        {busy === 'reject' ? 'Đang từ chối...' : 'Từ chối'}
      </button>
    </form>
  );
}
