'use client';

import { useState } from 'react';
import { createQuickLoginLink } from '../../actions';

// Nút "Tạo link đăng nhập" cho một người trong danh sách. Bấm là gọi server action sinh link
// bấm-là-vào (không cần nhập email/chờ mail), hiện URL + nút copy để gửi cho người đó qua chat.
// Xem ghi chú cơ chế + lý do an toàn ở createQuickLoginLink trong app/actions.ts.
export default function QuickLoginLink({ userId, label }: { userId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    setErr(null);
    setCopied(false);
    try {
      const res = await createQuickLoginLink(userId);
      if ('error' in res) setErr(res.error);
      else setUrl(res.url);
    } catch {
      setErr('Có lỗi khi tạo link, thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (url) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240, maxWidth: 320 }}>
        <code style={{ fontSize: '0.72em', wordBreak: 'break-all', background: 'var(--panel, #f8fafc)', padding: '4px 8px', borderRadius: 4 }}>
          {url}
        </code>
        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn ok"
            style={{ fontSize: '0.8em' }}
            onClick={() => {
              navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? 'Đã copy ✓' : 'Copy link'}
          </button>
          <button type="button" className="btn ghost" style={{ fontSize: '0.8em' }} onClick={() => setUrl(null)}>
            Ẩn
          </button>
        </div>
        <span className="muted" style={{ fontSize: '0.75em', textAlign: 'right' }}>
          Gửi riêng cho {label} qua Zalo. Link vào một lần, bấm trong vòng 1 giờ. Bấm xong máy sẽ
          nhớ, lần sau mở là vào thẳng.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
      <button
        type="button"
        className="btn ghost"
        style={{ fontSize: '0.82em' }}
        disabled={busy}
        onClick={make}
        title="Tạo link bấm-là-vào (không cần nhập email hay chờ mail). Gửi riêng cho người này."
      >
        {busy ? 'Đang tạo...' : 'Tạo link đăng nhập'}
      </button>
      {err ? <span className="err" style={{ fontSize: '0.75em' }}>{err}</span> : null}
    </div>
  );
}
