import { redirect } from 'next/navigation';

// Mở app là thấy Tổng quan (user 21/8: "đưa lên cái đầu tiên"). Hàng đợi duyệt đầy đủ
// (HR + cảnh báo hệ thống) chuyển về /hang-doi; duyệt bài marketing nằm ngay trong
// Bảng bài viết (/noi-dung).
export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/tong-quan');
}
