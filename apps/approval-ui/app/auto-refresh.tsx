'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Tự làm mới dữ liệu máy chủ mỗi số giây, không tải lại cả trang.
// Dùng router.refresh để lấy lại danh sách chờ duyệt, giữ nguyên vị trí cuộn.
//
// Bản trước đếm ngược từng giây bằng useState và gọi router.refresh() ngay trong hàm
// cập nhật state. Hàm cập nhật phải thuần túy, gọi router trong đó làm React văng
// "Maximum update depth exceeded" rồi rơi vào error boundary, chính là màn hình
// "Trang gặp lỗi tạm thời". Con số đếm ngược cũng không hiển thị ở đâu, nên bỏ luôn
// state, chỉ còn một hẹn giờ gọi refresh.
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = setInterval(() => router.refresh(), Math.max(1, seconds) * 1000);
    return () => clearInterval(tick);
  }, [router, seconds]);

  return null;
}
