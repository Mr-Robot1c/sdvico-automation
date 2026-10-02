'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Nút mắt mở modal xem chi tiết. Dùng <dialog> gốc trình duyệt để có ESC và bấm nền đóng miễn phí.
export default function ViewModal({
  title,
  label = 'Xem chi tiết',
  footer,
  children
}: {
  title: string;
  label?: string;
  /** Thanh hành động dính đáy modal (2/10): nằm ngoài vùng cuộn nên luôn thấy, vd nút Duyệt / Từ chối. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Mở modal thì ÉP NẠP video bên trong (user 22/8: bấm xem bài, video đứng 0:00 không chạy).
  // Video nằm trong <dialog> đóng (display:none) có trình duyệt không nạp metadata, hoặc đang
  // preload="none"; gọi load() khi readyState còn 0 để bấm play là chạy được ngay.
  // 2/10 (audit lần 3): báo cho AutoRefresh biết đang có modal mở (đếm số, vì có thể nhiều modal)
  // để nó KHÔNG router.refresh() làm modal biến mất giữa lúc đang đọc. counted chống đếm đôi/trừ đôi.
  const counted = useRef(false);
  const markOpen = () => {
    if (counted.current) return;
    counted.current = true;
    const n = Number(document.body.dataset.modalOpen || 0) + 1;
    document.body.dataset.modalOpen = String(n);
  };
  const markClosed = () => {
    if (!counted.current) return;
    counted.current = false;
    const n = Math.max(0, Number(document.body.dataset.modalOpen || 0) - 1);
    if (n > 0) document.body.dataset.modalOpen = String(n);
    else delete document.body.dataset.modalOpen;
    window.dispatchEvent(new Event('sdvico:modal-closed'));
  };
  // Đang mở mà component bị gỡ (điều hướng, danh sách dựng lại) thì phải trả số đếm.
  // 2/10 tối (kiểm thật trên prod): đóng bằng ESC thì onClose của React KHÔNG nổ (React 18
  // không gắn được sự kiện 'close' không nổi bọt của <dialog>) -> số đếm kẹt ở 1, đồng hồ
  // tự làm mới đứng im. Gắn thẳng listener 'close' gốc của trình duyệt vào dialog.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onNativeClose = () => { stopMedia(); markClosed(); };
    d.addEventListener('close', onNativeClose);
    return () => {
      d.removeEventListener('close', onNativeClose);
      markClosed();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = () => {
    const d = ref.current;
    if (!d) return;
    d.showModal();
    markOpen();
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
        onClose={() => {
          stopMedia();
          markClosed();
        }}
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
          {footer ? <div className="modal-foot">{footer}</div> : null}
        </div>
      </dialog>
    </>
  );
}
