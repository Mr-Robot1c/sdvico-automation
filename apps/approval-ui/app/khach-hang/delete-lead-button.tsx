'use client';
// Nút xoá lead — user 27/8 "thêm cái nút xoá ở bên phải chuyển NV". Confirm 1 lần trước
// khi xoá (không revert được). Ẩn tạm khỏi danh sách nên dùng LeadStatusSelect -> 'spam'
// thay vì xoá.

import { useState, useTransition } from 'react';
import { deleteLead } from '../actions';

export default function DeleteLeadButton({ leadId, leadSummary }: { leadId: string; leadSummary: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const handle = () => {
    if (pending || done) return;
    const ok = window.confirm(`Xoá HẲN lead này khỏi danh sách?\n\n${leadSummary}\n\n(Không hoàn tác được. Nếu chỉ muốn ẩn khỏi list, đổi Trạng thái sang "Rác" thay vì xoá.)`);
    if (!ok) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('lead_id', leadId);
      await deleteLead(fd);
      setDone(true);
    });
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending || done}
      className="btn ghost sm"
      title="Xoá HẲN lead này (không hoàn tác). Chỉ muốn ẩn thì đổi trạng thái sang Rác."
      style={{ color: 'var(--tone-no, #dc2626)' }}
    >
      {done ? '✓ Đã xoá' : pending ? '⏳' : '🗑 Xoá'}
    </button>
  );
}
