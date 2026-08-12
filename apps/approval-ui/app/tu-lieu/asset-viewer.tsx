'use client';

import { useRef } from 'react';

// Ảnh/clip trong Kho tư liệu: bấm vào để xem bản lớn trong hộp thoại.
export default function AssetViewer({ url, kind, title }: { url: string; kind: string; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const isImg = kind === 'image' || kind === 'logo';
  const isVid = kind === 'video' || kind === 'clip';

  return (
    <>
      <button
        type="button"
        className="asset-preview-btn"
        onClick={() => ref.current?.showModal()}
        aria-label={`Xem ${title}`}
        title="Bấm để xem lớn"
      >
        {isImg ? (
          <img src={url} alt={title} loading="lazy" />
        ) : isVid ? (
          <>
            <video src={url} muted preload="metadata" />
            <span className="card-media-badge" aria-hidden="true">▶</span>
          </>
        ) : (
          <span className="muted">Mở file</span>
        )}
      </button>

      <dialog
        ref={ref}
        className="modal"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="Đóng" title="Đóng">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-media">
              {isImg ? (
                <img src={url} alt={title} />
              ) : isVid ? (
                <video src={url} controls autoPlay preload="metadata" />
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
