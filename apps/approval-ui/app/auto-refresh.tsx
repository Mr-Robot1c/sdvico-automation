'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Tự làm mới dữ liệu máy chủ mỗi số giây, không tải lại cả trang.
// Dùng router.refresh để lấy lại danh sách chờ duyệt, giữ nguyên vị trí cuộn.
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  // 2/10 (UI mượt): mốc làm mới gần nhất + cờ "nợ" khi hết hạn lúc tab đang ẩn.
  // Tab nằm nền thì KHÔNG gọi máy chủ (tốn request vô ích, quay lại còn giật vì dữ liệu về dồn).
  const lastRefreshAt = useRef(Date.now());
  const owed = useRef(false);

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
  // Tab đang ẩn thì chỉ ghi "nợ", đợi tab hiện lại mới làm mới (xem effect bên dưới).
  useEffect(() => {
    if (left <= 0) {
      if (document.hidden) {
        owed.current = true;
        return;
      }
      lastRefreshAt.current = Date.now();
      owed.current = false;
      router.refresh();
      setLeft(seconds);
    }
  }, [left, seconds, router]);

  // 16/9 (Thanh: "refresh 30s chả có tác dụng"): tab nằm nền bị trình duyệt bóp đồng hồ nên
  // quay lại tab là số cũ, phải chờ thêm 1 vòng. 2/10: tính theo giờ thật (Date.now) thay vì đếm
  // tick: tab hiện lại mà đã quá hạn (hoặc đang nợ) thì làm mới 1 lần NGAY rồi đặt lại đồng hồ;
  // chưa quá hạn thì chỉ chỉnh lại số đếm cho đúng, không gọi máy chủ.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const elapsed = (Date.now() - lastRefreshAt.current) / 1000;
      if (owed.current || elapsed >= seconds) {
        lastRefreshAt.current = Date.now();
        owed.current = false;
        router.refresh();
        setLeft(seconds);
      } else {
        setLeft(Math.max(1, Math.ceil(seconds - elapsed)));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [seconds, router]);

  return (
    <span className="refresh">Tự làm mới sau {Math.max(left, 0)} giây</span>
  );
}
