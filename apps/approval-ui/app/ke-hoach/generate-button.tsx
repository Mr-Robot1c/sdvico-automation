'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Nút "🔄 BOSS chạy lại (giữ cài đặt)" — góc phải trang /ke-hoach. Ép BOSS sinh 7 hướng mới
// NGAY nhưng GIỮ NGUYÊN cài đặt tuần (mục tiêu + focus + nhóm chia sẻ). Khác với nút xanh
// "Lưu & sinh kế hoạch mới" ở khối Cài đặt tuần: nút đó LƯU cài đặt vừa gõ rồi mới sinh.
// User 26/8: đổi tên từ "Tạo kế hoạch ngay" cho đỡ nhầm với nút xanh. 26/8 lần 2 thêm "(giữ
// cài đặt)" vào label để user không phải rê chuột đọc tooltip mới biết khác gì.
export default function GenerateButton({ action }: { action: () => Promise<void> }) {
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
      <button className="btn ok" type="button" onClick={run} disabled={state === 'busy'}
        title="Ép BOSS chạy lại NGAY, giữ nguyên cài đặt tuần (mục tiêu + focus + nhóm chia sẻ). Dùng khi tri thức vừa cập nhật hoặc muốn refresh 7 hướng. Muốn ĐỔI mục tiêu/focus thì gõ vào ô Cài đặt tuần bên dưới rồi bấm nút xanh 'Lưu & sinh kế hoạch mới'.">
        {state === 'busy' ? '⏳ Đang chạy...' : '🔄 BOSS chạy lại (giữ cài đặt)'}
      </button>
      {state === 'done' ? <span className="save-note">✓ Xong</span> : null}
      {state === 'err' ? <span className="err-note">Lỗi, thử lại</span> : null}
    </div>
  );
}
