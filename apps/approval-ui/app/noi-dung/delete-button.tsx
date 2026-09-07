'use client';

import { useState } from 'react';
import { deleteContents } from '../actions';

// Nút Xoá 1 bài khỏi UI. Tu 26/8 la SOFT-DELETE (mark mkt_content.deleted_at) -> lich su
// Like/View/Comment o mkt_metrics CON NGUYEN. Undo tu trang /noi-dung?trangthai=da-xoa.
// KHÔNG gỡ bài đã đăng thật trên FB/TikTok - chỉ ẩn khỏi bảng theo dõi.
// 19/8 (user): BỎ popup xác nhận (xoá nhiều bài rất phiền) + XOÁ TỨC THÌ trên màn hình:
// bấm là dòng ẩn ngay (optimistic), server xoá ở nền; lỗi thì hiện lại dòng + báo.
// 7/9 (user: "xoá nhiều quá thì web bị treo"): GOM các lần bấm trong FLUSH_MS rồi gọi
// deleteContents MỘT lần (1 truy vấn, 1 lần render lại trang) thay vì mỗi nút 1 server action
// + 1 lượt render cả trang /noi-dung. Hàng đợi nằm ở mức module nên mọi nút Xoá dùng chung.
const FLUSH_MS = 800;
const pending = new Map<string, { row: HTMLElement | null; onError: (msg: string) => void }>();
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    const batch = [...pending.entries()];
    pending.clear();
    if (!batch.length) return;
    const fd = new FormData();
    fd.set('content_ids', batch.map(([id]) => id).join(','));
    try {
      await deleteContents(fd);
    } catch (e: any) {
      // Lỗi hiếm: hiện lại các dòng + báo để không "mất bài" âm thầm.
      const msg = String(e?.message || 'xoá lỗi');
      for (const [, b] of batch) {
        if (b.row) b.row.style.display = '';
        b.onError(msg);
      }
    }
  }, FLUSH_MS);
}

export default function DeleteButton({ contentId, title }: { contentId: string; title: string }) {
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        className="btn no sm"
        type="button"
        disabled={gone}
        title={`Ẩn "${title}" khỏi bảng (soft-delete). Lịch sử số liệu còn nguyên, khôi phục qua Thùng rác.`}
        onClick={() => {
          setErr(null);
          // Ẩn dòng NGAY để người dùng xoá liên tiếp không phải chờ; server xoá theo lô ở nền.
          const row = (document.getElementById(`row-${contentId}`) || null) as HTMLElement | null;
          if (row) row.style.display = 'none';
          setGone(true);
          pending.set(contentId, { row, onError: (msg) => { setGone(false); setErr(msg); } });
          scheduleFlush();
        }}
      >
        Xoá
      </button>
      {err ? <span className="sub err-note">{err}</span> : null}
    </span>
  );
}
