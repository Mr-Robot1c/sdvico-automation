'use client';
// Nút "🎥 Có N cảnh Pexels" — user 27/8: badge cũ chỉ hiển thị, không click được. Fix bằng
// modal mở ra hiện danh sách cảnh với video preview + ảnh + narration + nút tải trực tiếp
// về máy. User dùng để dựng CapCut/InShot.

import { useRef, useState } from 'react';

type Scene = {
  scene?: number;
  duration_sec?: number;
  narration?: string;
  image_keyword_vi?: string;
  image_keyword_en?: string;
  pexels_image_url?: string | null;
  pexels_image_photographer?: string;
  pexels_video_url?: string | null;
  pexels_video_duration?: number;
  pexels_video_photographer?: string;
  pexels_errors?: string[];
};

export default function PexelsScenesButton({ scenes, title, hook }: { scenes: Scene[]; title?: string; hook?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const openDlg = () => dialogRef.current?.showModal();
  const closeDlg = () => dialogRef.current?.close();

  const downloadFile = async (url: string, filename: string, id: string) => {
    setDownloadingId(id);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert('Lỗi tải: ' + (e as any)?.message + '\nMở URL trực tiếp, chuột phải Lưu.');
      window.open(url, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  const slug = (title || 'sdvico').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'sdvico';

  return (
    <>
      <button
        type="button"
        onClick={openDlg}
        className="badge"
        style={{
          background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd',
          cursor: 'pointer', font: 'inherit', padding: '2px 8px',
        }}
        title="Xem 6 cảnh với video/ảnh Pexels - tải về máy dựng CapCut"
      >
        🎥 Có {scenes.length} cảnh Pexels
      </button>
      <dialog
        ref={dialogRef}
        className="plan-quick-dialog"
        style={{ maxWidth: '96vw', width: 900, padding: 20 }}
        onClick={(e) => { if (e.target === dialogRef.current) closeDlg(); }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div>
            <b style={{ fontSize: '1.05rem' }}>🎥 Kịch bản video trend — {scenes.length} cảnh</b>
            <p className="sub" style={{ fontSize: '.85rem', margin: '4px 0 0' }}>
              Tải video + ảnh Pexels về máy, kéo vào CapCut/InShot, lồng tiếng theo narration BOSS đã viết.
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={closeDlg}>✕ Đóng</button>
        </div>

        {hook ? (
          <div style={{ padding: 10, background: 'var(--bg-2, #f3f4f6)', borderRadius: 8, marginBottom: 12 }}>
            <div className="sub" style={{ fontSize: '.75rem', fontWeight: 600 }}>HOOK ≤15 chữ (câu đầu):</div>
            <div style={{ fontSize: '.95rem', marginTop: 4 }}>{hook}</div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {scenes.map((sc, i) => {
            const sceneNo = sc.scene || (i + 1);
            const dur = sc.duration_sec || 5;
            return (
              <div
                key={i}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 1fr', gap: 12,
                  padding: 12, border: '1px solid var(--line)', borderRadius: 8,
                  background: 'var(--surface, #fafafa)',
                }}
              >
                {/* Cột trái: preview video hoặc ảnh */}
                <div>
                  {sc.pexels_video_url ? (
                    <video
                      src={sc.pexels_video_url}
                      controls
                      muted
                      preload="metadata"
                      poster={sc.pexels_image_url || undefined}
                      style={{ width: '100%', borderRadius: 6, background: '#000' }}
                    />
                  ) : sc.pexels_image_url ? (
                    <img src={sc.pexels_image_url} alt={sc.image_keyword_en || ''} style={{ width: '100%', borderRadius: 6 }} />
                  ) : (
                    <div style={{ padding: 40, textAlign: 'center', background: 'var(--bg-2)', borderRadius: 6, color: 'var(--ink-2)' }}>
                      ⚠️ Không có URL Pexels
                      {sc.pexels_errors?.length ? <div style={{ fontSize: '.75rem', marginTop: 4 }}>{sc.pexels_errors.join(' · ')}</div> : null}
                    </div>
                  )}
                </div>

                {/* Cột phải: narration + keyword + nút tải */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div className="sub" style={{ fontSize: '.75rem', fontWeight: 600 }}>
                      Cảnh {sceneNo} · {dur}s
                    </div>
                    <div style={{ fontSize: '.95rem', marginTop: 4, fontStyle: 'italic', color: 'var(--ink)' }}>
                      "{sc.narration || '(không có narration)'}"
                    </div>
                  </div>

                  {sc.image_keyword_vi || sc.image_keyword_en ? (
                    <div style={{ fontSize: '.75rem', color: 'var(--ink-2)' }}>
                      🔍 Keyword: {sc.image_keyword_vi || sc.image_keyword_en}
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                    {sc.pexels_video_url ? (
                      <button
                        type="button"
                        className="btn ok sm"
                        onClick={() => downloadFile(sc.pexels_video_url!, `${slug}-scene${sceneNo}.mp4`, `v${i}`)}
                        disabled={downloadingId === `v${i}`}
                      >
                        {downloadingId === `v${i}` ? '⏳ Đang tải...' : '📥 Tải video'}
                      </button>
                    ) : null}
                    {sc.pexels_image_url ? (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => downloadFile(sc.pexels_image_url!, `${slug}-scene${sceneNo}.jpg`, `i${i}`)}
                        disabled={downloadingId === `i${i}`}
                      >
                        {downloadingId === `i${i}` ? '⏳' : '📷 Tải ảnh'}
                      </button>
                    ) : null}
                  </div>

                  {(sc.pexels_video_photographer || sc.pexels_image_photographer) ? (
                    <div className="sub" style={{ fontSize: '.7rem', color: 'var(--ink-2)' }}>
                      © {sc.pexels_video_photographer || sc.pexels_image_photographer} (Pexels)
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 14, padding: 12, background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, fontSize: '.85rem' }}>
          <b>Cách dựng nhanh (~3 phút):</b>
          <ol style={{ margin: '6px 0 0 20px', padding: 0 }}>
            <li>Tải tất cả video/ảnh về Downloads (bấm nút bên trên)</li>
            <li>Mở <b>CapCut</b> (điện thoại hoặc PC) → New Project → Import các file</li>
            <li>Kéo video/ảnh vào timeline theo thứ tự cảnh 1-{scenes.length}</li>
            <li>Ghi âm narration (Voice-over) theo lời BOSS đã viết cho mỗi cảnh</li>
            <li>Thêm nhạc nền, xuất video → Đăng lên FB/TikTok</li>
          </ol>
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={closeDlg}>Đóng</button>
        </div>
      </dialog>
    </>
  );
}
