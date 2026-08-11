---
name: product-boundary
description: Hàng rào ranh giới sản phẩm SDVICO. Kích hoạt khi sinh hoặc rà nội dung Marketing (mkt-draft, mkt-brief, tin nhắn, kịch bản video) để không bịa model, thông số, và không nhận vơ phần mềm đối tác.
---

# product-boundary — ranh giới sản phẩm khi viết nội dung

> Nguồn sự thật cho con người. Danh sách thông số đã duyệt ở `packages/marketing/src/product-facts.mjs`.
> Bộ quét tự động ở `packages/marketing/src/compliance.mjs` phải khớp các quy tắc file này.
> Đọc `CLAUDE.md` trước. Điều cấm 4 và 5 áp dụng ở đây.

## Mục đích

SDVICO phân phối thiết bị hàng hải, không sở hữu phần mềm của đối tác. Skill này là hàng rào để nội dung sinh ra không bịa và không nói sai công ty bán gì.

## Ba quy tắc bắt buộc

1. Chỉ nêu model và thông số CÓ trong `product-facts.mjs`. Thông số không có trong nguồn đã duyệt thì không được nêu con số, phải nói chung chung. Không tự suy ra, không lấy từ trí nhớ, không phỏng đoán. Đây là Điều cấm 5.
2. Không mô tả phần mềm đối tác như của SDVICO. Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya là của đối tác. Cách nói đúng là "SDVICO phân phối thiết bị tương thích với...", không phải "phần mềm của SDVICO". Đây là Điều cấm 4.
3. Không hứa pháp lý tuyệt đối. Không viết kiểu chắc chắn không bị phạt, chắc chắn được cơ quan nhà nước chứng nhận, khi chưa có bằng chứng.

## Được nói

- SDVICO phân phối, lắp đặt, bảo trì thiết bị giám sát hành trình và thiết bị hàng hải đạt chuẩn.
- Dịch vụ hỗ trợ khi mất kết nối, có mặt tận bến, tư vấn chọn thiết bị hợp quy định.
- Thiết bị tương thích với hệ thống của đối tác, nói ở mức tương thích, không nhận vơ.

## Không được nói

- Tên model và thông số chưa có trong `product-facts.mjs`, ví dụ chuẩn kháng nước, công suất, dung lượng pin, giao thức tín hiệu, khi chưa được Phòng Kinh doanh xác nhận.
- Phần mềm của Viettel, VNPT, Vishipel, Thuraya là của SDVICO.
- Giá, cước, tên khách hàng, đối tác, giải thưởng khi chưa có nguồn xác nhận.

## Khi thiếu dữ liệu

Nguồn `product-facts.mjs` đang rỗng cho tới khi Phòng Kinh doanh điền. Trong lúc đó, mọi chỗ cần thông số cụ thể phải viết chung chung, ví dụ "thiết bị giám sát hành trình đạt chuẩn" thay vì nêu chuẩn kháng nước cụ thể. Thà nói chung còn hơn bịa.

## Nối vào máy

Bộ quét `compliance.mjs` tự đối chiếu bản nháp với `product-facts.mjs`. Thông số không khớp nguồn thì gắn cảnh báo amber, nhắc đối tác cũng amber, chạm quy định nhà nước thì gắn cờ đỏ và bắt buộc cấp quản lý duyệt. Mọi bản nháp vẫn qua hàng đợi duyệt trước khi đăng.
