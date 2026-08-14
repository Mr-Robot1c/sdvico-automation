# Marketing: workflow và app map

> Đọc khi làm phần Marketing. Phụ trách Bạn B. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.
covers: packages/marketing
last_verified: 2026-08-14
ttl_days: 180
<!-- re-verified: 2026-08-14 - Xoay folder san pham hang ngay: products.mjs (8 folder STT + hashtag + guessGroup), social.mjs (sinh text co emoji + hashtag qua brand-voice/product-boundary), assign-product-groups.mjs (tu gan brand_assets vao folder theo ten), db-apply.mjs (ap migration local qua DATABASE_URL, co chot chan sai project). Ban sao cho app o apps/approval-ui/lib/gen/{products,social}.mjs. rotate route doi sang xoay theo product_group (FB anh/+video, TikTok video), khong lap folder trong vong. -->
<!-- re-verified: 2026-08-14 - Them day chuyen video (Ngay 5) o packages/marketing/src/video: build-video.mjs dieu phoi kich ban (Gemini, script.mjs) -> TTS tung canh (edge-tts, tts.py) -> phu de tu kich ban + Whisper artifact (subtitle.py, faster-whisper) -> ghep ban doc 9:16 va ngang 16:9 (assemble.mjs, ffmpeg) -> 3 tieu de + 3 thumbnail. Chay may noi bo, KHONG serverless. Chi dung brand_assets (dieu cam 5), quet compliance.assessDraft (dieu cam 3,4,5). Chua noi vao approval_queue/dang - dau ra o out/video de nguoi duyet. Chi tiet: packages/marketing/src/video/README.md. -->
<!-- re-verified: 2026-08-12 - publish-facebook.mjs: them dang anh (brief.assets.image qua /photos), lay post_id dung. Van chi dang approval_queue status=approved, tran MKT_MAX_POSTS_PER_RUN. Them workflow mkt-publish.yml chay --live moi 30 phut. Luong may soan nguoi bam KHONG doi. -->
<!-- re-verified: 2026-08-12 - publish-facebook.mjs: chi dang draft (bo dong tieu de) de khong lap ten SP. -->
<!-- re-verified: 2026-08-12 - publish-facebook.mjs + decideForm: them dang VIDEO qua /videos (file_url) khi bai co brief.assets.video. Uu tien video > anh > chu. -->
<!-- re-verified: 2026-08-13 - publish-facebook.mjs + decideForm (actions.ts): bai co CA anh lan video thi dang VIDEO kem caption roi tha ANH vao binh luan dau (POST /{videoId}/comments attachment_url) - FB chan gop video+anh chung 1 post. Tha anh loi thi chi canh bao, khong danh hong bai (tranh dang lai video). Chi anh -> /photos, chi video -> /videos, khong co -> /feed (khong doi). -->
<!-- re-verified: 2026-08-13 - noi-dung/page.tsx: sap xep theo thoi diem duyet (approval_queue.decided_at) fallback created_at, giam dan - bai vua duyet nhay len dau. -->
<!-- re-verified: 2026-08-13 - publish-facebook.mjs: truoc khi tha anh vao binh luan bai video, CHO video xu ly xong (waitVideoReady poll /{id}?fields=status toi 90s, Authorization Bearer) roi moi comment - fix anh khong hien do comment luc video con dang xu ly. -->
<!-- re-verified: 2026-08-13 - publish-facebook.mjs: noi cong an toan Phan 5.4 - import isStopped + incrementDailyCounter tu @sdvico/core; LIVE ma isStopped -> exit khong dang; moi bai check incrementDailyCounter account=facebook kind=post limit=MKT_MAX_POSTS_PER_DAY (mac dinh 3, chung bo dem voi luong Duyet), het thi bo qua + log mkt.publish_blocked. -->

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
