import { redirect } from 'next/navigation';

// Tổng quan GỘP với Bảng bài viết thành một trang /noi-dung (user 21/8 chiều: "tổng quan
// sẽ kết hợp với bài viết, dựa trên cái hình để thiết kế theo"). Giữ route cũ cho link
// đã lưu không chết.
export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/noi-dung');
}
