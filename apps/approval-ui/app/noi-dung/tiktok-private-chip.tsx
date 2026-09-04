'use client';

// Chip TikTok cho bài đã đăng qua Direct Post API ở chế độ RIÊNG TƯ (do app SDVICO không được
// TikTok audit — reject 26/8/2026 vì "internal company use"). 4 trạng thái:
//   1. Chưa xử → chip vàng "TikTok · riêng tư" + nút [Mở TikTok] + [Đã đổi công khai] + [🗑 Đã xoá].
//   2. Đã công khai (made_public_at có, url không http) → chip xanh "TikTok ✓ công khai" + nút [↺].
//   3. Đã xoá (deleted_at có) → chip xám "TikTok · đã xoá" + nút [↺] (tile Tổng quan ngừng đếm).
//   4. Có URL http → parent (bang-section) tự render <a> link chip xanh chuẩn, không dùng component này.

import { useState, useTransition } from 'react';
import PlatformLogo from './platform-logo';
import { markTikTokPublic, undoMarkTikTokPublic, markTikTokDeleted, undoMarkTikTokDeleted } from './tiktok-public-actions';
import { formatDateTimeVN } from '../labels';

type Props = {
  postId: string;
  madePublicAt: string | null;
  deletedAt?: string | null;
  tiktokUsername?: string | null;
};

export default function TikTokPrivateChip({ postId, madePublicAt, deletedAt, tiktokUsername }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [pending, start] = useTransition();

  if (deletedAt) {
    // 4/9: ép múi giờ VN (server Vercel chạy UTC), cùng lý do sửa ở trash-actions.tsx.
    const at = formatDateTimeVN(deletedAt);
    return (
      <span className="ch-link" title={`Đã đánh dấu xoá lúc ${at}. Tile Tổng quan không đếm bài này. Bấm ↺ để bỏ đánh dấu.`}
        style={{ borderColor: 'var(--muted, #9ca3af)', color: 'var(--muted, #6b7280)', opacity: 0.85 }}>
        <PlatformLogo platform="tiktok" size={15} />
        <span>TikTok · đã xoá</span>
        <button
          type="button"
          className="btn ghost sm"
          disabled={pending}
          style={{ padding: '2px 8px', fontSize: '.72rem', marginLeft: 4 }}
          onClick={() => start(() => undoMarkTikTokDeleted(postId))}
          title="Bỏ đánh dấu (bấm nhầm)"
        >↺</button>
      </span>
    );
  }

  if (madePublicAt) {
    const at = formatDateTimeVN(madePublicAt);
    return (
      <span className="ch-link" title={`Đã đánh dấu công khai lúc ${at}. Bấm ↺ để bỏ đánh dấu.`}
        style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}>
        <PlatformLogo platform="tiktok" size={15} />
        <span>TikTok ✓</span>
        <button
          type="button"
          className="btn ghost sm"
          disabled={pending}
          style={{ padding: '2px 8px', fontSize: '.72rem', marginLeft: 4 }}
          onClick={() => start(() => undoMarkTikTokPublic(postId))}
          title="Bỏ đánh dấu (bấm nhầm)"
        >↺</button>
      </span>
    );
  }

  return (
    <span
      className="ch-link is-off"
      style={{ flexWrap: 'wrap', gap: 4, borderColor: 'var(--warn, #d97706)', color: 'var(--warn, #d97706)', opacity: 1, cursor: 'default', maxWidth: '100%' }}
      title="Video đã lên TikTok ở chế độ RIÊNG TƯ (app SDVICO chưa được TikTok audit — không public tự động được). Vào app TikTok → mở video → 3 chấm → 'Ai xem được video này' → Công khai. Sau đó bấm nút 'Đã đổi công khai' bên cạnh."
    >
      <PlatformLogo platform="tiktok" size={15} />
      <span>TikTok · riêng tư</span>
      {tiktokUsername ? (
        <a
          href={`https://www.tiktok.com/@${tiktokUsername}`}
          target="_blank"
          rel="noreferrer"
          className="btn ghost sm"
          style={{ padding: '2px 8px', fontSize: '.72rem', textDecoration: 'none' }}
          title={`Mở profile TikTok @${tiktokUsername} trong tab mới`}
        >Mở TikTok</a>
      ) : null}
      {!showForm ? (
        <>
          <button
            type="button"
            className="btn ghost sm"
            style={{ padding: '2px 8px', fontSize: '.72rem' }}
            onClick={() => setShowForm(true)}
            title="Sau khi đổi công khai trên app TikTok, bấm để đánh dấu"
          >Đã đổi công khai</button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={pending}
            style={{ padding: '2px 8px', fontSize: '.72rem' }}
            onClick={() => {
              if (confirm('Đánh dấu bài này đã bị xoá khỏi TikTok? Tile Tổng quan sẽ ngừng đếm.')) {
                start(() => markTikTokDeleted(postId));
              }
            }}
            title="Bạn đã xoá video này trên app TikTok → bấm để tile Tổng quan giảm số"
          >🗑 Đã xoá</button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const u = url.trim();
            start(async () => {
              await markTikTokPublic(postId, u || undefined);
              setShowForm(false);
              setUrl('');
            });
          }}
          style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            type="url"
            placeholder="URL TikTok (tuỳ chọn)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={pending}
            style={{ fontSize: '.75rem', padding: '3px 8px', width: 170, border: '1px solid var(--line)', borderRadius: 6 }}
          />
          <button
            type="submit"
            className="btn primary sm"
            disabled={pending}
            style={{ padding: '3px 10px', fontSize: '.75rem' }}
          >{pending ? '...' : 'Lưu'}</button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={pending}
            style={{ padding: '3px 10px', fontSize: '.75rem' }}
            onClick={() => { setShowForm(false); setUrl(''); }}
          >Huỷ</button>
        </form>
      )}
    </span>
  );
}
