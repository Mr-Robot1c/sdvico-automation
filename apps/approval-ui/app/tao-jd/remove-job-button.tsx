'use client';

import { useState, useTransition } from 'react';
import { removeJob } from '../actions';

type Props = { jobId: string; jobTitle: string };

// Nút xoá vị trí: một dòng phụ ở cuối card, không đứng cạnh nút chính để tránh bấm nhầm.
// Mở hộp xác nhận có gõ đúng tên mới bấm được. window.confirm cũ chỉ cần Enter là qua.
export default function RemoveJobButton({ jobId, jobTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();

  const phrase = jobTitle.trim() || 'XOA';
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const matched = norm(typed) === norm(phrase);

  const close = () => { setOpen(false); setTyped(''); };
  const submit = () => {
    if (!matched) return;
    const fd = new FormData();
    fd.set('job_id', jobId);
    startTransition(() => removeJob(fd));
  };

  return (
    <>
      <button type="button" className="btn-danger-link" onClick={() => setOpen(true)}>
        Xoá vị trí
      </button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={close}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Xoá vị trí này?</p>
            <div className="modal-body">
              <span className="modal-warn">
                Xoá vị trí sẽ dừng mọi bài đăng chưa duyệt và không thể khôi phục.
              </span>
              <span className="modal-info">Gõ đúng tên dưới đây để mở khoá nút xoá:</span>
              <code style={{ display: 'block', margin: '8px 0', fontWeight: 700 }}>{phrase}</code>
              <input
                className="note"
                type="text"
                value={typed}
                autoFocus
                placeholder="Gõ lại tên ở trên"
                onChange={(e) => setTyped(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={close}>Giữ lại</button>
              <button
                type="button"
                className="btn del"
                disabled={!matched || pending}
                onClick={submit}
                title={matched ? '' : 'Gõ đúng tên mới xoá được'}
              >
                {pending ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
