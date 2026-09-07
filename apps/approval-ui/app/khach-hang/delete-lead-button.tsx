'use client';
// Nút xoá lead — user 27/8 "thêm cái nút xoá ở bên phải chuyển NV". 7/9 user: BỎ popup xác nhận
// ("xoá popup luôn"), bấm là xoá ngay (không revert được). Ẩn tạm thì dùng LeadStatusSelect -> spam
// thay vì xoá.

import { useState, useTransition } from 'react';
import { deleteLead } from '../actions';

export default function DeleteLeadButton({ leadId, leadSummary }: { leadId: string; leadSummary: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const handle = () => {
    if (pending || done) return;
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
      title={`Xoá hẳn lead này, không hoàn tác: ${leadSummary}. Chỉ muốn ẩn thì đổi trạng thái sang Rác.`}
      style={{ color: 'var(--tone-no, #dc2626)' }}
    >
      {done ? '✓ Đã xoá' : pending ? '⏳' : '🗑 Xoá'}
    </button>
  );
}
