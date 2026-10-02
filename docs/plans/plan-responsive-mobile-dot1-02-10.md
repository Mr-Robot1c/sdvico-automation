# Plan: Responsive mobile đợt 1 + quick win theo bản review UX 2/10

Bối cảnh: reviewer (đồng nghiệp Thanh) chấm mobile 3/10. Số đo thật ở 375x812: header và menu chiếm khoảng 391px trước khi thấy nội dung, bảng Khách hàng rộng khoảng 1.160px, nút chỉ cao 23 đến 32px, bot nổi che nội dung. Đợt này chỉ làm responsive và quick win. Không đụng cấu trúc Tổng quan, không làm drawer Khách hàng (đợt sau, chờ Thanh gật).

Mốc breakpoint duy nhất: dưới 768px là điện thoại (`@media (max-width: 767px)`). Từ 768px trở lên giữ nguyên.

## Hạng mục

- W1. Sidebar nội bộ thành menu trượt trên mobile. `root-shell.tsx` có state `navOpen`, thanh `.m-bar` (nút menu 44px, chữ SDVICO, tên trang, nút quay lại, đổi nền), lớp mờ `.m-backdrop`. Đóng khi đổi pathname, bấm lớp mờ, bấm link trong menu, phím Esc. `aria-expanded`, `aria-controls`.
- W2. Cỡ bấm ngón tay: `.btn`, `.btn.sm`, `.chip`, `.icon-btn`, submit, input/select/textarea cao tối thiểu 44px, chữ ô nhập 16px. Chỉ trong media mobile.
- W3. Bảng rộng cuộn riêng: class `.table-scroll` thêm vào mọi `.tablewrap` ở khach-hang, ke-hoach, do-luong, do-luong/tuan, video/da-dang, seo, bảng modal kế hoạch ở noi-dung. Mobile: `body` overflow-x hidden, `main` overflow-x clip.
- W4. Bot gọn: chip "Bot đã học" ẩn hẳn dưới 768px, nút Hỏi bot thành nút tròn 48px, cách mép 12px cộng safe-area; `main` chừa 72px đáy.
- W5. Mô tả dưới tiêu đề (`.head-row > div > h1 + .sub`) clamp 1 dòng trên mobile, bấm vào mở rộng. Một handler chung trong root-shell, áp cho mọi trang nội bộ cùng khung markup (gồm 6 trang chính: tong-quan, khach-hang, hang-doi, ke-hoach, video, seo).
- W6. /video khối Luồng làm video: `.flow-steps` flex wrap chia đều, hàng cuối giãn kín, hết ô lẻ trống.
- W7. /hang-doi modal Xem bài viết: thanh hành động dính đáy (`ViewModal` prop `footer`, `DecideActions` prop `formId`), nút Từ chối và Duyệt submit đúng form duyệt qua thuộc tính `form`.

## Ràng buộc

Trang public và /blog không đụng. Desktop không đổi, trừ W6 và W7. Không thêm dependency. Verify: `npx tsc --noEmit` và `npx next build` trong `apps/approval-ui`.
