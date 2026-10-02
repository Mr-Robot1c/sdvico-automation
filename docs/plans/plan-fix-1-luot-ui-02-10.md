# Fix 1 lượt giao diện theo sổ QA toàn hệ thống 2/10

Nguồn: Thanh lệnh "test hết, ghi chú, fix 1 lượt" (2/10). Khảo sát trên bản prod thật. Làm trên nền 90ddb56 (đợt UI 1: blog ISR, ảnh lazy, auto-refresh, không sửa ngược).

Ràng buộc: không đổi hành vi duyệt, đăng, dữ liệu; không thêm dependency; văn phong UI không gạch dài, không mũi tên (CLAUDE.md mục 4).

## F1. /ke-hoach gấp danh sách nhóm trong Lịch đăng cố định
Hiện trạng: mỗi ô bài render nguyên danh sách khoảng 40 nhóm Facebook, 7 ngày x 4 bài, hơn 1.100 mục DOM, text trang trên 50.000 ký tự.
Fix: phần "Ghim nhóm" của mỗi ô bọc vào `<details>`. Summary "Theo lô tự rút (4 nhóm/buổi)" khi chưa ghim, "Tên nhóm đã ghim" khi có ghim. Select vẫn nằm trong form nên lưu như cũ.
File: app/ke-hoach/posting-plan-form.tsx, app/globals.css.

## F2. /tu-lieu phân trang như Xưởng
PAGE_SIZE 48, nút "Hiện thêm" tăng `?n=`. Bộ đếm ảnh và video giữ số TỔNG thật.
File: app/tu-lieu/page.tsx.

## F3. /ket-noi hai thẻ hiển thị sai
a) Facebook: Page chính (token REAL) đứng đầu và ghi "(Page chính)", page token thường ghi "(kênh phụ, test)".
b) TikTok: chữ đúng flow (API đăng đã bỏ 26/8, chỉ xuất tay), trạng thái "Xuất tay" thay "Sẵn sàng".
File: lib/platform-status.ts, app/ket-noi/page.tsx.

## F4. Nút "Đã chia" trùng chữ với trạng thái "✓ Đã chia"
Nút hành động đổi nhãn "Đánh dấu đã chia", trạng thái giữ "✓ Đã chia". Chỉ đổi nhãn.
File: app/tong-quan/share-lot-today.tsx, app/noi-dung/share-groups.tsx và các câu hướng dẫn nhắc tên nút.

## F5. /khach-hang gọn hướng dẫn lặp mỗi dòng khách
Gom 2 câu hướng dẫn còn một dòng ngắn; mục tiêu đầy đủ của nháp (draft.note) đưa vào details nhỏ, giải thích chi tiết đặt ở title. Không đổi dữ liệu nháp.
File: app/khach-hang/draft-reply-button.tsx.

## F6. /video cột "Ghép từ" trống với video content tự gắn vào bài
Thêm đường nối theo id asset (brief.assets.video, video_h, video_v) bên cạnh nối theo tiền tố đường dẫn, ưu tiên bên có video_timeline.
File: app/video/page.tsx.

## Kiểm
`npx tsc --noEmit` và `npx next build` trong apps/approval-ui (env giả, trang cần Supabase hiển thị rỗng là chấp nhận).
