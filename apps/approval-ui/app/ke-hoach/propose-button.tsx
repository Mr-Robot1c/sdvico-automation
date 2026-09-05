'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 5/9: nút "Soạn (lại) đề xuất tuần sau" — gọi BOSS soạn bản tuần sau (30 giây tới 2 phút),
// giữ applied=false, Thứ 2 8h máy áp. Cùng khuôn với GenerateButton, khác nhãn.
export default function ProposeButton({ action, label }: { action: () => Promise<void>; label: string }) {
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
      <button className="btn ghost" type="button" onClick={run} disabled={state === 'busy'}
        title="BOSS soạn bản kế hoạch cho tuần sau theo mục tiêu và tập trung hiện tại. Bản này chưa áp; Thứ 2 8h máy tự áp, hoặc bạn bấm Áp ngay. Bản đề xuất cũ của tuần đó bị thay.">
        {state === 'busy' ? '⏳ BOSS đang soạn...' : label}
      </button>
      {state === 'done' ? <span className="save-note">✓ Xong</span> : null}
      {state === 'err' ? <span className="err-note">Lỗi, thử lại</span> : null}
    </div>
  );
}
