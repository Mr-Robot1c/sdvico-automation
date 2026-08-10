# .github/workflows

Lịch chạy bằng GitHub Actions schedule. Không dùng n8n, không dùng Make.

Chiều Ngày 1 cần một Action chạy thử theo lịch, sinh một mục chờ duyệt, để chốt được mốc cuối ngày: một tác vụ theo lịch tạo một mục trong approval_queue, người duyệt bấm, trạng thái đổi trong cơ sở dữ liệu.

Khóa và mật khẩu đặt trong GitHub Secrets, không viết thẳng vào file workflow.
