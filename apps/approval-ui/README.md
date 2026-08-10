# apps/approval-ui

Giao diện duyệt, Next.js trên Vercel.

Bản tối giản làm ở chiều Ngày 1: danh sách chờ, nút Duyệt, nút Từ chối, ô ghi chú. Đọc và ghi bảng `approval_queue`.

Đây là nơi thực thi điều cấm 1 và 2 ở phía con người. Mọi thư và bài đăng chờ ở đây, người bấm mới chuyển sang trạng thái approved.

## Chạy tại máy

1. Áp migration Supabase trước, xem `supabase/README.md`.
2. Tạo file `.env.local` trong thư mục này với `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`. Không commit file này.
3. `npm install` ở gốc dự án, rồi `npm run ui:dev`, mở http://localhost:3000.

## Lưu ý bảo mật, cần làm trước khi dùng thật

Bản tối giản này dùng khóa service role ở phía máy chủ để đọc ghi `approval_queue`, chưa có đăng nhập. Trước khi triển khai thật phải thêm một lớp đăng nhập nội bộ, ví dụ Supabase Auth, để chỉ nhân sự công ty vào được. Khóa service role chỉ nằm ở biến môi trường phía máy chủ, không bao giờ đẩy xuống trình duyệt.
