'use client';
import { useRef, useState } from 'react';

// 15/9 (Thanh: "bấm xem video mới nhất trong kho thì treo máy một khoảng mới xem được").
// Trước: link <a> mở thẳng file .mp4 ở tab mới -> trình duyệt tải hết file (clip Zalo thô không có
// faststart) rồi mới phát. Nay: mở hộp thoại ngay trong trang, <video preload="metadata"> chỉ kéo
// phần đầu, bấm play mới tải tiếp; video chỉ gắn vào DOM khi mở (đóng là dừng hẳn).
export default function VideoViewer({ url, title }: { url: string; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const openModal = () => { setOpen(true); ref.current?.showModal(); };
  const close = () => { setOpen(false); ref.current?.close(); };
  return (
    <>
      <button type="button" className="btn ghost sm" onClick={openModal} title="Xem ngay trong trang (không tải cả file)">▶ Xem</button>
      <dialog ref={ref} className="modal" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) close(); }}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <a className="src" href={url} target="_blank" rel="noreferrer" style={{ fontSize: '.8rem', marginRight: 10 }}>Mở tab mới ↗</a>
            <button type="button" className="icon-btn" onClick={close} aria-label="Đóng" title="Đóng"><span aria-hidden="true">✕</span></button>
          </div>
          <div className="modal-body">
            <div className="modal-media">
              {open ? <video src={url} controls autoPlay preload="metadata" playsInline style={{ maxHeight: '70vh' }} /> : null}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
