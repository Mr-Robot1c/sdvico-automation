'use client';

// Nút "📥 Xuất TikTok" — user 26/8 chốt: bỏ auto-post TikTok API (unaudited app SDVICO không
// post được cho account public), thay bằng xuất tay. Nút này làm 3 việc 1 click:
//   1. Tải file video bản dọc (9:16) về máy → file .mp4 vào Downloads
//   2. Copy caption vào clipboard → dán vào ô TikTok
//   3. Mở tab mới https://www.tiktok.com/upload → user login (nếu chưa) rồi upload
// NV cầm PC hoặc điện thoại chuyển video lên app/web TikTok, paste caption, Post. ~1 phút/bài.
//
// Fetch cross-origin: Supabase Storage bucket brand-assets là public, CORS mặc định cho
// mọi origin -> download blob hoạt động. Nếu fail (CORS đổi hoặc mạng chậm), fallback: user
// chuột phải link video ở modal Xem trước, Lưu tay.

import { useState } from 'react';

type Props = { videoUrl: string; caption: string; contentTitle: string };

export default function ExportTiktokButton({ videoUrl, caption, contentTitle }: Props) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    let downloadOk = false;
    let copyOk = false;

    // 1. Tải video về máy (blob download).
    try {
      setStatus('Đang tải video...');
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      // Tên file: slug từ tiêu đề bài + timestamp cho khỏi đè.
      const slug = String(contentTitle || 'sdvico').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sdvico';
      a.download = `${slug}-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      downloadOk = true;
    } catch (e) {
      /* fallthrough — user copy link tay */
    }

    // 2. Copy caption.
    try {
      await navigator.clipboard.writeText(caption || '');
      copyOk = true;
    } catch {
      /* fallthrough — user copy tay */
    }

    // 3. Mở tab TikTok upload (bước cuối, không blocking nếu 1-2 fail).
    window.open('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer');

    if (downloadOk && copyOk) setStatus('✓ Tải video + copy caption xong. Vào tab TikTok Upload dán + upload.');
    else if (downloadOk) setStatus('✓ Tải video xong. Copy caption tay ở nút bên (browser chặn tự copy).');
    else if (copyOk) setStatus('✓ Copy caption xong. Tải video: chuột phải link video ở Xem trước → Lưu tay.');
    else setStatus('⚠ Tải + copy đều fail. Mở link video tay, chuột phải Lưu. Caption copy tay ở nút bên.');

    setBusy(false);
    setTimeout(() => setStatus(''), 8000);
  }

  async function copyOnly() {
    try {
      await navigator.clipboard.writeText(caption || '');
      setStatus('✓ Đã copy caption');
      setTimeout(() => setStatus(''), 3000);
    } catch {
      setStatus('Copy fail — bôi đen caption trong modal Xem trước rồi Ctrl+C');
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={doExport}
        disabled={busy}
        title="Tải video dọc + copy caption + mở tab TikTok Upload để bạn upload tay (API TikTok bị block cho app SDVICO chưa audit)"
      >
        {busy ? '⏳ Đang xuất...' : '📥 Xuất TikTok'}
      </button>
      <button
        type="button"
        className="btn ghost sm"
        onClick={copyOnly}
        style={{ padding: '4px 8px', fontSize: '.78rem' }}
        title="Chỉ copy caption (không tải video, không mở tab)"
      >
        📋 Copy caption
      </button>
      {status ? (
        <span className="sub" style={{ fontSize: '.78rem', maxWidth: 320 }}>{status}</span>
      ) : null}
    </span>
  );
}
