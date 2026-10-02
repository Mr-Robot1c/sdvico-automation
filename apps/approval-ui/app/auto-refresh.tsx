'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

  // 2/10 (audit lần 3): modal đang mở (ViewModal "Xem bài viết", lead/plan quick-view...) mà
  // router.refresh() chạy thì danh sách dựng lại và modal biến mất giữa lúc người duyệt đang đọc.
  // ViewModal đặt body.dataset.modalOpen = số modal đang mở; <dialog open> bất kỳ cũng tính (dự
  // phòng cho modal không dùng ViewModal). Có modal thì chỉ ghi "nợ", đóng modal mới trả.
  const modalOpen = () => {
    const anyDialog = !!document.querySelector('dialog[open]');
    // 2/10 tối: số đếm chỉ do ViewModal (thẻ <dialog>) ghi. Không còn dialog nào mở mà số đếm
    // vẫn > 0 nghĩa là cờ bị kẹt (vd ESC đóng dialog mà onClose React không nổ) — tự dọn,
    // nếu không đồng hồ đứng ở 0 giây mãi mãi.
    if (!anyDialog && Number(document.body.dataset.modalOpen || 0) > 0) {
      delete document.body.dataset.modalOpen;
    }
    return anyDialog;
  };

  const refreshNow = useCallback(() => {
    lastRefreshAt.current = Date.now();
    owed.current = false;
    router.refresh();
    setLeft(seconds);
  }, [router, seconds]);

  // Khi đếm về 0: làm mới dữ liệu máy chủ (ngoài render, an toàn) rồi đặt lại đồng hồ.
  // Tab đang ẩn hoặc đang có modal mở thì chỉ ghi "nợ", đợi tab hiện lại / modal đóng mới làm mới.
  useEffect(() => {
    if (left <= 0) {
      if (document.hidden || modalOpen()) {
        owed.current = true;
        return;
      }
      refreshNow();
    }
  }, [left, refreshNow]);

  // 16/9 (Thanh: "refresh 30s chả có tác dụng"): tab nằm nền bị trình duyệt bóp đồng hồ nên
  // quay lại tab là số cũ, phải chờ thêm 1 vòng. 2/10: tính theo giờ thật (Date.now) thay vì đếm
  // tick: tab hiện lại mà đã quá hạn (hoặc đang nợ) thì làm mới 1 lần NGAY rồi đặt lại đồng hồ;
  // chưa quá hạn thì chỉ chỉnh lại số đếm cho đúng, không gọi máy chủ.
  // Modal đóng (sự kiện 'sdvico:modal-closed' từ ViewModal, hoặc 'close' của <dialog> bất kỳ,
  // bắt ở pha capture vì sự kiện này không nổi bọt): đang nợ thì trả nợ đúng 1 lần.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const elapsed = (Date.now() - lastRefreshAt.current) / 1000;
      if (owed.current || elapsed >= seconds) {
        if (modalOpen()) {
          owed.current = true;
          return;
        }
        refreshNow();
      } else {
        setLeft(Math.max(1, Math.ceil(seconds - elapsed)));
      }
    };
    const onModalClosed = () => {
      if (owed.current && !document.hidden && !modalOpen()) refreshNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('sdvico:modal-closed', onModalClosed);
    document.addEventListener('close', onModalClosed, true);
    // Lưới an toàn (2/10 tối): lỡ sự kiện đóng modal không tới (cờ kẹt vừa được tự dọn trong
    // modalOpen) thì mỗi 5 giây soát nợ một lần, khỏi đứng ở "0 giây" mãi.
    const watchdog = setInterval(onModalClosed, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('sdvico:modal-closed', onModalClosed);
      document.removeEventListener('close', onModalClosed, true);
      clearInterval(watchdog);
    };
  }, [seconds, refreshNow]);

  return (
    <span className="refresh">Tự làm mới sau {Math.max(left, 0)} giây</span>
  );
}
