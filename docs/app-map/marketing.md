# Marketing: workflow và app map

> Đọc khi làm phần Marketing. Phụ trách Bạn B. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.
covers: packages/marketing
last_verified: 2026-08-21
ttl_days: 180
<!-- re-verified: 2026-08-21 16:40 - GIONG CHINH DOI SANG GEMINI TTS (user chot qua AskUserQuestion sau khi nghe demo Puck/Leda; y tuong goc: hop tac NotebookLM nhung NotebookLM khong co API + khong doc nguyen van): build-video.mjs them geminiTTS (model env GEMINI_TTS_MODEL mac dinh gemini-3.1-flash-tts-preview, voice GEMINI_TTS_VOICE mac dinh Puck nam, style GEMINI_TTS_STYLE tone TikToker; PCM s16le -> ffmpeg mp3). NGUYEN KHOI theo ban dung: buildFormat thu gemini cho TOAN BO canh + outro, hong canh nao lam lai HET bang edge-tts (khong lan 2 giong); 429 nghi 21s thu lai. TTS_ENGINE=edge tat han. edge-tts + tach cau prosody GIU nguyen lam fallback. -->
<!-- re-verified: 2026-08-21 16:15 - VIDEO BAI CONTENT dung folder Content: build-video.mjs remap productGroup 'Bai content'/post_kind content -> CONTENT_GROUP 'Content' (folder that co 8 video + 25 anh bien khoi) — truoc lech ten nen bai content fail "chua co tu lieu". Claim "chi dung tu lieu brand_assets" van dung (folder Content la tu lieu cong ty/da co giay phep). -->
<!-- re-verified: 2026-08-21 - Giong mac dinh DOI LAI NAM NamMinh (user nghe thu ca hai ban demo len-xuong roi chon nam). TTS_VOICE ep khac duoc. -->
<!-- re-verified: 2026-08-21 - GIONG LEN XUONG (user: "giong doc ngang qua"): tts() tach loi thoai thanh TUNG CAU (splitSentences), moi cau synth rieng voi ngu dieu theo loai (hoi +7Hz cham lai, cam than +13% +5Hz, thuong dao dong xen ke) roi ffmpeg concat; cau loi 3 lan hoac chi 1 cau -> ve doc ca doan mot giong nhu cu. Demo demo-giong-lenxuong.mp4 da gui user duyet truoc. -->
<!-- re-verified: 2026-08-21 - LOI THOAI THEO TREND GIOI TRE (user: "hello cac anh em/cac con vo"): script.mjs canh dau BAT BUOC mo bang loi chao trend ("Hello anh em di bien oi!", "Alo alo ba con oi!"...), ca video tone TikToker tre (chem nha/ne/luon a) nhung khong lo/khong chui bay; rate +10%, pitch +3Hz. Demo demo-giong-trend.mp4 da gui user. -->
<!-- re-verified: 2026-08-21 - GIONG DOC DOI SANG NU HoaiMy (user): default build-video.mjs + tts.py; TTS_VOICE ep khac duoc. -->
<!-- re-verified: 2026-08-21 - SO LIEN HE VIDEO doi 1900 23 23 49 -> 0939 243 222 (sep chot; du phong 0974 669 649 ghi trong comment build-video.mjs): BRAND_LINE dau video, outro man hinh + TTS ("Goi ngay cho SDVICO"), caption queue, whisper dict, prompt script. GIONG CAM XUC (sep che deu deu): script.mjs them yeu cau cau hoi tu tu + cau cam + ngat nhip (TTS len xuong giong theo dau cau); tts.py them --pitch, mac dinh +2Hz (env TTS_PITCH doi). Bai viet/social + YouTube description VAN dung 1900 (user chi yeu cau outro video). -->
<!-- re-verified: 2026-08-21 - BO GIONG ADAM (user doi y): go elevenLabsTTS khoi build-video.mjs, TTS ve edge-tts NamMinh nhu cu; xoa runbook + env workflow. UI: Tong quan GOP voi Bang bai viet tai /noi-dung theo mau user. -->
<!-- re-verified: 2026-08-21 - Buoc 8 doi lai: Do luong la TRANG RIENG /do-luong (user chieu 21/8 dao quyet dinh buoi sang) + them so lieu YouTube Shorts (lib/youtube-metrics.ts, source=youtube trong mkt_metrics, keo moi 30p). vClip giong Adam = wrapper ElevenLabs -> giu ElevenLabs (runbook-elevenlabs-voice.md giai thich). -->
<!-- re-verified: 2026-08-21 - GIONG DOC ElevenLabs Adam (user muon theo trend TikTok): build-video.mjs ham elevenLabsTTS chay TRUOC edge-tts khi co ELEVENLABS_API_KEY (voice mac dinh Adam, doi bang ELEVENLABS_VOICE_ID, model eleven_multilingual_v2); loi/het quota tu lui edge-tts. Secret khai o video-build.yml; huong dan docs/runbook-elevenlabs-voice.md — CHO USER lay key. Prompt sinh huong di (plan-directions + scripts ban mjs) doi sang tieng Viet CO DAU. -->
<!-- re-verified: 2026-08-21 - BAN DOC CHE CHU (user gui anh TikTok): bumpers.mjs tinh font slogan theo base=H (doc: 1920) nhung khung chi rong 1080 -> tran 2 mep. Them fitFontPx + drawText nhan maxWidth (W*0.92), ap cho slogan intro, "Goi ngay tong dai", slogan outro (so tong dai da co san logic fit W*0.88). Preview frame doc/ngang kiem tra chu nam gon khung. -->
<!-- re-verified: 2026-08-21 - DO LUONG thanh TAB trong Quan ly bai viet (/noi-dung?loai=do-luong, section app/noi-dung/do-luong-section.tsx; /do-luong redirect, /do-luong/tuan giu nguyen). Trang moi /tong-quan (Tong quan kenh): 4 the FB/YouTube/TikTok/Zalo + stat tong. Buoc 8 workflow cap nhat theo. -->
<!-- re-verified: 2026-08-21 - Commit 2 script chay that ma chua tung vao git: upload-zalo-to-bucket.mjs (ban 131 dong day du HOP THA TAY Zalo/Hoc + NHAT KY AI Zalo/AI — vua khoi phuc sau su co checkout nham) + hoc-video.mjs (Gemini xem video, viet tom tat vao Zalo/AI/<ngay>). -->
<!-- re-verified: 2026-08-20 - Them up-media-kho-tu-lieu.mjs vao day-kho-zalo*.bat (buoc 2b, sau hoc-video + upload bucket): tu phan loai media Zalo vao kho brand-assets, chan giay to ca nhan/screenshot. Test that: 22 file da co -> skip, 2 CCCD -> chan, 3 screenshot -> chan, 3 poster/anh moi -> up dung folder. -->
<!-- Nhat ky re-verify cu don sang reverify-log.md (20/8/2026). Giu 3 dong moi nhat o day. -->
<!-- re-verified: 2026-08-14 - build-video RESTORE dung CA 2 ban: horizontal (16:9 cho FB) + vertical (9:16 cho TikTok). Truoc chi ngang -> user thay TikTok khong thay video moi. pushToApprovalQueue upload 2 file -> brand_assets, brief.assets.{video_h,video_v}, channels ['facebook','tiktok'], nhan "[FB 16:9 + TikTok doc] 🎬". Thoi gian dung tang tu ~8p len ~15-20p (danh doi de co ca 2 dinh dang). --skip-whisper van dung. -->
<!-- re-verified: 2026-08-20 - Content ghi tuoi/nam/ngay bang CHU SO (packages/marketing/src/social.mjs + ban apps): quy tac so + prompt portrait -> 55 tuoi, 30 nam thay vi viet chu. -->
<!-- re-verified: 2026-08-20 - CTA: prompt bai social (2 ban) + outro video doc them NHẮN TIN cho Page SDVICO ngoai gọi tong dai. -->


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

8. Đo lường. Kéo số liệu Google Search Console, Analytics, Facebook Insights, YouTube về `mkt_metrics`. Trang `/do-luong` (section `app/do-luong/do-luong-section.tsx`) so sánh tương tác và đơn theo sản phẩm, kèm bảng số liệu YouTube Shorts (`lib/youtube-metrics.ts` kéo view, like, comment mỗi 30 phút, ghi `mkt_metrics` source youtube); báo cáo tuần ở `/do-luong/tuan`. Trang `/tong-quan` (Tổng quan kênh) nhìn nhanh 4 nền tảng: trạng thái chạy, số bài đã đăng, tổng tương tác Facebook.

9. Con bot định hướng (AI Planner, BOSS). Nhịp từ 20/8: đề xuất SỐNG cập nhật mỗi 30 phút trong cron `mkt-metrics-pull` (trọng số + số bài mỗi sản phẩm + lịch theo ngày + nhóm chia sẻ, xem `lib/plan-live.ts`), mỗi tối từ 21h tự gộp trọng số vào bản đang áp (giữ hướng đi A/B); Chủ nhật 23h học tuần (`lib/learn-weekly.ts`) sinh đề xuất tuần cho người bấm; Thứ 2 và Thứ 6 BOSS sinh bản kế hoạch kèm hướng đi từ tri thức (Gemini, `lib/plan.ts`). Trang `/ke-hoach` để người đọc và chỉnh mục tiêu/focus/nhóm. Vòng 5 AI tổng thể ở [README.md](README.md).

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

### Lịch chạy (nhịp hiện hành, chi tiết bảng cron ở [README.md](README.md))

- Sinh bài: 2 slot/ngày (8h sáng 2 bài bán, 13h chiều 1 bán + 1 content), guard per-slot.
- Kéo số liệu + học + đề xuất sống: mỗi 30 phút, GỘP trong cron `mkt-metrics-pull` (Vercel Hobby chỉ 2 cron; GitHub */30 phủ lưới).
- BOSS tự áp trọng số mỗi tối từ 21h; học tuần Chủ nhật 23h; kế hoạch Thứ 2 + cập nhật Thứ 6.
- Dựng video AI: GitHub cron 10 phút/lần.

### Chỉ tiêu nghiệm thu liên quan

- Luồng đăng tin chạy sạch trên môi trường test, ba kênh, mỗi kênh năm lần liên tiếp không lỗi.
- Bài viết website ba bài trên staging và một bài trên trang thật.
- Bài Facebook năm bài trên Page nháp và một bài trên Page thật.
- Video một bản dọc và một bản ngang, đăng chế độ không công khai.

Cập nhật lần cuối: 21/8/2026.
