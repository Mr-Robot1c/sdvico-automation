# Tab Bản tin nhúng Studio và sidebar nhóm đóng/mở (2/10, lệnh Thanh và sếp tối 2/10)

## Việc 1: trang /ban-tin nhúng Studio Bản tin
Studio Bản tin là gói độc lập chạy trên máy người biên tập tại `http://localhost:8899` (bản nội bộ) và `http://localhost:8899/ts/` (bản thủy sản). CSP của Studio đã cho phép iframe từ https://sdvico-mktit.vercel.app.
- Kiểm sống: `GET http://localhost:8899/api/health` trả `{ ok: true }`, gọi bằng fetch từ trang https (endpoint đã mở CORS và Private Network Access).
- Sống: nhúng `?nhung=1`. Chưa sống: nút `bantin-studio://mo/` (bản thủy sản `bantin-studio://mo/ts/`), dòng hướng dẫn, tự kiểm lại mỗi 2 giây rồi tự chuyển sang iframe.
- Hai tab con: Bản tin thủy sản (mặc định, dùng hằng ngày) và Bản tin nội bộ. Tab đã mở giữ iframe sống (ẩn bằng `hidden`), khỏi mất việc dựng dở khi chuyển tab. Đã sống thì dừng hỏi health.
- File: `apps/approval-ui/app/ban-tin/page.tsx` (server, chỉ tiêu đề), `studio-embed.tsx` (client), route `/ban-tin` trong `lib/routes.ts` (cha là /video). Không đụng middleware (trang nội bộ sau đăng nhập).

## Việc 2: sidebar nhóm đóng/mở
- `app/nav.tsx` viết lại. Mỗi mục gốc là một nhóm: hàng cha (icon, nhãn, chevron). Bấm NHÃN sang trang gốc và nhóm tự mở. Bấm CHEVRON chỉ đóng/mở.
- Mục con thụt vào, chữ 13px, có đường kẻ dọc nhạt. Nhãn con lấy từ `ROUTES`.
- Mặc định tất cả thu gọn, trừ nhóm chứa trang đang đứng (mục con sáng theo khớp dài nhất trên toàn menu, nên /do-luong/tuan không làm sáng /do-luong). Trạng thái nhớ trong sessionStorage theo từng nhóm (`sdvico-nav-open:<nhóm>`). Đổi trang thì nhóm chứa trang tự mở lại.
- Tuyển dụng và Hệ thống là nhóm chỉ đóng/mở (cả hàng là nút). Blog SDVICO vẫn mở sang sdvico.vn/blog ở tab mới.
- Menu trượt mobile dùng chung Nav, chevron là button nên bấm không đóng drawer, bấm link thì drawer đóng như cũ (root-shell không đổi).
- Hiệu ứng grid-template-rows 0fr/1fr kèm opacity, tắt khi prefers-reduced-motion. CSS ở khối cuối `globals.css`.
- Chưa làm (việc sau): badge số đỏ cạnh nhóm như ảnh mẫu, cần truy vấn dữ liệu trong nav.

## Cấu trúc nhóm cuối
Tổng quan: Bảng bài viết, Kế hoạch, Hàng đợi duyệt. Khách hàng: Kho hỏi đáp. Video: Xưởng sản xuất, Kho tư liệu, Video đã đăng, Studio bản tin. SEO: Kho từ khóa, Nguồn dữ kiện, Quảng cáo, Bài SEO đã đăng. Kênh: Đo lường ngày, Báo cáo tuần, Kết nối. Agent: Nguồn học dữ liệu. Tuyển dụng (khi không marketingOnly): Hồ sơ ứng viên, Vị trí tuyển dụng. Hệ thống: Quy tắc, Blog SDVICO.

## Kiểm
tsc sạch, `next build` xanh. Kiểm bằng trình duyệt ở bản dev: chevron đóng/mở, bấm nhãn sang trang và mở nhóm, mobile 375px drawer có accordion, sessionStorage ghi đúng. Khung iframe bị CSP của Studio chặn khi nhúng từ localhost:3077 (đúng thiết kế, chỉ cho vercel.app), nên cần soi lại sau deploy.
