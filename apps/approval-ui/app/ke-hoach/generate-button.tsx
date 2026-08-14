'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Nút "Tạo kế hoạch ngay". Lúc chạy hiện "Đang tạo...", xong báo "Đã tạo xong" vài giây
// để người dùng biết chắc đã xong (giống nút Cập nhật số liệu ở trang Đo lường).
export default function GenerateButton({ action }: { action: () => Promise<void> }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');

  const run = async () => {
    if (state === 'busy') return;
    setState('busy');
    try {
      await action();
      router.refresh();
      setState('done');
      setTimeout(() => setState('idle'), 4000);
    } catch {
      setState('err');
      setTimeout(() => setState('idle'), 4000);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="btn ok" type="button" onClick={run} disabled={state === 'busy'}>
        {state === 'busy' ? '⏳ Đang tạo...' : '✨ Tạo kế hoạch ngay'}
      </button>
      {state === 'done' ? <span className="save-note">✓ Đã tạo xong</span> : null}
      {state === 'err' ? <span className="err-note">Lỗi, thử lại</span> : null}
    </div>
  );
}
