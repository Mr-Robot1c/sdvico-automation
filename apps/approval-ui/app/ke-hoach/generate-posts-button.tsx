'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Nút "Sinh bài ngay theo kế hoạch" — gọi /api/rotate?force=1 qua server action, bỏ guard
// 1 bài/slot/ngày để người quản lý thấy bài theo kế hoạch mới NGAY (user 24/8: "đổi kế hoạch
// mà không sinh bài mới"). Hiện kết quả (số bài sinh / lý do lỗi) ngay dưới nút.
export default function GeneratePostsButton({
  action,
}: {
  action: () => Promise<{ ok: boolean; created: number; note: string }>;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy'>('idle');
  const [result, setResult] = useState<{ ok: boolean; note: string } | null>(null);

  const run = async () => {
    if (state === 'busy') return;
    setState('busy');
    setResult(null);
    try {
      const r = await action();
      setResult({ ok: r.ok, note: r.note });
      router.refresh();
    } catch (e: any) {
      setResult({ ok: false, note: String(e?.message || e).slice(0, 200) });
    } finally {
      setState('idle');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn ok" type="button" onClick={run} disabled={state === 'busy'}
          title="Sinh 1 đợt bài (A + B + content) theo kế hoạch đang áp NGAY, bỏ qua chờ cron 7h/12h30. Bài vào Hàng đợi duyệt, không tự đăng.">
          {state === 'busy' ? '⏳ Đang sinh bài...' : '🔄 Sinh bài ngay theo kế hoạch'}
        </button>
        <span className="sub">Bỏ qua chờ cron — bài vào Hàng đợi duyệt để bạn bấm Duyệt.</span>
      </div>
      {result ? (
        <p className={`sub ${result.ok ? '' : 'err-note'}`} style={{ margin: 0 }}>
          {result.ok ? '✅' : '⛔'} {result.note}
          {result.ok ? <> Mở <a href="/noi-dung">Hàng đợi duyệt</a> để xem.</> : null}
        </p>
      ) : null}
    </div>
  );
}
