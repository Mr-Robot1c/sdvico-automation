'use client';

import { useState } from 'react';
import { deleteContent } from '../actions';

// Nút Xoá 1 bài khỏi DB (mkt_content + approval_queue + mkt_posts + mkt_metrics).
// KHÔNG gỡ bài đã đăng thật trên FB/TikTok - chỉ gỡ khỏi hệ thống theo dõi.
// Confirm 1 lần trước khi xoá vì thao tác không revert được.
export default function DeleteButton({ contentId, title }: { contentId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      action={deleteContent}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Xoá bài này khỏi hệ thống?\n\n"${title}"\n\nBài đã đăng trên Facebook/TikTok VẪN CÒN (chỉ xoá khỏi hệ thống theo dõi số liệu).`
        );
        if (!ok) { e.preventDefault(); return; }
        setBusy(true);
      }}
      style={{ display: 'inline' }}
    >
      <input type="hidden" name="content_id" value={contentId} />
      <button
        className="btn no sm"
        type="submit"
        disabled={busy}
        title="Xoá bài khỏi hệ thống (không gỡ bài đã đăng trên FB/TikTok)"
      >
        {busy ? 'Đang xoá...' : 'Xoá'}
      </button>
    </form>
  );
}
