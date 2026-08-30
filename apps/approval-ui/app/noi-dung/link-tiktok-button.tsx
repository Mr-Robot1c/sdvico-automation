'use client';
// Nút "🎵 Ghép video TikTok" — user 27/8: video đăng tay lên TikTok Studio không khớp
// published_at trong DB. UI này cho user chọn video TikTok tương ứng với bài, lưu mapping
// vào mkt_content.brief.tiktok_video_id -> pullTikTokMetrics dùng mapping chính xác.
//
// Popover dùng portal + fixed positioning (cùng pattern ShareGroups/AddLead).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { linkTikTokVideoToContent, unlinkTikTokVideoFromContent, getTikTokVideosForMatching } from '../actions';

type Video = {
  id: string;
  title: string;
  shareUrl: string;
  views: number;
  likes: number;
  comments: number;
  createdAtVN: string;
};

export default function LinkTikTokButton({
  contentId,
  linkedVideoId,
  linkedShareUrl,
}: {
  contentId: string;
  linkedVideoId?: string | null;
  linkedShareUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const popW = 420;
      let left = Math.round(r.left);
      if (left + popW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popW - 8);
      setPos({ top: Math.round(r.bottom + 6), left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPop = popRef.current && popRef.current.contains(target);
      const inBtn = btnRef.current && btnRef.current.contains(target);
      if (!inPop && !inBtn) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const loadVideos = async () => {
    if (loading) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await getTikTokVideosForMatching();
      if (r.ok) setVideos(r.videos);
      else setMsg(`⚠️ ${r.error || 'Không lấy được video'}`);
    } finally {
      setLoading(false);
    }
  };

  const openAndLoad = () => {
    setOpen(true);
    if (!videos.length) loadVideos();
  };

  const pick = async (video: Video) => {
    if (pending) return;
    setPending(true);
    setMsg('Đang ghép...');
    try {
      const fd = new FormData();
      fd.set('content_id', contentId);
      fd.set('video_id', video.id);
      fd.set('share_url', video.shareUrl);
      const r = await linkTikTokVideoToContent(fd);
      setMsg(r.msg);
      if (r.ok) {
        setTimeout(() => { setOpen(false); setMsg(''); }, 1500);
      }
    } finally {
      setPending(false);
    }
  };

  const unlink = async () => {
    if (pending) return;
    if (!window.confirm('Bỏ ghép video TikTok với bài này?')) return;
    setPending(true);
    setMsg('Đang bỏ ghép...');
    try {
      const fd = new FormData();
      fd.set('content_id', contentId);
      const r = await unlinkTikTokVideoFromContent(fd);
      setMsg(r.msg);
      if (r.ok) setTimeout(() => { setOpen(false); setMsg(''); }, 1200);
    } finally {
      setPending(false);
    }
  };

  const popContent = open && pos ? (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Ghép video TikTok"
      style={{
        position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
        background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
        padding: 12, width: 420, maxHeight: '70vh', overflowY: 'auto',
        boxShadow: '0 14px 42px rgba(0,0,0,.28)',
        color: 'var(--ink)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>
        Chọn video TikTok tương ứng với bài. Sau khi ghép, view/like/comment sẽ tự cập nhật mỗi giờ.
      </div>
      {linkedVideoId ? (
        <div style={{ padding: 8, background: 'var(--surface-2)', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
          <b>Đã ghép:</b> video id <code>{linkedVideoId.slice(0, 20)}...</code>
          {linkedShareUrl ? <> · <a href={linkedShareUrl} target="_blank" rel="noreferrer" className="src">↗ Mở</a></> : null}
          <button type="button" className="btn ghost sm" onClick={unlink} disabled={pending} style={{ marginLeft: 6 }}>
            🔗❌ Bỏ ghép
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="sub" style={{ padding: 12, textAlign: 'center' }}>⏳ Đang tải 20 video gần nhất trên profile...</div>
      ) : videos.length === 0 ? (
        <div className="sub" style={{ padding: 12, textAlign: 'center' }}>
          {msg || 'Chưa tải được video. Bấm "Tải lại" bên dưới.'}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {videos.map((v) => {
            const isLinked = v.id === linkedVideoId;
            return (
              <li key={v.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center',
                padding: 8, border: '1px solid var(--line)', borderRadius: 6,
                background: isLinked ? 'var(--ok-bg)' : 'transparent',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isLinked ? '✓ ' : ''}{v.title || '(không tên)'}
                  </div>
                  <div className="sub" style={{ fontSize: 11 }}>
                    👁 {v.views.toLocaleString('vi-VN')} · ❤️ {v.likes} · 💬 {v.comments} · ⏰ {v.createdAtVN}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {v.shareUrl ? (
                    <a className="btn ghost sm" href={v.shareUrl} target="_blank" rel="noreferrer" title="Mở video TikTok">↗</a>
                  ) : null}
                  <button
                    type="button"
                    className="btn ok sm"
                    onClick={() => pick(v)}
                    disabled={pending || isLinked}
                  >
                    {isLinked ? 'Đã ghép' : 'Chọn'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {msg ? <div className="sub" style={{ marginTop: 8, fontSize: 12, padding: 6, background: 'var(--surface-2)', borderRadius: 6 }}>{msg}</div> : null}
      <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost sm" onClick={loadVideos} disabled={loading}>🔄 Tải lại</button>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Đóng</button>
      </div>
    </div>
  ) : null;

  return (
    <span style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        className="btn ghost sm"
        onClick={openAndLoad}
        title={linkedVideoId ? 'Đã ghép video TikTok — bấm để đổi/bỏ ghép' : 'Ghép bài này với video trên TikTok Studio để tự cập nhật view/like'}
        style={linkedVideoId ? { color: 'var(--ok)' } : undefined}
      >
        {/* 30/8 gộp nút: nằm trong hàng có nhãn "🎵 TikTok" nên bỏ chữ TikTok lặp lại. */}
        {linkedVideoId ? '✓ Đã ghép' : 'Ghép link'}
      </button>
      {mounted && popContent ? createPortal(popContent, document.body) : null}
    </span>
  );
}
