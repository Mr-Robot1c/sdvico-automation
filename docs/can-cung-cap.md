# Những thứ cần cung cấp cho dự án

> Danh sách tài khoản, quyền truy cập và dữ kiện cần có để hệ thống chạy. Sắp theo mức độ gấp.
> Nguyên tắc bí mật: mọi khóa, mật khẩu, chuỗi kết nối đặt trong `.env` cục bộ hoặc GitHub Secrets. Không dán vào khung chat, không commit vào Git (điều cấm 7). Mật khẩu và xác thực hai bước do người vận hành giữ, không giao cho người viết code.

## A. Cần trước khi làm tiếp (môi trường thử nghiệm)

### 1. GitHub
- Tài khoản tổ chức, quyền tạo repo và chạy Actions.
- Sau khi có, đưa repo `sdvico-automation` lên tổ chức. Hiện repo mới ở máy nội bộ, chưa có nơi đẩy lên.
- Chuẩn bị GitHub Secrets để lịch chạy đọc khóa, không viết khóa thẳng vào file workflow.

### 2. Supabase
- Một dự án Supabase riêng cho hệ thống này.
- Cần ba giá trị đưa vào `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Khóa service role rất nhạy, chỉ để ở backend và GitHub Secrets.
- Sau khi có dự án, áp hai file trong `supabase/migrations` theo `supabase/README.md`, rồi báo lại.

### 3. Claude Code headless
- `ANTHROPIC_API_KEY`.
- Hạn mức chi phí mô hình cho cả tuần và cảnh báo khi chạm 80 phần trăm. Trần tham chiếu trong kế hoạch là 3.000.000 đồng.

### 4. Facebook, giai đoạn thử nghiệm
- App Facebook chính danh công ty ở chế độ phát triển, quyền tạo Test User và Page thử.
- Một trang Facebook mới của công ty ở chế độ chưa công bố.
- Giá trị cần: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, và token của Page nháp.

### 5. Google, giai đoạn thử nghiệm
- Tên miền phụ staging của sdvico.vn.
- Search Console và Analytics gắn vào tên miền phụ staging, không gắn vào tên miền chính.

### 6. Hộp thư nạp CV, giai đoạn thử nghiệm
- Một hộp thư test riêng, không phải tuyendung@sdvico.vn.
- Giá trị cần: `MAIL_IMAP_HOST`, `MAIL_IMAP_USER`, `MAIL_IMAP_PASSWORD`.

### 7. YouTube
- Một kênh YouTube riêng cho thử nghiệm, đăng ở chế độ không công khai.

### 8. Máy chủ nội bộ
- Máy có màn hình ảo để chạy Playwright với Chrome thật và chạy ffmpeg. Địa chỉ mạng cố định, không xoay proxy.

### 9. Sàn tuyển dụng
- Xác nhận sàn tuyển dụng nào công ty đang dùng, và sàn nào có gói dùng thử cho nhà tuyển dụng.

### 10. Dữ liệu thử nghiệm
- Cho phép hai kỹ sư dựng tối thiểu 60 hồ sơ tổng hợp có các trường hợp khó. Không dùng CV thật cho tới khi có mẫu văn bản đồng ý theo Nghị định 13/2023.

## B. Cần trước khi lên tài khoản thật (theo kế hoạch là trước sáng ngày thứ sáu)

### 11. Hộp thư thật
- tuyendung@sdvico.vn, quyền đọc qua giao thức chuẩn.

### 12. Tài khoản nhà tuyển dụng trên các sàn
- Mật khẩu và xác thực hai bước do người vận hành giữ.

### 13. Facebook thật
- Quyền quản trị Page thật và đưa app lên chế độ hoạt động.

### 14. Google thật
- Search Console và Analytics của tên miền chính.

### 15. Website
- Quyền đăng bài lên sdvico.vn.

### 16. Người duyệt cấp quản lý
- Người có quyền duyệt cuối cho nội dung liên quan quy định nhà nước, IUU, Cục Thủy sản và Kiểm ngư.

### 17. Pháp lý dữ liệu
- Mẫu văn bản đồng ý xử lý dữ liệu ứng viên theo Nghị định 13/2023 và thời hạn lưu trữ.

## C. Dữ kiện nghiệp vụ, cần để điền CLAUDE.md và viết nội dung

1. Mô tả chính thức ngành nghề, quy mô, địa bàn của SDVICO.
2. Danh mục sản phẩm đầy đủ, nhóm sản phẩm, chính sách bảo hành, dịch vụ kèm theo, tài liệu kỹ thuật gốc để trích dẫn.
3. Tông giọng thương hiệu mong muốn và điều nên tránh nói.
4. Kho tư liệu thương hiệu công ty sở hữu hoặc có giấy phép, để đưa vào bảng `brand_assets`.

## D. Con người trực nghiệp vụ

- Một người Phòng Nhân sự trả lời nghiệp vụ tuyển dụng trong ngày.
- Một người Phòng Kinh doanh trả lời nghiệp vụ sản phẩm và khách hàng trong ngày.

## Cách bàn giao khóa an toàn

- Điền trực tiếp vào file `.env` trên máy chạy, không gửi qua chat.
- Với lịch chạy trên GitHub, đặt trong Settings và Secrets của repo.
- Nếu cần tôi kiểm thử một luồng, hãy chạy trên máy đã có `.env`, tôi đọc kết quả qua log chứ không cần giá trị khóa.
