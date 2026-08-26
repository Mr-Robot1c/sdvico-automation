'use client';

// Nut Khoi phuc + Xoa han cho tab Thung rac (/noi-dung?loai=thung-rac). User 26/8:
// "cai C di - soft delete + 1 nut Xoa han". Bai soft-delete co the:
//   1. Khoi phuc (undo, clear deleted_at) -> bai lai hien trong Bang + Bai viet
//   2. Xoa han (hard-delete 4 bang) -> MAT VINH VIEN metric, khong undo duoc, co dialog canh bao

import { useState, useTransition } from 'react';
import { restoreContent, hardDeleteContent } from '../actions';

type Props = { contentId: string; title: string; deletedAt: string | null };

export default function TrashActions({ contentId, title, deletedAt }: Props) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  if (gone) return null;

  const at = deletedAt ? new Date(deletedAt).toLocaleString('vi-VN') : '';

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {at ? <span className="sub" style={{ fontSize: '.75rem' }} title="Thời điểm ẩn">🗑️ {at}</span> : null}
      <button
        type="button"
        className="btn ok sm"
        disabled={pending}
        title={`Khôi phục "${title}" — bài quay lại Bảng bài viết, lịch sử số liệu vẫn nguyên.`}
        onClick={() => {
          setErr(null);
          const fd = new FormData();
          fd.set('content_id', contentId);
          start(async () => {
            try {
              await restoreContent(fd);
              setGone(true);
            } catch (e: any) {
              setErr(String(e?.message || 'khôi phục lỗi'));
            }
          });
        }}
      >
        ↺ Khôi phục
      </button>
      <button
        type="button"
        className="btn no sm"
        disabled={pending}
        title="Xoá HẲN bài + toàn bộ Like/View/Comment lịch sử. KHÔNG khôi phục được."
        onClick={() => {
          const ok = confirm(
            `⚠ CẢNH BÁO: Xoá hẳn "${title}"?\n\n` +
            `Việc này sẽ MẤT VĨNH VIỄN:\n` +
            `- Bản ghi bài (mkt_content)\n` +
            `- Bản ghi đã đăng trên Facebook/YouTube/TikTok (mkt_posts)\n` +
            `- TOÀN BỘ Like/View/Comment lịch sử (mkt_metrics)\n` +
            `- Hàng đợi duyệt (approval_queue)\n\n` +
            `Không phục hồi được. Chắc chưa?`
          );
          if (!ok) return;
          setErr(null);
          const fd = new FormData();
          fd.set('content_id', contentId);
          start(async () => {
            try {
              await hardDeleteContent(fd);
              setGone(true);
            } catch (e: any) {
              setErr(String(e?.message || 'xoá hẳn lỗi'));
            }
          });
        }}
      >
        ✗ Xoá hẳn
      </button>
      {err ? <span className="sub err-note">{err}</span> : null}
    </span>
  );
}
