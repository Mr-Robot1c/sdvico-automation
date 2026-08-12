# Marketing: workflow và app map

> Đọc khi làm phần Marketing. Phụ trách Bạn B. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.
covers: packages/marketing
last_verified: 2026-08-12
ttl_days: 180
<!-- DOC-STATUS: SUSPECT (2026-08-12) — code 'packages/marketing' doi sau last_verified. DOI CHIEU VOI CODE truoc khi tin. May quan ly dong nay, dung sua tay. -->
<!-- re-verified: 2026-08-12 - publish-facebook.mjs: them dang anh (brief.assets.image qua /photos), lay post_id dung. Van chi dang approval_queue status=approved, tran MKT_MAX_POSTS_PER_RUN. Them workflow mkt-publish.yml chay --live moi 30 phut. Luong may soan nguoi bam KHONG doi. -->

## 1. Workflow marketing, từ đầu tới cuối

```
Kho từ khóa và tư liệu
  1. Dựng kho từ khóa, phân loại theo ý định tìm kiếm
  2. Rà soát SEO, Playwright và Lighthouse
Cỗ máy nội dung bốn bước
  3. mkt-brief, dựng đề cương
  4. mkt-draft, viết nháp, đưa vào hàng đợi duyệt
  5. Người duyệt, có cờ duyệt cấp quản lý khi cần
  6. mkt-publish, đăng nội dung đã duyệt
Sau khi đăng
  7. Dây chuyền video từ bài đã đăng
  8. Kéo số liệu về, đo lường
```

Diễn giải từng bước:

1. Kho từ khóa. Tối thiểu 150 mục, phân loại theo ý định tìm kiếm, gán trang đích. Nguồn gồm gợi ý tìm kiếm, câu hỏi thật trong hộp thư và tổng đài 1900 23 23 49, từ khóa đối thủ. Lưu vào `mkt_keywords`. Hai skill nền là `brand-voice` và `product-boundary`, kiểm thử trên tối thiểu 20 đoạn văn cài lỗi sẵn.

2. Rà soát SEO. Dùng Playwright và Lighthouse, xếp lỗi theo mức tác động.

3. Đề cương. Lệnh `mkt-brief` dựng đề cương nội dung từ từ khóa và trang đích.

4. Viết nháp. Lệnh `mkt-draft` viết bản nháp theo đề cương, đưa vào `approval_queue`, lưu bản ghi ở `mkt_content` trạng thái review. Nội dung chạm quy định nhà nước, IUU, Cục Thủy sản và Kiểm ngư thì đặt `needs_gov_review` bằng true.

5. Duyệt. Người duyệt xem trong giao diện duyệt. Nội dung có `needs_gov_review` phải qua cấp quản lý trước khi đăng. Điều cấm 3.

6. Đăng. Lệnh `mkt-publish` đăng nội dung đã duyệt. Facebook đi qua Graph API, giai đoạn thử nghiệm dùng Test User và Page nháp. Website đăng qua hệ thống, giai đoạn thử nghiệm dùng bản staging. Lưu `mkt_posts`. Có API chính thức thì ưu tiên API, không dùng trình duyệt để lách giới hạn API.

7. Video. Sinh kịch bản từ bài đã đăng, ghép hình từ kho tư liệu, phụ đề bằng Whisper có từ điển thuật ngữ chuyên ngành, chèn nhận diện, xuất bản dọc 60 giây và bản ngang ba tới năm phút. Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép ghi trong `brand_assets`.

8. Đo lường. Kéo số liệu Google Search Console, Analytics, Facebook Insights, YouTube về `mkt_metrics`.

## 2. App map marketing

### Bảng dữ liệu

| Bảng | Vai trò | Ghi chú |
|---|---|---|
| mkt_keywords | Kho từ khóa | Phân loại theo ý định |
| mkt_content | Nội dung và trạng thái | Có cờ needs_gov_review |
| mkt_posts | Bài đăng và lịch đăng | Kênh website, facebook, youtube |
| mkt_metrics | Số liệu đo lường | Nguồn gsc, ga4, facebook, youtube |
| brand_assets | Tư liệu | Chỉ owned hoặc licensed |
| approval_queue | Nội dung chờ duyệt | Cổng của điều cấm 1 và 3 |
| run_log | Nhật ký đăng và rà soát | Kèm ảnh chụp khi lỗi |

### Lệnh và skill

| Tên | Loại | Việc |
|---|---|---|
| mkt-brief | Slash command | Dựng đề cương nội dung |
| mkt-draft | Slash command | Viết nháp, đẩy hàng đợi duyệt |
| mkt-publish | Slash command | Đăng nội dung đã duyệt |
| brand-voice | Skill | Kiểm và sửa theo chuẩn giọng văn |
| product-boundary | Skill | Chặn mô tả phần mềm đối tác như của SDVICO và chặn bịa |
| seo-brief | Skill | Dựng đề cương SEO từ kho từ khóa |

### Auto và người

| Việc | Máy làm | Người làm |
|---|---|---|
| Dựng từ khóa và đề cương | Có | |
| Viết nháp | Có | |
| Duyệt nội dung | | Có |
| Duyệt nội dung quy định nhà nước | | Có, cấp quản lý |
| Đăng bài | Soạn và đẩy | Người bấm, hoặc đăng qua API sau khi đã duyệt |
| Dựng video | Có | Người duyệt trước khi công khai |

### Cổng an toàn của mảng

1. Nội dung qua hàng đợi duyệt trước khi đăng. Điều cấm 1.
2. Nội dung quy định nhà nước và IUU qua cấp quản lý. Điều cấm 3.
3. Skill `product-boundary` chặn mô tả phần mềm đối tác như năng lực SDVICO. Điều cấm 4.
4. Skill `brand-voice` giữ chuẩn giọng văn và chặn bịa. Điều cấm 5.
5. Chỉ dùng tư liệu sở hữu hoặc có giấy phép trong `brand_assets`.
6. Hạn mức tự đặt, tối đa ba bài mỗi ngày trên mỗi trang mạng xã hội, trần cứng trong code, đếm lưu trong cơ sở dữ liệu.

### Lịch chạy

- Lịch nội dung tuần sinh tự động, người duyệt theo lô.
- Kéo số liệu về `mkt_metrics` theo ngày.

### Chỉ tiêu nghiệm thu liên quan

- Luồng đăng tin chạy sạch trên môi trường test, ba kênh, mỗi kênh năm lần liên tiếp không lỗi.
- Bài viết website ba bài trên staging và một bài trên trang thật.
- Bài Facebook năm bài trên Page nháp và một bài trên Page thật.
- Video một bản dọc và một bản ngang, đăng chế độ không công khai.

Cập nhật lần cuối: 10/8/2026.
