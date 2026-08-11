import { redirect } from 'next/navigation';

// Đã gộp Vị trí vào trang Vị trí & Đăng tin. Chuyển hướng để không gãy link cũ.
export default function Page() {
  redirect('/dang-tin');
}
