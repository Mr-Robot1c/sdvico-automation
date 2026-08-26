'use client';

// Nút "Kéo số liệu ngay" — gọi server action pullMetricsNow() song song 3 nền tảng, hiện
// kết quả (Facebook X, YouTube Y, TikTok Z bài đã kéo). Thay vì user chờ cron 1h.
// User 26/8: "sếp muốn thấy số liệu ngay không phải chờ".

import { useState, useTransition } from 'react';
import { pullMetricsNow } from '../actions';

export default function PullMetricsButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>('');
  const [ok, setOk] = useState<boolean | null>(null);

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        className={`btn ok ${size}`}
        disabled={pending}
        onClick={() => start(async () => {
          setMsg('');
          setOk(null);
          try {
            const r = await pullMetricsNow();
            setOk(r.ok);
            setMsg(r.msg);
          } catch (e: any) {
            setOk(false);
            setMsg('Lỗi: ' + String(e?.message || e));
          }
        })}
        title="Gọi API Facebook + YouTube + TikTok lấy Like/View/Comment mới nhất về DB. Chạy ngầm ~10-30s."
      >
        {pending ? '⏳ Đang kéo…' : '📈 Kéo số liệu ngay'}
      </button>
      {msg ? (
        <span
          style={{
            fontSize: '.82rem',
            color: ok ? 'var(--ok, #059669)' : 'var(--no, #dc2626)',
            whiteSpace: 'nowrap'
          }}
        >
          {ok ? '✓' : '✗'} {msg}
        </span>
      ) : null}
    </span>
  );
}
