'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Nút cập nhật số liệu Facebook thủ công. Trong lúc chạy hiện "Đang cập nhật...", xong thì
// báo "Đã cập nhật xong" cạnh nút vài giây để người dùng biết chắc đã xong (không tưởng là treo).
export default function RefreshButton({ action }: { action: () => Promise<void> }) {
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
        {state === 'busy' ? '⏳ Đang cập nhật...' : '↻ Cập nhật số liệu'}
      </button>
      {state === 'done' ? <span className="save-note">✓ Đã cập nhật xong</span> : null}
      {state === 'err' ? <span className="err-note">Lỗi, thử lại</span> : null}
    </div>
  );
}
