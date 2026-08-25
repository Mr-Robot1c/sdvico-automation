'use client';
import { useRef } from 'react';

// Select đổi trạng thái lead — tự submit khi đổi (onChange cần Client Component, không
// đặt được trực tiếp trong Server Component page.tsx).
export default function LeadStatusSelect({
  leadId,
  status,
  note,
  action,
}: {
  leadId: string;
  status: string;
  note: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} style={{ display: 'flex', gap: 4 }}>
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="note" value={note} />
      <select
        name="status"
        defaultValue={status}
        className="note"
        style={{ padding: '4px 6px', fontSize: '.85rem' }}
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="new">🆕 Mới</option>
        <option value="contacted">📞 Đã liên hệ</option>
        <option value="closed">✅ Xong</option>
        <option value="spam">🚫 Rác</option>
      </select>
    </form>
  );
}
