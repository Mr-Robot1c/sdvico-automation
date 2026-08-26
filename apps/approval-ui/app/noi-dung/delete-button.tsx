'use client';

import { useState, useTransition } from 'react';
import { deleteContent } from '../actions';

// Nút Xoá 1 bài khỏi UI. Tu 26/8 la SOFT-DELETE (mark mkt_content.deleted_at) -> lich su
// Like/View/Comment o mkt_metrics CON NGUYEN. Undo tu trang /noi-dung?trangthai=da-xoa.
// KHÔNG gỡ bài đã đăng thật trên FB/TikTok - chỉ ẩn khỏi bảng theo dõi.
// 19/8 (user): BỎ popup xác nhận (xoá nhiều bài rất phiền) + XOÁ TỨC THÌ trên màn hình:
// bấm là dòng ẩn ngay (optimistic), server xoá ở nền; lỗi thì hiện lại dòng + báo.
export default function DeleteButton({ contentId, title }: { contentId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (gone) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        className="btn no sm"
        type="button"
        disabled={pending}
        title={`Ẩn "${title}" khỏi bảng (soft-delete). Lịch sử số liệu còn nguyên, khôi phục qua Thùng rác.`}
        onClick={() => {
          setErr(null);
          // Ẩn dòng NGAY để người dùng xoá liên tiếp không phải chờ; server xoá ở nền.
          const row = (document.getElementById(`row-${contentId}`) || null) as HTMLElement | null;
          if (row) row.style.display = 'none';
          setGone(true);
          const fd = new FormData();
          fd.set('content_id', contentId);
          startTransition(async () => {
            try {
              await deleteContent(fd);
            } catch (e: any) {
              // Lỗi hiếm: hiện lại dòng + báo để không "mất bài" âm thầm.
              if (row) row.style.display = '';
              setGone(false);
              setErr(String(e?.message || 'xoá lỗi'));
            }
          });
        }}
      >
        Xoá
      </button>
      {err ? <span className="sub err-note">{err}</span> : null}
    </span>
  );
}
