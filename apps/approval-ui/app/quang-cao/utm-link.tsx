'use client';

import { useState } from 'react';

// Hien link UTM day du cho 1 chien dich + nut Copy. Nguoi quan ly dan link nay lam
// dich den (destination URL) khi tao quang cao tren FB Ads Manager / Google Ads.
export default function UtmLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* bo qua */ }
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <code style={{ fontSize: '.8rem', background: 'var(--bg-3, #eef2f7)', padding: '3px 8px', borderRadius: 6, wordBreak: 'break-all', flex: '1 1 240px' }}>{url}</code>
      <button type="button" className="btn ghost sm" onClick={onCopy}>{copied ? '✓ Đã chép' : '📋 Chép link'}</button>
    </div>
  );
}
