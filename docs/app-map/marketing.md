# Marketing: workflow và app map

> Đọc khi làm phần Marketing. Phụ trách Bạn B. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.
covers: packages/marketing
last_verified: 2026-08-14
ttl_days: 180
<!-- DOC-STATUS: SUSPECT (2026-08-14) — code 'packages/marketing' doi sau last_verified. DOI CHIEU VOI CODE truoc khi tin. May quan ly dong nay, dung sua tay. -->
<!-- re-verified: 2026-08-14 - Go dependency sharp khoi packages/marketing/package.json (truoc chi de logo-overlay dung; nay logo-overlay o app chuyen sang @napi-rs/canvas). Package marketing khong con dung sharp. -->
<!-- re-verified: 2026-08-14 - packages/marketing/src/{products,social}.mjs dong bo voi apps/approval-ui/lib/gen/. Ban CLI truoc do bi cu (hashtag va prompt), lam vong rotate-run sinh bai loi mac du app da fix. Nhac tro: ban copy CLI luon phai giu dong bo voi ban app. -->
<!-- re-verified: 2026-08-14 - content.mjs: them genOnce boc ai.models.generateContent bang AbortSignal timeout (MKT_GEN_TIMEOUT_MS mac dinh 20s), qua han huy request va lui ve ban mau (khong de SDK tu retry timeout gay treo lau). generateFormatsLLM + generateDraftLLM deu dung genOnce. -->
<!-- re-verified: 2026-08-14 - Bai content: products.mjs them CONTENT_TOPICS (6 chu de doi song/tin/san pham/quy dinh...). social.mjs them generateContentPost (JSON {headline, body}, temperature 1.1, CAM bia tin tuc/so lieu cu the). rotate + rotate-run tao them 1 bai/luot -> tong 2 ban + 1 content. Da kiem: 2 lan ra 2 bai khac. -->
<!-- re-verified: 2026-08-14 - social.mjs: them 8 ANGLES (xoay ngau nhien) + temperature 1.05 + xuat JSON {headline, body} de moi bai khac nhau va co tieu de rieng. rotate + rotate-run dung gen.headline lam title (brief.keyword van = ten SP de gom). Da kiem chung 2 lan cung SP ra 2 tieu de + noi dung khac. -->
<!-- re-verified: 2026-08-14 - rotate-run.mjs + rotate route: payload them authored:'ai' (phan biet voi bai nguoi tu soan authored:'human'). -->
<!-- re-verified: 2026-08-14 - rotate-run.mjs: chay 1 luot xoay vong tren may noi bo (giong route /api/rotate), tao bai pending, dung de test/chay tay. -->
<!-- re-verified: 2026-08-14 - products.mjs them FEATURES (tinh nang that tung san pham tu file "tinh nang N.txt"); social.mjs dua FEATURES vao prompt -> text neu dung thong so (220VAC, inox 316, phan xa 95%...), khong bia. upload-folders.mjs: tai anh/video tu C:\Users\ADMIN\Pictures\SDViCo\<N. ...> len brand_assets, gan product_group theo STT, mac dinh chi folder trong (--force de ep). Da tai folder 7,8. -->
<!-- re-verified: 2026-08-14 - db-apply.mjs: tu tach connection string thu cong (ne URL parser cua pg voi mat khau co ky tu dac biet # ? / %). Da ap 2 migration len live jwisiccphcepgpabyyco thanh cong. -->
<!-- re-verified: 2026-08-14 - Con bot dinh huong ke hoach (apps/approval-ui): bang mkt_plans + lib/plan.ts (buildPlan xep hang san pham theo don+tuong tac TB, nguong >=3 bai; doan dinh huong van mau brand-voice tu chinh cac con so). Trang /ke-hoach + cron /api/plan (T4 & CN). rotate uu tien folder theo trong so ke hoach da AP (nguoi bam Ap dung moi tac dong - dieu cam 1 & 2). Dong bo bang du lieu + workflow buoc 9 + lich chay ben duoi. -->
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
  9. Con bot định hướng: từ số liệu ra kế hoạch tuần tới (thứ 4 và chủ nhật)
```

Diễn giải từng bước:

1. Kho từ khóa. Tối thiểu 150 mục, phân loại theo ý định tìm kiếm, gán trang đích. Nguồn gồm gợi ý tìm kiếm, câu hỏi thật trong hộp thư và tổng đài 1900 23 23 49, từ khóa đối thủ. Lưu vào `mkt_keywords`. Hai skill nền là `brand-voice` và `product-boundary`, kiểm thử trên tối thiểu 20 đoạn văn cài lỗi sẵn.

2. Rà soát SEO. Dùng Playwright và Lighthouse, xếp lỗi theo mức tác động.

3. Đề cương. Lệnh `mkt-brief` dựng đề cương nội dung từ từ khóa và trang đích.

4. Viết nháp. Lệnh `mkt-draft` viết bản nháp theo đề cương, đưa vào `approval_queue`, lưu bản ghi ở `mkt_content` trạng thái review. Nội dung chạm quy định nhà nước, IUU, Cục Thủy sản và Kiểm ngư thì đặt `needs_gov_review` bằng true.

5. Duyệt. Người duyệt xem trong giao diện duyệt. Nội dung có `needs_gov_review` phải qua cấp quản lý trước khi đăng. Điều cấm 3.

6. Đăng. Lệnh `mkt-publish` đăng nội dung đã duyệt. Facebook đi qua Graph API, giai đoạn thử nghiệm dùng Test User và Page nháp. Website đăng qua hệ thống, giai đoạn thử nghiệm dùng bản staging. Lưu `mkt_posts`. Có API chính thức thì ưu tiên API, không dùng trình duyệt để lách giới hạn API.

7. Video. Sinh kịch bản từ bài đã đăng, ghép hình từ kho tư liệu, phụ đề bằng Whisper có từ điển thuật ngữ chuyên ngành, chèn nhận diện, xuất bản dọc 60 giây và bản ngang ba tới năm phút. Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép ghi trong `brand_assets`.

8. Đo lường. Kéo số liệu Google Search Console, Analytics, Facebook Insights, YouTube về `mkt_metrics`. Trang `/do-luong` so sánh tương tác và đơn theo sản phẩm.

9. Con bot định hướng. Vào thứ 4 và chủ nhật, cron `mkt-metrics-pull` sau khi kéo số liệu mới sẽ sinh một bản kế hoạch ở `mkt_plans` (gộp ở đây vì Vercel Hobby chỉ cho 2 cron). Kế hoạch xếp hạng sản phẩm theo đơn/lead và tương tác trung bình mỗi bài (ngưỡng ít nhất 3 bài mới xếp thắng thua), kèm đoạn định hướng và trọng số phân bổ bài tuần tới. Endpoint `/api/plan` cũng có để chạy tay hoặc test. Trang `/ke-hoach` để người đọc. Bot đề xuất, người quyết. Bấm "Áp dụng trọng số" thì vòng xoay sinh bài mới ưu tiên sản phẩm đang thắng. Điều cấm 1 và 2.

## 2. App map marketing

### Bảng dữ liệu

| Bảng | Vai trò | Ghi chú |
|---|---|---|
| mkt_keywords | Kho từ khóa | Phân loại theo ý định |
| mkt_content | Nội dung và trạng thái | Có cờ needs_gov_review |
| mkt_posts | Bài đăng và lịch đăng | Kênh website, facebook, youtube |
| mkt_metrics | Số liệu đo lường | Nguồn gsc, ga4, facebook, youtube |
| mkt_plans | Kế hoạch định hướng | Bot sinh từ số liệu (T4 & CN), có trọng số sản phẩm, applied bật thì vòng xoay ưu tiên |
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
- Con bot định hướng sinh kế hoạch thứ 4 và chủ nhật, GỘP trong cron `mkt-metrics-pull` (isPlanDayVN kiểm tra hôm nay là thứ 4 hoặc chủ nhật). Không thêm cron riêng vì Vercel Hobby giới hạn 2 cron. Endpoint `/api/plan` vẫn có để chạy tay.

### Chỉ tiêu nghiệm thu liên quan

- Luồng đăng tin chạy sạch trên môi trường test, ba kênh, mỗi kênh năm lần liên tiếp không lỗi.
- Bài viết website ba bài trên staging và một bài trên trang thật.
- Bài Facebook năm bài trên Page nháp và một bài trên Page thật.
- Video một bản dọc và một bản ngang, đăng chế độ không công khai.

Cập nhật lần cuối: 10/8/2026.
