'use client';
import { useRef } from 'react';

// Tên bài bấm được: mở modal xem nội dung bài viết ngay tại trang Đo lường.
export default function PostTitle({ title, product, draft }: { title: string; product: string; draft: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className="linklike"
        title="Bấm để xem nội dung bài"
        onClick={() => ref.current?.showModal()}
      >
        {title}
      </button>
      <dialog
        ref={ref}
        className="modal"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      >
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="Đóng" title="Đóng">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="modal-body">
            <p className="muted">Sản phẩm: {product}</p>
            <div className="draftbox" style={{ whiteSpace: 'pre-wrap' }}>{draft || '(không có nội dung)'}</div>
          </div>
        </div>
      </dialog>
    </>
  );
}
