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

export function Countdown({
  target,
  prefix = '',
  pastLabel = 'Đã đến giờ',
  className,
}: {
  target: string;
  prefix?: string;
  pastLabel?: string;
  className?: string;
}) {
  // Bắt đầu null: server và lần render client đầu tiên giống nhau (tránh lỗi hydrate mismatch).
  // Chỉ tính theo Date.now() SAU khi mount, rồi cập nhật mỗi giây.
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setMs(new Date(target).getTime() - Date.now());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [target]);

  const title = new Date(target).toLocaleString('vi-VN');

  if (ms === null) {
    // Chưa mount: chừa chỗ trống ổn định, không phụ thuộc thời gian.
    return <span className={className} title={title} suppressHydrationWarning />;
  }

  if (ms <= 0) {
    return (
      <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }} title={title}>
        {pastLabel}
      </span>
    );
  }

  const { text, urgent } = fmt(ms);
  return (
    <span
      className={className}
      style={{ color: urgent ? 'var(--ok)' : undefined, fontVariantNumeric: 'tabular-nums' }}
      title={title}
    >
      {prefix}{text}
    </span>
  );
}
