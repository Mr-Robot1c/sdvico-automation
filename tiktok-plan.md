# KẾ HOẠCH TIKTOK CHO SDVICO

Trả lời câu hỏi: chuyển sang làm TikTok có được không, và làm thế nào cho đúng hệ thống đã dựng
(máy soạn, người bấm gửi) và đúng bảy điều cấm.

---

## 1. Có nên làm TikTok không. Kết luận thẳng

Nên, và hợp. TikTok là kênh B2C mạnh với bà con ngư dân và chủ tàu, vì họ xem video ngắn trên điện
thoại lúc rảnh. Đây đúng tệp người mua thực dụng, xem để giải quyết việc gấp (mất kết nối, gia hạn
cước, chọn thiết bị). Nội dung của mình vốn đã hợp video dọc ngắn.

Nhưng nói rõ hai điều để khỏi ảo tưởng:
- TikTok là kênh cho B2C. Nhóm B2B (doanh nghiệp, cảng cá, cơ quan quản lý) vẫn đi bằng website và
  email, không phải TikTok.
- Cỗ máy hiện đã sinh sẵn kịch bản video. Phần còn thiếu là dựng video thật và đăng, hai việc này có
  ràng buộc riêng, nói ở mục 5 và 6.

---

## 2. Đối tượng và người tham gia

Đối tượng xem (audience):
- Chính: ngư dân, chủ tàu, thuyền trưởng ở các tỉnh ven biển.
- Phụ: thợ máy, đại lý thiết bị, người nhà chủ tàu.
- Không nhắm qua TikTok: cơ quan quản lý và doanh nghiệp lớn, nhóm này để website và email.

Người tham gia vận hành (participants):
- Máy (cỗ máy nội dung): sinh kịch bản video từ từ khóa. Đã có.
- Người biên tập video: dựng video thật từ kịch bản, dùng tư liệu công ty và ffmpeg. Đây là vai mới
  cần có, không thay bằng AI được (xem mục 5).
- Người duyệt (cấp quản lý hoặc phụ trách marketing): duyệt kịch bản và duyệt video trước khi đăng.
  Nội dung chạm quy định phải cấp quản lý duyệt.
- Người đăng: bấm đăng lên TikTok. Vì lý do ở mục 6, bước đăng là người bấm, không phải máy tự đăng.

---

## 3. Đầu vào và đầu ra

Đầu vào (input):
- Kho từ khóa `mkt_keywords`, nhóm ý định dịch vụ và sự cố hợp TikTok nhất.
- Nguồn dữ kiện `product_facts`, để kịch bản không bịa thông số.
- Tư liệu thật trong `brand_assets`: cảnh quay tàu, biển, thiết bị thật, ảnh công ty sở hữu hoặc có
  giấy phép. Đây là nguyên liệu hình cho video.

Đầu ra (output):
- Kịch bản video 60 giây, đã có, nằm trong hàng đợi duyệt dạng định dạng video.
- Video thành phẩm dọc 9:16, do người biên tập dựng từ kịch bản và tư liệu thật.
- Tiêu đề và mô tả kèm thẻ, dẫn về tổng đài 1900 23 23 49.
- Sau khi đăng: lưu lịch sử vào `mkt_posts`, kéo số liệu lượt xem về `mkt_metrics` (khi nối đo lường).

---

## 4. Quy trình, bám nguyên tắc máy soạn người bấm gửi

Bước 1. Sinh kịch bản (tự động). Cỗ máy bốc từ khóa, sinh kịch bản video 60 giây bốn nhịp, đẩy vào
hàng đợi duyệt. Đã chạy được.

Bước 2. Duyệt kịch bản (người). Người phụ trách đọc kịch bản, sửa nếu cần, bấm Duyệt. Kịch bản chạm
quy định nhà nước thì cấp quản lý duyệt trước.

Bước 3. Dựng video (người biên tập). Lấy kịch bản đã duyệt, ghép cảnh thật từ `brand_assets`, thêm
phụ đề cháy chữ bằng Whisper có từ điển thuật ngữ, chèn nhận diện thương hiệu, xuất bản dọc 9:16.
Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép.

Bước 4. Duyệt video và đăng (người). Người duyệt xem video thành phẩm, bấm Duyệt. Sau đó người đăng
tải lên TikTok. Ghi lại vào `mkt_posts`.

Điểm mấu chốt: không có bước nào máy tự đăng video lên TikTok. Máy soạn kịch bản, người dựng, người
bấm đăng.

---

## 5. Định dạng video TikTok

- Dọc 9:16, dài 30 tới 60 giây. Ba giây đầu phải chạm nỗi đau hoặc câu hỏi gấp, nếu không người lướt
  qua ngay.
- Phụ đề cháy chữ toàn bộ, vì đa số xem tắt tiếng. Chữ to, đọc được ngoài nắng.
- Một video một thông điệp. Ví dụ: một video chỉ nói cách xử lý khi mất kết nối, một video khác nói
  gia hạn cước.
- Chốt bằng số tổng đài 1900 23 23 49 hiện to trên màn hình.
- Nhạc nền và hiệu ứng theo xu hướng TikTok để thuật toán đẩy, nhưng chỉ dùng nhạc trong thư viện
  được phép của TikTok, không lấy nhạc vi phạm bản quyền.

Về hình ảnh và video do AI tạo: KHÔNG dùng AI dựng ra hình thiết bị của SDVICO, vì đó là bịa hình
sản phẩm, bà con thấy một cái máy không có thật (Điều cấm 5). Dùng cảnh quay thật của công ty. AI chỉ
được dùng ở khâu kịch bản và phụ đề, không dựng hình sản phẩm giả.

---

## 6. Đăng lên TikTok: vì sao là bán tự động

Thứ tự ưu tiên bắt buộc theo kế hoạch: có API chính thức thì dùng API, không thì bán tự động, tuyệt
đối không dùng Playwright lách.

- TikTok có Content Posting API chính thức, nhưng bắt buộc đăng ký app và qua kiểm duyệt của TikTok
  mới được đăng thẳng lên tài khoản. App chưa duyệt chỉ đăng ở chế độ riêng tư. Xin duyệt mất thời
  gian và cần pháp nhân công ty.
- Tự động thao tác TikTok bằng Playwright là cấm. TikTok bắt bot rất gắt, một lần bị đánh dấu là mất
  tài khoản. Đây đúng trường hợp Phần 6 nói: gặp sàn khó thì dừng ở bán tự động, không phá rào.

Kết luận: giai đoạn đầu làm bán tự động. Hệ thống chuẩn bị sẵn video và mô tả đúng định dạng, người
bấm đăng bằng tay, mất thêm ba mươi giây nhưng an toàn tài khoản. Khi nào công ty đăng ký được app
TikTok chính danh và qua kiểm duyệt thì mới nối API đăng thẳng, vẫn giữ cổng duyệt của con người.

---

## 7. Ranh giới tuân thủ, nhắc lại

- Máy soạn kịch bản, người dựng video, người bấm đăng. Không tự đăng.
- Nội dung chạm quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư phải cấp quản lý duyệt trước.
- Không bịa thông số, không nhận vơ phần mềm đối tác, không dựng hình sản phẩm giả bằng AI.
- Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép trong `brand_assets`.
- Không mua lượt xem, không tài khoản ảo, không tương tác giả.

---

## 8. Việc cần làm để chạy được TikTok

1. Đội biên tập video và quy trình dựng từ kịch bản, dùng ffmpeg và Whisper. Đây là Ngày 5 trong kế
   hoạch, chưa dựng.
2. Nạp tư liệu thật vào `brand_assets`: cảnh quay tàu, biển, thiết bị thật, có ghi nguồn và giấy phép.
3. Tài khoản TikTok chính danh của công ty ở chế độ thử trước, đăng riêng tư để tập.
4. Sau này: đăng ký app TikTok chính danh và xin kiểm duyệt Content Posting API, nếu muốn đăng bán tự
   động qua API.
5. Nối đo lường lượt xem TikTok về `mkt_metrics` để biết nội dung nào hiệu quả.

Chừng nào chưa có đội dựng video và tư liệu thật, phần TikTok dừng ở mức: cỗ máy sinh kịch bản, người
đọc và dùng làm khung để quay. Đó đã là giá trị thật, phần còn lại thêm dần.
