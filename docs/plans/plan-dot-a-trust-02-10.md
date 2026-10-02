# Plan: Đợt A theo audit production 2/10, niềm tin, copy đúng sự thật, số liệu đối chiếu được

Bối cảnh: audit toàn bề mặt production (30+ route) trước khi đóng gói chào đối tác. Các mục dưới đây là P0 "trust".

Sự thật nghiệp vụ để viết copy:
- Mô hình là MÁY SOẠN NHÁP, NGƯỜI GỬI TAY (điều cấm 1). Cụm "Kênh online tự trả lời và tự chốt" nghĩa là NGƯỜI trực kênh (không chuyển phòng Kinh doanh, lệnh sếp 9/9), KHÔNG phải bot tự nhắn.
- Facebook: máy đăng qua token lên PAGE PHỤ (SDViCo - Thiết bị tàu cá, test); bài lên Page chính SDVICO VN do người đăng tay rồi bấm "Ghép link FB chính". YouTube: máy tự đăng kênh SDVICO khi Duyệt. TikTok: xuất tay.

## A1. Sửa copy mâu thuẫn ở Khách hàng
Grep "tự trả lời và tự chốt" (mô tả đầu khach-hang, dòng Cần làm ở tong-quan). Viết rõ chủ thể: người trực kênh online; máy chỉ đọc, lưu và soạn nháp, không tự gửi.

## A2. Hiện ĐÍCH ĐĂNG cạnh nút Duyệt
Thẻ duyệt hang-doi (và thẻ Chờ duyệt của Bảng bài viết): dòng nhỏ theo channels của payload. Hằng số một chỗ dùng chung (lib/publish-targets.ts).

## A3. Số liệu đối chiếu được
a) Ghi phạm vi thật cạnh số (tong-quan Tiến độ, noi-dung chip + board).
b) Bài CÓ mkt_posts published thì badge chính là "Đã đăng" kể cả khi phiếu gần nhất rejected, kèm chú "phiếu gần nhất: Từ chối". Không đổi DB, không đổi hành vi đăng.
c) Phép đếm sai thật thì sửa và ghi rõ.

## A4. /quang-cao nói đúng trạng thái
Khối đầu trang: module sẵn sàng cấu hình, chưa gắn Pixel/GA4 nên chưa đo chuyển đổi tự động; đợt tháng 9/2026 đo thủ công qua thẻ ad_id.

## A5. Nhất quán public
a) app/not-found.tsx tiếng Việt. b) Email yêu cầu xóa dữ liệu đổi sang congnghebien.sdvico@gmail.com. c) tel: không khoảng trắng. d) Hotline 0254: rà (xem báo cáo, đang là quyết định sếp 28/8). e) /xoa-du-lieu vào danh sách public của root-shell. f) CTA Messenger sdvico.tbtc: KHÔNG ĐỔI, chỉ liệt kê.

## A6. Modal xem trước ở /noi-dung có footer Duyệt/Từ chối
Cùng cơ chế ViewModal footer + DecideActions formId của 32d1ace, cho thẻ Chờ duyệt ở Bảng bài viết.

## Ràng buộc
Không bịa số/tên; chữ UI tiếng Việt không gạch dài, không mũi tên; không đổi hành vi đăng/duyệt; không đụng responsive 32d1ace. Verify: tsc + next build.
