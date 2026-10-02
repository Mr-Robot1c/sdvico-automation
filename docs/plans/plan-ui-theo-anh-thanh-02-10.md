# PLAN: Sửa giao diện theo 4 ảnh chụp màn hình Thanh đánh dấu đỏ, 2/10 chiều

Thanh (người vận hành) chụp 4 trang prod và ghi chú đỏ từng chỗ. Quy tắc nội bộ: "sửa UI của X = sửa riêng X, không đụng bố cục toàn trang". Làm đúng 10 mục, không mở rộng.

## Ảnh 1: /tong-quan
1. Slogan dưới logo ở `app/root-shell.tsx` đổi thành "Nghề cá thịnh vượng" (không viết thường hết).
2. Link trình bày dạng nút (class `.btn`, ví dụ "Duyệt bài", "Sửa lịch đăng") bỏ gạch chân, cả hover. Link chữ trong câu giữ gạch chân.
3. "Load page hơi chậm": `app/tong-quan/page.tsx` gom các truy vấn độc lập vào `Promise.all`, giữ nguyên logic. Ghi rõ số truy vấn gom được.

## Ảnh 2: /khach-hang
4. Khối đầu trang gom thành thẻ thống kê (số to, nhãn nhỏ). "Theo SP" và "Câu khách hỏi" vào details gọn. Gợi ý focus giữ 1 dòng nổi nền vàng nhạt.
5. Hàng nút trên cùng (Thêm khách, Dọn tin trùng, Xem Rác, Kho hỏi đáp) style thành nút rõ, không gạch chân.
6. Dãy tab lọc có nhãn bước đi kèm số, theo đúng status trong code.
7. Nút "Lưu" và "Xoá" ở dòng khách cùng chiều cao, cùng padding, thẳng hàng.

## Ảnh 3: /seo
8. Cột Ý định khối "Từ khóa mới thêm" không hiện mã thô. Dùng một map nhãn tiếng Việt chung ở `app/labels.ts` (cả /tu-khoa). Mã lạ hiện nguyên bản.
9. Link "mở sitemap" trong Sức khỏe SEO đổi thành nút chuẩn, mở tab mới.

## Ảnh 4: /kenh
10. Hàng link cuối mỗi thẻ kênh ghim đáy thẻ, 2 link căn đều 2 đầu, bỏ gạch chân.

## Ràng buộc
- Không đổi dữ liệu hay hành vi duyệt, không thêm dependency, chữ UI tiếng Việt.
- Không đụng lại phần của ee823ae (details /ke-hoach, phân trang /tu-lieu, /ket-noi, nhãn Đánh dấu đã chia, dòng hướng dẫn Chạm N của /khach-hang).
- Verify bằng `tsc --noEmit` và `next build` với env giả.
