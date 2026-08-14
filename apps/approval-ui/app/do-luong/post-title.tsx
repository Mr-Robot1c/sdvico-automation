'use client';
import { useRef } from 'react';

// Tên bài bấm được. Có link bài đã đăng (mkt_posts.external_url) thì bấm MỞ ĐÚNG BÀI ĐÓ ở tab mới.
// Bài chưa đăng hoặc không có link thì mở modal xem nội dung nháp ngay tại trang Đo lường.
export default function PostTitle({
  title,
  product,
  draft,
  url
}: {
  title: string;
  product: string;
  draft: string;
  url?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  if (url) {
    return (
      <a className="linklike" href={url} target="_blank" rel="noopener noreferrer" title="Mở bài đã đăng ở tab mới">
        {title} <span aria-hidden="true">↗</span>
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className="linklike"
        title="Chưa có link bài đăng, bấm để xem nội dung nháp"
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
