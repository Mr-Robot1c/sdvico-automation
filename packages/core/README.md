# packages/core

Thư viện dùng chung cho cả phần Tuyển dụng và Marketing. Viết một lần, hai bên dùng chung. Làm ở chiều Ngày 1 và củng cố ở Ngày 6.

Thành phần:

- Client Supabase khởi tạo từ biến môi trường.
- Hàm ghi `run_log` cho mỗi thao tác, kèm ảnh chụp khi lỗi.
- Hàm đẩy mục vào `approval_queue`, trạng thái mặc định pending.
- Browser runner theo thiết kế bắt buộc ở kế hoạch Phần 6:
  - Hàng đợi tuần tự theo từng tài khoản.
  - Giữ hồ sơ trình duyệt theo tài khoản, không đăng nhập lặp.
  - Bộ đếm hạn mức ngày lưu trong cơ sở dữ liệu.
  - Công tắc dừng khẩn đọc từ bản ghi cấu hình, kiểm trước mỗi thao tác.
  - Chế độ diễn tập, dừng trước nút gửi cuối cùng, chụp màn hình.
  - Gặp rào chắn thì dừng và đẩy vào approval_queue, không phá rào.
