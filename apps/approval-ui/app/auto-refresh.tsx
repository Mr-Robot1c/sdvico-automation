'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Tự làm mới dữ liệu máy chủ mỗi số giây, không tải lại cả trang.
// Dùng router.refresh để lấy lại danh sách chờ duyệt, giữ nguyên vị trí cuộn.
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const tick = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          router.refresh();
          return seconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router, seconds]);

  return (
    <span className="refresh">Tự làm mới sau {left} giây</span>
  );
}
