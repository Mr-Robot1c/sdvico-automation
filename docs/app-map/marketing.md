# Marketing: workflow và app map

> Đọc khi làm phần Marketing. Phụ trách Bạn B. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.
covers: packages/marketing
last_verified: 2026-08-26
ttl_days: 180
<!-- re-verified: 2026-08-27 15:50 - THEM SUBTITLE cho video trend (user 27/8: "them subtitle luon duoc khong?"): track sceneDurations trong loop, sau concat sinh SRT tu narration + duration (fmt HH:MM:SS,mmm), burn subtitle vao final video bang ffmpeg subtitles filter (subs.srt:force_style='FontName=Arial,FontSize=20,PrimaryColour=WHITE,OutlineColour=BLACK,Outline=2,Alignment=2 can duoi,MarginV=40'). Dung cwd=workDir + relative path 'subs.srt' de tranh Windows path escaping. Fallback: neu burn loi -> copyFile concat -> outputPath, khong mat cong build. -->
<!-- re-verified: 2026-08-27 15:15 - Fix ffmpeg option force_original_aspect_ratio=cover (khong hop le trong ffmpeg) -> increase (co ho tro: disable/decrease/increase). Behavior cover-like van dat qua increase + crop. -->
<!-- re-verified: 2026-08-27 15:00 - FIX buildTrendVideoFromPexels dung sai downloadAsset() (helper cho Supabase Storage path) voi URL Pexels https:// -> crash "Cannot read from undefined". Them helper downloadHttpToFile(url, dest) dung fetch() + writeFile. -->
<!-- re-verified: 2026-08-27 14:45 - FIX buildTrendVideoFromPexels "args is not defined" (user 27/8 Watcher log): main() khong co bien 'args', truyen vao gay ReferenceError -> Node crash libuv assertion. Sua: bo param args, dung arg('voice', ...) helper co san trong file. -->
<!-- re-verified: 2026-08-27 14:20 - BUILD MODE TREND cho Watcher local (user 27/8: "co the tu ghep long tieng va xuat video luon duoc khong?"): (1) build-video.mjs bo early return skip trend, thay bang branch goi buildTrendVideoFromPexels(client, content, contentId, args). (2) Function moi ~90 dong tren cung file main: loop tung canh -> download pexels_video_url (fallback image + ken burns 5s) -> TTS narration Gemini fallback edge -> ghep video+audio 1920x1080 30fps (video ngan thi stream_loop cho du audio) -> concat demuxer tat ca canh -> upload Supabase Storage videos/trend_XXX.mp4 -> insert brand_assets kind=video product_group='Bài trend' -> update mkt_content.brief.assets.video + clear video_requested + set trend_video_built_at + trend_video_duration_sec. (3) actions.ts generateTrendPost SAU khi Pexels xong tu set video_requested=true (chi khi co pexels_url) -> Watcher pick up ngay lan quet ke tiep. -->
<!-- re-verified: 2026-08-27 13:35 - FIX Video Watcher local mac ket bai trend (user 27/8): packages/marketing/src/video/build-video.mjs sau load brief them early return neu brief.generator='trend' - clear video_requested tren bai + log "Bai trend co Pexels URL trong brief.video_scenes, khong dung Watcher". Watcher lan sau se tu skip. Bai trend dung tay bang CapCut voi URL Pexels. -->
<!-- re-verified: 2026-08-26 17:45 - Voice track token: build-video.mjs geminiTTS fallback ước tính token theo chars input khi Gemini TTS API không trả usageMetadata (endpoint responseModalities=AUDIO khác generateContent thường). Formula: Math.ceil((STYLE + cleanText).length / 4) — Gemini tokenizer ~4 chars/token. Giữ ưu tiên usageMetadata thật nếu Google future update. Không đổi flow gen, không đổi giọng/model/retry. -->
<!-- re-verified: 2026-08-26 16:00 - Noi long SHORTS duration 18-25s -> 40-55s (user 26/8: "thoi gian short co the tang len mien duoi 1p"). Video shorts test truoc 27.5s DA co du 3 canh hook/empathy/solution (role field ep cau truc thanh cong) nhung canh 2 empathy van ngan ~10 chu, chua nem HAU QUA du chi tiet (thieu con so tien, thoi gian, co hoi). Nay canh 2 empathy CHIEM 15-20s (~45-60 tu), bat buoc nem du 4 yeu to: (1) con so tien mat, (2) thoi gian mat, (3) co hoi mat, (4) tam trang. Canh 1 hook nang 8-12s (~25-35 tu, them 1 cau to dam noi mat). Canh 3 solution nang 10-15s (~35-45 tu, co cho neu 2-3 loi ich). Tong ~120-160 tu tieng Viet, video ca outro co dinh ~5s van duoi 60s. -->
<!-- re-verified: 2026-08-26 15:30 - SIET Phase 2 LAN 3 (user 26/8 sau test video 2 SF-50 25s "sao no doc ky luon" + van thieu canh 2 dong cam). Sua 3 cho: (1) JSON schema them field "role" bat buoc (enum hook/empathy/solution/reward/closing) - model hay bo qua role va gop/bo nhip, day la cach ep cau truc. (2) SHORTS: CHINH XAC 3 canh voi role fixed [hook, empathy, solution], tang thoi luong 12-18s -> 18-25s de canh empathy du cho 6-9s (~18-28 tu). Vi du canh 2 dai hon ro rang: "Kim phun tac, phai nam bo sua ca tuan, mat may trieu tien phu tung. Chuyen bien dang trung luong ca phai bo, xot dut ruot anh em oi." (3) LONG: CHINH XAC 5 canh voi role [hook, empathy, solution, reward, closing], moi canh 8-12s. Them log warning neu SHORTS thieu scene role='empathy' de soi khi debug (khong auto-regenerate). -->
<!-- re-verified: 2026-08-26 14:40 - SIET Phase 2 video script.mjs (user 26/8 sau test 1 video SF-50 shorts 29s): model dung "May no gan ton dau co xot ruot khong?" thay hook nghich ly (SAI - la cau hoi thay khang dinh), nhay thang tu hook sang loi thoat bo canh 2 dong cam. Sua 2 khoi: (1) system prompt them dong dinh nghia HOOK NGHICH LY = cau KHANG DINH 2 manh doi lap (thanh qua lon + mat mat), liet ke vi du DUNG ("Trung luong ca phai quay bo vi can dau") vs SAI ("xot ruot khong?", "co thay vay khong?"); (2) SHORTS user prompt tang tu 2-3 canh 10-18s thanh 3 canh bat buoc 12-18s voi cau truc chao+hook / dong cam / loi thoat+chot, cam nhay bo canh 2, cam cau hoi thay hook. Canh 2 phai neu HAU QUA cu the (kim phun tac, chuyen bien di dut). -->
<!-- re-verified: 2026-08-26 11:15 - Phase 2 video script.mjs ap playbook 24/8: them 4 khoi rang buoc trong system prompt: (1) canh dau sau loi chao trend PHAI co HOOK NGHICH LY MAT MAT <=15 chu (thanh qua lon bi pha boi nguyen nhan nho, vi du "Trung luong ca ma phai quay vao bo vi het nuoc") — canh dau tro thanh 2 cau: chao + hook. Bam 1 chu 4 chu cam xuc NGHE/TIEN/RUI RO/TU HAO. (2) Canh 2 dong cam TIEC+UAT+LO (playbook chot cam xuc manh nhat o nhip nay). (3) Canh giua loi thoat bang loi ich + phan thuong cu the + tin cay 1 cau. (4) Canh cuoi cau chot ngan ve loi ich/thong diep san pham, co the la cau hoi mo, KHONG nhac goi/lien he (outro co dinh dau ky). Voice va retry chain giu nguyen. -->
<!-- re-verified: 2026-08-26 10:30 - Creator ap playbook SDVICO 24/8 (SDVICO_PLAYBOOK_dan_vao_chat.md): social.mjs generateSocialPost ANGLES thay bang 4 chu cam xuc NGHE/TIEN/RUI RO/TU HAO (bo loc vang playbook - moi bai chua 1 chu, xoay du 4 chu/tuan); yeu cau hook NGHICH LY MAT MAT <=15 chu cau dau; khung 6 nhip (1 hook / 2 dong cam TIEC+UAT / 3 loi thoat bang loi ich / 4 phan thuong cu the / 5 tin cay 1 cau / 6 CTA mo chuyen); CTA doi tu goi 1900 sang cau hoi mo + tu khoa ngan (nhu nhan "NUOC"/"DAU" cho page - tep moi khong doi goi tong dai); nhet bai mau chuan PHAN 12 lam few-shot ve giong; do dai FB 4-6 cau -> 150-220 chu (6-10 cau ngan). generateContentPost CHUA ap (bai nuoi trang - phase sau). Voice video/build-video.mjs geminiTTS + video/script.mjs generateVideoScript them log token via logTokenUsage (voice_tts, creator_video_script) - KHONG doi giong Leda, KHONG doi retry model chain, chi them 1 dong log fire-and-forget sau moi response OK. Products.mjs doi hashtag #loc_nuoc_RO -> #khoi_cho_nuoc (nguoi doc khong hieu RO, thay bang loi ich). -->
<!-- re-verified: 2026-08-21 19:55 - EDGE FALLBACK doi sang NU HoaiMy: build a22d841 ban doc roi ve edge (2.5-flash + 2.5-pro deu 429 trong ngay) va ra giong NAM NamMinh trong khi user da chot nu -> default edge voice vi-VN-HoaiMyNeural (TTS_VOICE/--voice ep). Ket qua build: ban ngang Leda Gemini + outro chung (cat 2.20s/9.60s), ban doc edge. HAN MUC: ca 3 model TTS deu can trong ngay PT (reset 14h VN) -> video B 7h 22/8 nhieu kha nang edge HoaiMy; duong dung la bat billing Gemini hoac them key project khac. -->
<!-- re-verified: 2026-08-21 19:20 - GIONG NU LEDA MAC DINH + OUTRO CUNG GIONG (user: "bai hom nay sua lai giong nu; outro phai giong giong doc"): GEMINI_TTS_VOICE default Puck -> Leda, style "giong nu ... giu dung mot chat giong". Outro: Gemini moi lan goi len giong khac nhau chut nen outro ngan nghe lech -> buildFormat (engine gemini) doc CANH CUOI + OUTRO CHUNG MOT LAN GOI (tail_full.mp3) roi splitAtSilence cat tai khoang lang dai nhat trong cua so +-20% quanh vi tri ky vong theo ty le ky tu (ffmpeg silencedetect -32dB d0.22); khong thay khoang lang thi cat theo ty le. Bot 1 lan goi/ban. geminiTTSWithRetry tach ra khoi tts() de dung chung. Edge path giu nguyen (outro goi rieng, cung voice). -->
<!-- re-verified: 2026-08-21 17:05 - GEMINI TTS DU PHONG NHIEU MODEL: chay local 16:55 phat hien 3.1-flash-tts CAN HAN MUC NGAY (ca 2 ban roi ve edge du da gian nhip) -> GEMINI_TTS_MODELS noi tiep [3.1-flash, 2.5-flash, 2.5-pro] (env GEMINI_TTS_MODEL ep 1 model); 429 dai dang = can ngay -> sang model ke, idx module-level nen cac canh sau di thang model song; het model moi THROW ve edge. QUAN TRONG: han muc reset nua dem gio My = 14h VN, build 7h sang VN van thuoc "ngay" hom truoc — khong co du phong model la video B sang mai chac chan roi ve edge (3.1 da can hom nay). Smoke 2.5-flash Leda 1 call OK. -->
<!-- re-verified: 2026-08-21 16:50 - GEMINI TTS GIAN NHIP chong 429: build that 21/8 ban ngang dinh 429 giua chung (roi ve edge dung thiet ke), ban doc chay sau em -> them GEMINI_TTS_GAP_MS (mac dinh 20s) giua cac lan goi + backoff 429 nang dan 25s/40s (3 attempt) de CA 2 ban deu duoc giong Gemini tren free tier. Build cham them ~2-3 phut/ban, CI timeout 55p van du. -->
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
