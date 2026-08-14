'use client';

import { useEffect } from 'react';

// Bắt lỗi hiển thị phía client để trang không bị trắng.
// Nguyên nhân hay gặp: vừa deploy bản mới trong khi tab cũ còn mở (chunk cũ không còn),
// hoặc lỗi tạm thời khi tự làm mới. Tự tải lại MỘT lần để lấy bản mới; nếu lỗi lặp lại
// trong vòng 15 giây thì thôi tự tải (tránh vòng lặp) và hiện nút thử lại.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      const KEY = 'lastAutoReload';
      const now = Date.now();
      const last = Number(sessionStorage.getItem(KEY) || '0');
      if (now - last > 15000) {
        sessionStorage.setItem(KEY, String(now));
        window.location.reload();
      }
    } catch {
      // sessionStorage không dùng được thì bỏ qua, để nút thử lại xử lý.
    }
  }, [error]);

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h2 style={{ marginBottom: 8 }}>Trang gặp lỗi tạm thời</h2>
      <p style={{ color: 'var(--ink-2)', marginBottom: 16 }}>
        Có thể do vừa có bản cập nhật. Trang sẽ tự tải lại; nếu không, bấm nút bên dưới.
      </p>
      <button className="btn ok" onClick={() => reset()}>Thử lại</button>
    </main>
  );
}
