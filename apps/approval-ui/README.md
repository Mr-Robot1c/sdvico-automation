# apps/approval-ui

Giao diện duyệt, Next.js trên Vercel. Đây là nơi thực thi điều cấm 1 và 2 ở phía con người:
mọi thư và bài đăng chờ ở `approval_queue`, người bấm mới chuyển sang trạng thái approved.

## Các trang

| Đường dẫn | Việc |
|---|---|
| `/` | Duyệt và gửi. Hàng đợi chờ duyệt, xem poster, sửa nội dung, bấm Duyệt hoặc Xóa |
| `/tao-jd` | Tạo JD bốn phiên bản bằng Groq, thêm vị trí vào danh sách đang tuyển |
| `/dang-tin` | Vị trí đang tuyển, soạn bài, hẹn giờ đăng, xem tin đã đăng |
| `/ho-so` | Hồ sơ ứng viên, điểm chấm, đưa vào phỏng vấn, quyết nhận hoặc từ chối |
| `/lich` | Lịch phỏng vấn |
| `/cai-dat` | Thương hiệu, logo, màu poster, xem trước poster |
| `/phong-van/[token]` | Trang công khai cho ứng viên tự chọn khung giờ. Không qua cổng mật khẩu, xác thực bằng token trong link |
| `/api/cron/*` | Ba worker chạy nền: soạn bài, đăng Facebook, đăng LinkedIn. Bảo vệ bằng `CRON_SECRET` |
| `/api/poster-preview` | Xem trước poster khi chỉnh cấu hình |

## Chạy tại máy

1. Áp migration Supabase trước, xem `supabase/README.md`.
2. Tạo file `.env.local` trong thư mục này. Tối thiểu cần `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `APP_PASSWORD`. Giải thích từng biến ở `.env.example` ngoài gốc repo. Không commit file này.
3. `npm install` ở gốc dự án, rồi `npm run ui:dev`, mở http://localhost:3000.

## Vài điểm cần biết khi sửa

- Font poster nằm ở `assets/fonts`, đọc bằng `readFileSync` lúc chạy. Vì vậy `next.config.mjs`
  phải khai `experimental.outputFileTracingIncludes` để Vercel đóng gói font vào hàm serverless.
  Next 14 chỉ đọc khóa này trong `experimental`, đặt sai chỗ thì poster lỗi ENOENT trên production.
- `vercel.json` để rỗng có chủ đích. Gói Hobby không cho đặt cron dưới một ngày, lịch chạy nằm ở GitHub Actions.
- Middleware cho `/api/cron/*` và `/phong-van/*` đi vòng cổng mật khẩu. Hai nhóm này tự lo xác thực riêng.

## Lưu ý bảo mật, cần làm trước khi dùng thật

Hiện app dùng khóa service role ở phía máy chủ để đọc ghi dữ liệu ứng viên, và chỉ có một lớp
HTTP Basic Auth dùng chung một mật khẩu (`APP_USER` và `APP_PASSWORD`). Không đặt `APP_PASSWORD`
thì app tự khóa ở môi trường thật để khỏi lộ dữ liệu.

Trước khi có CV thật của ứng viên, phải thay bằng đăng nhập nội bộ theo từng người, ví dụ
Supabase Auth, để biết ai đã xem và ai đã bấm. Khóa service role chỉ nằm ở biến môi trường phía
máy chủ, không bao giờ đẩy xuống trình duyệt. Điều cấm 6.
