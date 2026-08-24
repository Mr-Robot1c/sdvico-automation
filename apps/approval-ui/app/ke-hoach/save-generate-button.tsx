'use client';
import { useFormStatus } from 'react-dom';

// Nút submit cho form "Lưu & sinh kế hoạch mới". Dùng useFormStatus để hiện trạng thái
// ĐANG CHẠY — sinh kế hoạch gọi Gemini mất 30 giây tới 2 phút, không có indicator thì
// người dùng tưởng đứng máy rồi bỏ đi / F5 giữa chừng (user 24/8: "bấm mà không cập nhật").
export default function SaveGenerateButton() {
  const { pending } = useFormStatus();
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn ok" type="submit" disabled={pending} style={{ minWidth: 210 }}>
        {pending ? '⏳ Đang sinh kế hoạch...' : '💾 Lưu & sinh kế hoạch mới'}
      </button>
      <span className="sub">
        {pending
          ? 'BOSS đang gọi AI viết hướng đi — chờ 30 giây tới 2 phút, ĐỪNG rời trang hay F5.'
          : 'Sau khi lưu, kế hoạch tuần được sinh lại và áp ngay theo mục tiêu + tập trung ở trên.'}
      </span>
    </div>
  );
}
