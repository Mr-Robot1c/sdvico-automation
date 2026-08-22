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
  // Mở modal thì ÉP NẠP video bên trong (user 22/8: bấm xem bài, video đứng 0:00 không chạy).
  // Video nằm trong <dialog> đóng (display:none) có trình duyệt không nạp metadata, hoặc đang
  // preload="none"; gọi load() khi readyState còn 0 để bấm play là chạy được ngay.
  const open = () => {
    const d = ref.current;
    if (!d) return;
    d.showModal();
    d.querySelectorAll('video').forEach((v) => {
      if (v.readyState === 0) { try { v.load(); } catch { /* bỏ qua */ } }
    });
  };
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
