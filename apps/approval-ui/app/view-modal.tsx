'use client';

import { useRef, type ReactNode } from 'react';

// Nút mắt mở modal xem chi tiết. Dùng <dialog> gốc trình duyệt để có ESC và bấm nền đóng miễn phí.
export default function ViewModal({
  title,
  label = 'Xem chi tiết',
  children
}: {
  title: string;
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = () => ref.current?.showModal();
  // Đóng thì dừng hẳn video/âm thanh bên trong (đóng dialog không tự dừng media).
  const stopMedia = () => {
    const m = ref.current?.querySelector('video, audio') as HTMLMediaElement | null;
    if (m) m.pause();
  };
  const close = () => {
    stopMedia();
    ref.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        title={label}
        onClick={open}
      >
        <span aria-hidden="true">👁</span>
      </button>
      <dialog
        ref={ref}
        className="modal"
        onClose={stopMedia}
        onClick={(e) => {
          // Bấm ngoài card nội dung (tức bấm vào backdrop) thì đóng.
          if (e.target === ref.current) close();
        }}
      >
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <button
              type="button"
              className="icon-btn"
              onClick={close}
              aria-label="Đóng"
              title="Đóng"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="modal-body">{children}</div>
        </div>
      </dialog>
    </>
  );
}
