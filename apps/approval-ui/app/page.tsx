import { redirect } from 'next/navigation';

// Mở app là thấy Tổng quan (user 21/8: "đưa lên cái đầu tiên"). Tổng quan gộp với Bảng
// bài viết tại /noi-dung (stat + kênh kết nối + kanban theo mẫu user). Hàng đợi duyệt
// đầy đủ (HR + cảnh báo hệ thống) ở /hang-doi.
export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/noi-dung');
}
