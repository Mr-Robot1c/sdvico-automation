'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Tự kéo số liệu Facebook mới mỗi N phút khi trang Đo lường đang mở (dùng token FB của app,
// không cần cron ngoài). Vercel Hobby không chạy cron dưới 1 ngày nên làm mới ở phía trang.
export default function MetricsAuto({ action, minutes = 30 }: { action: () => Promise<void>; minutes?: number }) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const busy = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      setStatus('đang cập nhật...');
      try {
        await action();
        router.refresh();
        setStatus('✓ vừa cập nhật');
        setTimeout(() => setStatus(''), 4000);
      } catch {
        /* bỏ qua lỗi mạng tạm thời */
        setStatus('');
      } finally {
        busy.current = false;
      }
    };
    const id = setInterval(tick, Math.max(1, minutes) * 60 * 1000);
    return () => clearInterval(id);
  }, [action, router, minutes]);

  return (
    <span className="muted" style={{ fontSize: '.8rem' }}>
      {status || `Tự cập nhật mỗi ${minutes} phút`}
    </span>
  );
}
