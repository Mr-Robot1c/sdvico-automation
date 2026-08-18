'use client';

import { useState, useTransition } from 'react';
import { dismissInterviewSchedule } from '../actions';

type Props = {
  queueId: string;
  candName: string;
  passed: boolean;
};

// Xoá một mục khỏi trang Lịch phỏng vấn. Chỉ xoá bản ghi hàng đợi, giữ nguyên hồ sơ ứng
// viên và các thông tin lịch trong hr_applications (chosen_slot, interviewed_at) — nếu cần
// mời lại, bấm "Xét duyệt vào phỏng vấn" ở trang Hồ sơ sẽ soạn lại thư mới.
export default function DismissInterviewButton({ queueId, candName, passed }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const close = () => setOpen(false);
  const submit = () => {
    const fd = new FormData();
    fd.set('queueId', queueId);
    startTransition(() => dismissInterviewSchedule(fd));
  };

  return (
    <>
      <button type="button" className="btn-danger-link" onClick={() => setOpen(true)}>
        Xoá khỏi lịch
      </button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={close}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Xoá lịch phỏng vấn?</p>
            <div className="modal-body">
              <strong style={{ display: 'block', marginBottom: 8 }}>{candName}</strong>
              {passed ? (
                <span className="modal-info">
                  Buổi phỏng vấn đã qua khung giờ. Xoá khỏi lịch để dọn khung hiển thị.
                  Hồ sơ ứng viên vẫn được giữ ở trang Hồ sơ.
                </span>
              ) : (
                <span className="modal-warn">
                  Buổi phỏng vấn này chưa tới khung giờ. Xoá xong ứng viên vẫn còn ở trang Hồ sơ,
                  nhưng nếu muốn mời lại phải bấm &quot;Xét duyệt vào phỏng vấn&quot; để soạn thư mới.
                </span>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={close}>Giữ lại</button>
              <button
                type="button"
                className="btn del"
                disabled={pending}
                onClick={submit}
              >
                {pending ? 'Đang xoá...' : 'Xoá khỏi lịch'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
