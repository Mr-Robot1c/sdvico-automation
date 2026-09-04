'use client';

// Nut Khoi phuc + Xoa han cho tab Thung rac (/noi-dung?loai=thung-rac). User 26/8:
// "cai C di - soft delete + 1 nut Xoa han". Bai soft-delete co the:
//   1. Khoi phuc (undo, clear deleted_at) -> bai lai hien trong Bang + Bai viet
//   2. Xoa han (hard-delete 4 bang) -> MAT VINH VIEN metric, khong undo duoc, co dialog canh bao

import { useState, useTransition } from 'react';
import { restoreContent, hardDeleteContent } from '../actions';
import { formatDateTimeVN } from '../labels';

type Props = { contentId: string; title: string; deletedAt: string | null };

export default function TrashActions({ contentId, title, deletedAt }: Props) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  if (gone) return null;

  // 4/9 (sếp: "đang trắng, bấm Thùng rác thì đen"): trước dùng toLocaleString KHÔNG ép múi giờ.
  // Server Vercel chạy UTC ra "03:07", trình duyệt ra "10:07" -> React hydration lệch chữ
  // (lỗi #425/#418/#423), React vẽ lại toàn cây từ client và làm mất data-theme mà script
  // trong <head> đã đặt -> trang rơi về màu hệ thống (tối). Ép Asia/Ho_Chi_Minh cho hai bên
  // ra cùng một chuỗi; suppressHydrationWarning phòng ICU hai bên lệch dấu cách.
  const at = deletedAt ? formatDateTimeVN(deletedAt) : '';

  // 29/8 (sếp: "nút xoá hẳn lệch không đồng đều"): giờ xoá 1 dòng riêng, 2 nút LUÔN cùng 1
  // hàng ngang — không wrap lệch giữa các dòng trong bảng nữa.
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      {at ? <span className="sub" style={{ fontSize: '.75rem', whiteSpace: 'nowrap' }} title="Thời điểm ẩn" suppressHydrationWarning>🗑️ {at}</span> : null}
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
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
          // 29/8 (user: "đừng làm popup nữa, tốn thời gian"): bỏ hộp confirm — bài trong Thùng
          // rác vốn đã qua một lớp xoá mềm rồi, bấm Xoá hẳn là đi luôn.
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
      </span>
      {err ? <span className="sub err-note">{err}</span> : null}
    </span>
  );
}
