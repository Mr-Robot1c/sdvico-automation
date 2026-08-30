'use client';

// Nút Copy caption DÙNG CHUNG cho cả cụm hành động của thẻ bài (30/8, user: "gộp các chức
// năng lại"). Trước đây Đăng FB tay và Xuất TikTok mỗi nút kèm 1 nút copy riêng -> thẻ có
// 2 nút "Copy caption" giống hệt nhau. Caption là MỘT (bản nháp bài) nên chỉ cần 1 nút.
import { useState } from 'react';

export default function CopyCaptionButton({ caption }: { caption: string }) {
  const [msg, setMsg] = useState('');
  async function doCopy() {
    try {
      await navigator.clipboard.writeText(caption || '');
      setMsg('✓ Đã copy');
    } catch {
      setMsg('Copy fail — bôi đen caption trong Xem trước rồi Ctrl+C');
    }
    setTimeout(() => setMsg(''), 3000);
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button type="button" className="btn ghost sm" onClick={doCopy} title="Copy bản nháp bài (dùng cho cả Facebook lẫn TikTok)">
        📋 Copy caption
      </button>
      {msg ? <span className="sub" style={{ fontSize: '.78rem' }}>{msg}</span> : null}
    </span>
  );
}
