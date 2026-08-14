'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyLogoToAsset } from '../actions';

// Nút Ghép logo: gọi server action, HIỆN kết quả/lỗi ngay tại nút thay vì để lỗi làm sập trang.
export default function LogoButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const onClick = () => {
    setMsg('Đang ghép logo...');
    start(async () => {
      try {
        const r = await applyLogoToAsset(id);
        if (r?.ok) {
          setMsg('Đã ghép logo.');
          router.refresh();
        } else {
          setMsg('Lỗi ghép logo: ' + (r?.error || 'không rõ'));
        }
      } catch (e: any) {
        setMsg('Lỗi ghép logo: ' + (e?.message || e));
      }
    });
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={onClick}
        disabled={pending}
        title="Ghép logo SDVICO vào góc dưới phải"
      >
        {pending ? '...' : '🏷️ Ghép logo'}
      </button>
      {msg ? <span className="muted" style={{ fontSize: '.8rem' }}>{msg}</span> : null}
    </span>
  );
}
