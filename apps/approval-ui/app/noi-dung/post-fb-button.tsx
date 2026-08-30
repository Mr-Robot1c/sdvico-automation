'use client';

// Nút "📘 Đăng FB tay" (30/8) — giúp đăng bài đã duyệt lên Page chính SDVICO VN mà KHÔNG cần
// page token (sếp không cấp token, và điều cấm 1: máy soạn, người bấm). Một click làm 3 việc:
//   1. Copy caption (bản nháp) vào clipboard → dán thẳng vào ô soạn bài
//   2. Tải ảnh bài về máy (nếu là ảnh kho) → đính vào bài
//   3. Mở tab ô soạn bài của Page SDVICO VN → người có quyền dán + đính ảnh + Đăng
// Đăng xong dán link bài vào nút "Ghép FB chính" ngay bên để chip Facebook mở đúng bài.
// Cùng khuôn với export-tiktok-button (xuất tay TikTok vì app chưa qua audit).

import { useState } from 'react';

type Props = { caption: string; imageUrl?: string; composerUrl: string; contentTitle?: string };

export default function PostFbButton({ caption, imageUrl, composerUrl, contentTitle }: Props) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function doPost() {
    setBusy(true);
    let copyOk = false;
    let imgOk = false;
    let imgTried = false;

    // 1. Copy caption.
    try {
      await navigator.clipboard.writeText(caption || '');
      copyOk = true;
    } catch { /* fallthrough — copy tay ở nút bên */ }

    // 2. Tải ảnh về máy để đính (ảnh kho brand-assets là bucket public, CORS cho mọi origin;
    //    ảnh link ngoài như Unsplash có thể chặn CORS -> fallthrough, người tự lưu ảnh tay).
    if (imageUrl) {
      imgTried = true;
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const slug = String(contentTitle || 'sdvico').toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sdvico';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${slug}-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        imgOk = true;
      } catch { /* fallthrough — lưu ảnh tay từ modal Xem trước */ }
    }

    // 3. Mở ô soạn bài của Page (bước cuối, không chặn nếu 1-2 fail).
    window.open(composerUrl, '_blank', 'noopener,noreferrer');

    const parts = [];
    parts.push(copyOk ? '✓ copy caption' : '⚠ copy caption fail (copy tay ở nút bên)');
    if (imgTried) parts.push(imgOk ? '✓ tải ảnh (đính vào bài)' : '⚠ tải ảnh fail (lưu tay ở Xem trước)');
    parts.push('đã mở ô soạn bài — dán + đăng, xong bấm "Ghép FB chính" để lưu link.');
    setStatus(parts.join(' · '));

    setBusy(false);
    setTimeout(() => setStatus(''), 9000);
  }

  // 30/8 (gộp nút): nút Copy caption riêng bỏ đi — cụm thẻ dùng CHUNG 1 nút
  // (copy-caption-button.tsx), khỏi trùng 2 nút giống hệt với cụm TikTok.
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={doPost}
        disabled={busy}
        title="Copy caption + tải ảnh + mở ô soạn bài Page SDVICO VN để đăng tay (không cần page token). Đăng xong dán link vào 'Ghép'."
      >
        {busy ? '⏳ Đang chuẩn bị...' : 'Đăng tay'}
      </button>
      {status ? <span className="sub" style={{ fontSize: '.78rem', maxWidth: 340 }}>{status}</span> : null}
    </span>
  );
}
