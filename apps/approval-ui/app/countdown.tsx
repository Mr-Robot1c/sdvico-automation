'use client';

import { useEffect, useState } from 'react';

function fmt(ms: number): { text: string; urgent: boolean } {
  if (ms <= 0) return { text: 'Đã đến giờ', urgent: true };
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return { text: `${d} ngày ${h % 24}g`, urgent: false };
  }
  if (h > 0) return { text: `${h}g ${m}ph`, urgent: false };
  if (m > 0) return { text: `${m}ph ${sec}s`, urgent: m < 10 };
  return { text: `${sec}s`, urgent: true };
}

export function Countdown({ target, className }: { target: string; className?: string }) {
  const [ms, setMs] = useState(() => new Date(target).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setMs(new Date(target).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const { text, urgent } = fmt(ms);
  return (
    <span
      className={className}
      style={{ color: urgent ? 'var(--ok)' : undefined, fontVariantNumeric: 'tabular-nums' }}
      title={new Date(target).toLocaleString('vi-VN')}
    >
      {text}
    </span>
  );
}
