import { redirect } from 'next/navigation';

// Đo lường đã gộp vào Quản lý bài viết (user 21/8) thành tab riêng. Giữ route cũ để link
// cũ (bookmark, thông báo bot) không chết. Trang con /do-luong/tuan vẫn là trang riêng.
export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/noi-dung?loai=do-luong');
}
