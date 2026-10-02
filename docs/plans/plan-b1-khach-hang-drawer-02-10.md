# Đợt B1: trang Khách hàng mobile thành danh sách thẻ gọn và ngăn chi tiết (2/10)

Thanh gật theo audit lần 3: /khach-hang trên điện thoại chấm 4,5/10, bảng rộng khoảng 1.160px trong khung 332px, mỗi hàng nhét tin nhắn, nháp, trạng thái, ghi chú và 7 nút nên phải kéo ngang liên tục. Kết luận: lỗi chọn component, bảng máy tính không hợp điện thoại.

## Thiết kế đã duyệt
- Dưới 768px: ẩn bảng, hiện danh sách thẻ. Mỗi thẻ gồm tên và nguồn, giờ, câu hỏi cắt 2 dòng, chip trạng thái, nhãn "Có nháp chờ gửi" nếu có nháp. Cả thẻ là một nút cao tối thiểu 44px.
- Chạm thẻ mở ngăn chi tiết trượt từ phải, rộng khoảng 92% màn. Nút Đóng 44px, đóng bằng lớp mờ hoặc phím Esc. Trong ngăn có đủ nội dung của đúng hàng đó: câu hỏi đầy đủ, nháp Chạm N với Chép và Đã gửi tay, các bước trạng thái, ghi chú và Lưu, Lưu hỏi đáp, Soạn trả lời.
- Nút Xoá nằm sau nút "⋯ Khác" trong ngăn, bấm ⋯ mới hiện Xoá. Hành vi xoá giữ như cũ (bấm là xoá, theo lệnh 7/9).
- Máy tính (từ 768px) giữ nguyên bảng.

## Cách dựng đã chọn
Không clone DOM, không đổi server action. Trang vẫn server render nguyên các ô của hàng như cũ. Bọc mỗi `<tr>` bằng client component `LeadRow` (khach-hang/lead-row.tsx), component này thêm hai ô phụ NẰM CUỐI hàng để không làm lệch các selector `nth-child` của bảng máy tính:
1. ô tóm tắt `.lead-sum-cell`: nút thẻ gọn, chỉ hiện dưới 768px;
2. ô đầu ngăn `.lead-drawer-head`: tên khách và nút Đóng, chỉ hiện khi ngăn mở.

Khi mở, chính `<tr>` đó chuyển thành ngăn bằng CSS (`position: fixed`, trượt từ phải), kèm một hàng lớp mờ `.lead-backdrop-row` chỉ render khi mở. Các ô gốc thêm `data-label` để CSS in nhãn từng khối trong ngăn. Ô Xoá bọc `LeadMore` (Fragment: một nút ⋯ ẩn trên máy tính, nút Xoá vẫn là con trực tiếp của ô nên rule `td > .btn.sm` của bảng không đổi).

Bẫy gặp lúc làm: không được dùng `STEP_LABEL` (export từ file 'use client') trong server component, sẽ lỗi "Could not find the module ... STEP_LABEL" lúc render. Nhãn trạng thái được tra bên trong LeadRow.

## File đổi
- apps/approval-ui/app/khach-hang/lead-row.tsx (mới)
- apps/approval-ui/app/khach-hang/page.tsx (bọc hàng, data-label, class lead-wrap, ô Xoá qua LeadMore)
- apps/approval-ui/app/globals.css (khối DOT B1 cuối file)

## Kiểm
- Hình học bảng máy tính (vị trí và kích thước từng ô, 4 hàng mẫu, viewport 1024) giống hệt bản gốc trước và sau khi bọc.
- Mobile 375px: thẻ gọn, ngăn mở/đóng bằng nút, lớp mờ và Esc, nút Xoá chỉ hiện sau ⋯, không có cuộn ngang trang, trả focus về thẻ khi đóng.
- tsc sạch, next build xanh.
