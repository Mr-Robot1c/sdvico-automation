'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Tự làm mới dữ liệu máy chủ mỗi số giây, không tải lại cả trang.
// Dùng router.refresh để lấy lại danh sách chờ duyệt, giữ nguyên vị trí cuộn.
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  // Đồng hồ đếm ngược: chỉ GIẢM state, KHÔNG gọi router.refresh() ở đây.
  // (Trước 20/8: refresh gọi ngay trong hàm updater của setState -> "Cannot update a component
  // while rendering a different component" -> lặp mỗi giây -> "Maximum update depth exceeded",
  // trang crash. Tách refresh sang effect riêng bên dưới.)
  useEffect(() => {
    const tick = setInterval(() => {
      setLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Khi đếm về 0: làm mới dữ liệu máy chủ (ngoài render, an toàn) rồi đặt lại đồng hồ.
  useEffect(() => {
    if (left <= 0) {
      router.refresh();
      setLeft(seconds);
    }
  }, [left, seconds, router]);

  // 16/9 (Thanh: "refresh 30s chả có tác dụng"): tab nằm nền bị trình duyệt bóp đồng hồ nên
  // quay lại tab là số cũ, phải chờ thêm 1 vòng. Giờ hễ tab hiện lại là làm mới NGAY.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        setLeft(seconds);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [seconds, router]);

  return (
    <span className="refresh">Tự làm mới sau {Math.max(left, 0)} giây</span>
  );
}
