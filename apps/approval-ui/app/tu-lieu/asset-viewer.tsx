'use client';

import { useRef, useState } from 'react';

// Ảnh/clip/âm thanh trong Kho tư liệu: bấm vào để xem/nghe bản lớn trong hộp thoại.
// Media (video/audio) CHỈ được gắn vào DOM khi mở modal, nên không tự phát tiếng lúc tải trang.
export default function AssetViewer({ url, kind, title }: { url: string; kind: string; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const isImg = kind === 'image' || kind === 'logo';
  const isVid = kind === 'video' || kind === 'clip';
  const isAudio = kind === 'audio';

  const openModal = () => {
    setOpen(true);
    ref.current?.showModal();
  };
  const close = () => {
    setOpen(false); // gỡ media khỏi DOM -> dừng hẳn video/âm thanh
    ref.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className="asset-preview-btn"
        onClick={openModal}
        aria-label={`Xem ${title}`}
        title="Bấm để xem lớn"
      >
        {isImg ? (
          <img src={url} alt={title} loading="lazy" />
        ) : isVid ? (
          <>
            <video src={url} muted preload="none" />
            <span className="card-media-badge" aria-hidden="true">▶</span>
          </>
        ) : isAudio ? (
          <span className="muted" style={{ fontSize: 28 }} aria-hidden="true">🔊</span>
        ) : (
          <span className="muted">Mở file</span>
        )}
      </button>

      <dialog
        ref={ref}
        className="modal"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={close} aria-label="Đóng" title="Đóng">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-media">
              {!open ? null : isImg ? (
                <img src={url} alt={title} />
              ) : isVid ? (
                <video src={url} controls autoPlay preload="metadata" />
              ) : isAudio ? (
                <audio src={url} controls autoPlay style={{ width: '100%' }} />
              ) : (
                <a className="src" href={url} target="_blank" rel="noreferrer">Mở file trong tab mới</a>
              )}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
