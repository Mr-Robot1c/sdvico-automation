import { redirect } from 'next/navigation';

// Bình luận đã chuyển thành tab trong khu vực Kênh mạng xã hội. Giữ đường dẫn cũ để không
// hỏng liên kết/bookmark, chuyển hướng sang vị trí mới.
export default function Page() {
  redirect('/kenh/binh-luan');
}
