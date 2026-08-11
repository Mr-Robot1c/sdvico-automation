# Nghiệp vụ tuyển dụng SDVICO: vị trí, phân nhóm và phân luồng kênh

> Xác định bài toán tuyển dụng của SDVICO và cách chọn kênh đăng tin, thu CV cho từng nhóm vị trí.
> Đọc cùng `docs/app-map/tuyen-dung.md` và `CLAUDE.md`.

## 1. Bài toán

SDVICO là công ty thiết bị và giải pháp cho ngành biển, thủy sản, trụ sở Vũng Tàu. Nhu cầu tuyển dụng trải trên ba loại người rất khác nhau: thợ kỹ thuật hiện trường ở Vũng Tàu, nhân viên kinh doanh hiểu ngành, và nhân sự chuyên môn văn phòng ở Hồ Chí Minh. Mỗi loại tìm việc ở kênh khác nhau, nên đăng cùng một chỗ cho mọi vị trí là lãng phí và tuyển không đúng người.

Mục tiêu hệ thống: sinh mô tả công việc, đăng đúng kênh theo nhóm, thu CV về một luồng, chấm và xếp hạng bằng AI, người quyết ai đi tiếp, máy soạn thư mời, người bấm gửi. Việc làm ở HCM hoặc Vũng Tàu nên ưu tiên ứng viên gần đó.

## 2. Danh mục vị trí, chia bốn nhóm

**Nhóm A. Kỹ thuật, lắp đặt (hiện trường, địa phương)**
- Kỹ thuật viên lắp đặt thiết bị giám sát hành trình tàu cá
- Kỹ thuật viên điện tử viễn thông
- Kỹ thuật viên lắp đặt và bảo trì máy lọc nước biển
- Nhân viên hỗ trợ kỹ thuật và bảo hành hiện trường

**Nhóm B. Kinh doanh, thị trường**
- Nhân viên kinh doanh thiết bị hàng hải
- Nhân viên kinh doanh dầu nhớt PVOIL
- Nhân viên chăm sóc khách hàng, tổng đài

**Nhóm C. Chuyên môn, văn phòng (bằng cấp cao hơn)**
- Kỹ sư điện tử viễn thông
- Nhân viên Marketing và nội dung số
- Kế toán
- Nhân viên hành chính nhân sự

**Nhóm D. Kho vận, vận hành**
- Nhân viên kho, giao nhận

## 3. Phân luồng kênh theo nhóm

| Nhóm | Chân dung ứng viên | Kênh đăng và thu CV phù hợp |
|---|---|---|
| A. Kỹ thuật | Thợ nghề, cao đẳng/trung cấp, ở Vũng Tàu và lân cận | Facebook nhóm việc làm Vũng Tàu và nhóm ngành tàu cá, Việc Làm 24h, Zalo OA, dán tin tại cảng |
| B. Kinh doanh | Có kinh nghiệm bán hàng, hiểu ngành biển | TopCV, Việc Làm 24h, Facebook |
| C. Chuyên môn văn phòng | Đại học, kỹ sư, kế toán, marketing | TopCV, VietnamWorks, LinkedIn (vị trí kỹ sư, quản lý) |
| D. Kho vận | Lao động phổ thông | Facebook địa phương, Việc Làm 24h, Zalo OA |

Nguyên tắc chung:
- Ưu tiên địa điểm gần: việc ở Vũng Tàu ưu tiên ứng viên Vũng Tàu, Bà Rịa, Đồng Nai; việc ở HCM ưu tiên HCM, Bình Dương, Đồng Nai, Long An. JD Analyzer tự rút địa điểm và xếp ưu tiên.
- Thu CV về một luồng: dù đăng ở kênh nào, ứng viên gửi CV về hộp thư tuyển dụng, hệ thống nạp và chấm chung.
- Chỉ dùng kênh chính thức, tài khoản chính danh công ty. Không cào dữ liệu ứng viên trên mạng (ToS nền tảng, Nghị định 13, Phần 6 kế hoạch).

## 4. Luồng hoạt động

```
Vị trí (theo nhóm) -> JD Analyzer (tiêu chí, địa điểm ưu tiên, từ khóa)
   -> Đăng tin đúng kênh của nhóm (bán tự động, người bấm gửi cuối)
   -> Ứng viên gửi CV về hộp thư -> Nạp CV -> Chấm và đánh giá (AI)
   -> Xếp hạng -> Người chọn ai vào phỏng vấn
   -> Máy soạn câu hỏi + thư mời (xưng hô theo giới tính) + tự sắp lịch
   -> Người duyệt và gửi
```

## 5. Kiểm chứng khả năng AI trên dữ liệu thật

Giai đoạn test: chưa gửi gì thật ra ngoài, nhưng đã lấy CV thật vào hộp thư để xác nhận AI hoạt động đúng. Đã kiểm trên ba CV thật:
- Chấm điểm theo thang cố định, điểm trục hợp lý, CV sơ sài cho điểm thấp.
- Đánh giá: tóm tắt, điểm mạnh, điểm cần làm rõ, không bịa.
- Viết thư mời và câu hỏi phỏng vấn bám đúng nội dung CV.

Để mở rộng dữ liệu thật: gửi thêm CV thật vào hộp thư test, hệ thống tự nạp và chấm ở lượt gần nhất.

Cập nhật lần cuối: 11/8/2026.
