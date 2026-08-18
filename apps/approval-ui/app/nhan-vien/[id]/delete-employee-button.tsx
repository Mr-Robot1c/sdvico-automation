'use client';

import { useState } from 'react';
import { deleteEmployee } from '../../actions';

// Xoá nhân viên là mất hẳn hồ sơ và tài liệu (BHXH, CCCD, hợp đồng), không khôi phục được,
// nên bắt gõ đúng tên mới bật nút xoá — tránh lỡ tay. Dữ liệu tuyển dụng của người này
// (nếu đến từ ứng viên) vẫn giữ nguyên, không đụng tới.
export default function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const ok = typed.trim() === name.trim();

  if (!open) {
    return (
      <button className="btn ghost" type="button" onClick={() => setOpen(true)} style={{ color: 'var(--no)' }}>
        Xoá nhân viên
      </button>
    );
  }

  return (
    <div className="settings-box" style={{ margin: 0, border: '1px solid var(--no)' }}>
      <b style={{ color: 'var(--no)' }}>Xoá vĩnh viễn hồ sơ nhân viên này?</b>
      <p className="muted" style={{ margin: '6px 0', fontSize: '0.85em' }}>
        Xoá cả tài liệu đã tải lên (hợp đồng, bằng cấp, BHXH, CCCD). Không khôi phục được. Gõ đúng
        họ tên <b>{name}</b> để xác nhận.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          className="note"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Gõ lại họ tên"
          style={{ flex: '1 1 200px' }}
        />
        <form action={deleteEmployee}>
          <input type="hidden" name="id" value={id} />
          <button className="btn no" type="submit" disabled={!ok}>Xoá</button>
        </form>
        <button className="btn ghost" type="button" onClick={() => { setOpen(false); setTyped(''); }}>Huỷ</button>
      </div>
    </div>
  );
}
