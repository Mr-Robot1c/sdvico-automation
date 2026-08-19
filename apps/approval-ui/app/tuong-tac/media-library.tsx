'use client';

import { useState } from 'react';
import { deleteBrandAsset } from '../actions';
import { SubmitButton } from '../submit-button';

// Item media từ brand_assets sau khi cắt gọn cho UI.
export type MediaItem = {
  id: string;
  kind: 'image' | 'video';
  title: string;
  public_url: string | null;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
};

function humanSize(n: number | null): string {
  if (!n || n <= 0) return '';
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function CopyUrlButton({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost"
      style={{ fontSize: '0.8em', padding: '3px 8px' }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          alert('Không copy được URL, mở lên rồi copy tay nhé.');
        }
      }}
    >
      {done ? '✓ Đã copy' : 'Copy URL'}
    </button>
  );
}

export default function MediaLibrary({ items }: { items: MediaItem[] }) {
  const [confirm, setConfirm] = useState<MediaItem | null>(null);

  if (items.length === 0) {
    return (
      <p className="muted" style={{ margin: '8px 0' }}>
        Thư viện trống. Dùng form phía trên để tải ảnh hoặc video công ty lên. Chỉ dùng tư liệu công ty sở hữu.
      </p>
    );
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
          marginTop: 8,
        }}
      >
        {items.map((m) => (
          <div
            key={m.id}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ background: 'var(--surface-2, #000)', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {m.kind === 'image' && m.public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.public_url}
                  alt={m.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : m.kind === 'video' && m.public_url ? (
                <video
                  src={m.public_url}
                  controls
                  preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span className="muted" style={{ fontSize: '0.8em' }}>Không có URL</span>
              )}
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div style={{ fontSize: '0.85em', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.title}
              </div>
              <div style={{ fontSize: '0.75em', color: 'var(--ink-2)' }}>
                {m.kind === 'video' ? 'Video' : 'Ảnh'}
                {m.size_bytes ? ` · ${humanSize(m.size_bytes)}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                {m.public_url ? <CopyUrlButton url={m.public_url} /> : null}
                {m.public_url ? (
                  <a
                    className="btn ghost"
                    href={m.public_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.8em', padding: '3px 8px', textDecoration: 'none' }}
                  >
                    Mở
                  </a>
                ) : null}
                <button
                  type="button"
                  className="btn-danger-link"
                  style={{ fontSize: '0.8em' }}
                  onClick={() => setConfirm(m)}
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {confirm ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setConfirm(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Xóa media?</p>
            <div className="modal-body">
              <strong style={{ display: 'block', marginBottom: 8 }}>{confirm.title}</strong>
              <span className="modal-info">
                Xóa mềm khỏi thư viện. Bài đăng đã dán URL này vẫn giữ được tệp trong storage.
              </span>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>Giữ lại</button>
              <form action={deleteBrandAsset} onSubmit={() => setConfirm(null)}>
                <input type="hidden" name="id" value={confirm.id} />
                <SubmitButton label="Xóa" pendingLabel="Đang xóa..." className="btn del" />
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
