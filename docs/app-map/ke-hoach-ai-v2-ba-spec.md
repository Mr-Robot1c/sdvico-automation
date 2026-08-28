# ba-spec: Kế hoạch AI v2 và mở rộng kênh (SEO, Social đa kênh, AD trả phí)

> Load khi: task chạm bot Kế hoạch (`/ke-hoach`, `lib/plan.ts`), nguồn tri thức nội bộ/public cho Kế hoạch, SEO backlink, mở rộng kênh Social, hoặc quảng cáo trả phí (AD) của mảng Marketing.
covers: apps/approval-ui/app/ke-hoach, apps/approval-ui/lib/plan.ts, apps/approval-ui/app/api/plan, packages/marketing/src, supabase/migrations
last_verified: 2026-08-28
ttl_days: 90
<!-- re-verified: 2026-08-28 17:30 - noZalo (seo.ts) so TIEN TO source: du lieu that la zalo-auto/zalo-backlog-tkkd. -->
<!-- re-verified: 2026-08-28 17:20 - THANG TAP TRUNG chong loang (user 28/8: "thang nay sep bao tap trung loc dau + loc nuoc, dang nhieu ma khong loang"): (1) plan-directions them O GOC 7 mat cho thang focus it san pham + luat tranh GOC da dung (khong chi tieu de); (2) loadRecentDirectionTitles cua so ne trung 7 -> 14 ngay, tran 30 -> 45; (3) config: mkt_focus keo het 30/9, mkt_weekly_goal = thang goc 4 tuan (tuan 1 noi dau, tuan 2 tien, tuan 3 nguoi that, tuan 4 mua vu + seeding). Blog: loadPublicPosts loc deleted_at (bai Thung rac tung van hien), anh Zalo cam vao pool du phong CHUNG (chi duoc dung dung folder san pham), chong trung cover giua cac the cung trang. Bai trend AFF (81332f08) soft-delete theo lenh user. -->
<!-- re-verified: 2026-08-28 17:00 - LAM LAI TRANG /ke-hoach (user: "khong ruom ra, day du ke hoach ca tuan, block deu nhau"): (1) lib/week-plan.ts MOI — bang tuan T2..CN tu bai THAT da sinh + mo phong hang doi rotate (sort trong so, focus, folder co anh, 2 SP khac nhau/luot sang); trang KHONG phu thuoc ban live nua (ban live bi xoa lam trang cu trong tron — chinh la loi user thay). (2) page.tsx viet lai toan bo tren .blk dong bo. (3) FIX rotate: bo gioi han 1 huong/run (di san A/B) — slot sang gio ra DU 2 bai ban tu 2 huong; fallback bu du salesCount; loai content lay THANG tu CONTENT_KIND_BY_DOW (bo doc ban live; gate cu chan nham viral/seeding — T3/T6/CN chua bao gio ra dung loai; them fallback topic cho viral/seeding). (4) guessGroup doi sang TU KHOA DAI NHAT thang (SD12-300 het bi SF-50 cuop). (5) plan-live buildDirectionQueue/buildDailySchedule theo nhip 3 huong/ngay. (6) Workflow Actions nguong slot 7h/12h30 -> 8h/14h (bai sang tung ra 7h41 truoc cron Vercel 8h). NV/AC ke hoach v2 giu nguyen, chi hien thi + nhip chay. -->
<!-- re-verified: 2026-08-29 11:40 - SPEC VONG LAP user hieu dinh (5 diem): (1) DATA 2 quet sau Gemini MOI NGAY (gate 48h->24h, knowledge-public). (2) BOSS hoc so TAT CA nen tang: week-report loadPostsInWindow + plan.ts loadMeasurement gop FB kenh chinh + YouTube + TikTok THEO BAI (1 bai da kenh = 1 dong cong don; TikTok ghep tay vao qua snapshot createTime; bai CHI co ban FB page phu va khong len YT/TT thi bo; so FB chi tinh khi kenh chinh). (3) Khung gio 8h sang + 14h chieu VN (vercel.json cron 0 1 / 0 7 UTC; nhan UI ke-hoach + plan-quick-view doi 7h/12h30 -> 8h/14h, bo not nhan Ban A/B). (4) Toi BOSS chinh + CN bao cao tuan doi 19h -> 20h (plan-live isEveningVN, learn-weekly shouldRunLearnWeekly). (5) Ghep FB chinh = dan link bai SDVICOVN de mo bai + do so lieu bai do; page phu tat do/tat hien link, may van dung lam cho dang nhap ky thuat vi chua co token dang thang SDVICOVN. -->
<!-- re-verified: 2026-08-29 10:10 - Doi chieu trim lang + seed per-request server giong: thuan chat luong am thanh, NV/AC khong doi. -->
<!-- re-verified: 2026-08-29 09:10 - Doi chieu fix seed + dai temperature giong local: thuan chat luong giong doc, NV/AC khong doi. -->
<!-- re-verified: 2026-08-29 08:20 - Doi chieu fix nhan log giong build-video: thuan hien thi, NV/AC khong doi. -->
<!-- re-verified: 2026-08-29 06:50 - Doi chieu env.mjs fix + hen gio published_at: ky thuat nap env + ghi so, NV/AC khong doi. -->
<!-- re-verified: 2026-08-29 05:40 - 70/30 doi sang ty le mem (chi doi loi dan prompt winnersBlock); chay thu rotate sau khi bo A/B PASS. NV/AC khong doi them. -->
<!-- re-verified: 2026-08-29 05:10 - Doi chieu productOf guard siet them (lib/plan.ts): chi lam sach ten san pham fallback, khong doi NV/AC. -->
<!-- re-verified: 2026-08-29 04:40 - DOI HANH VI LON theo user 29/8 ("bo han A/B", chot qua cau hoi): (1) rotate: moi huong di tuan ra DUNG 1 bai (goc = sug.why, tieu de = sug.title), used_at danh NGAY sau khi sinh (khong con pending_variant/ab_pair_id/ab_variant/CONTRAST_ANGLES); huong con pending_variant=B cu coi nhu DA DUNG (da ra ban A). (2) evaluateAbPairs TAT khoi cron metrics (code giu). (3) Hieu qua tuan so theo LOAI bai + san pham (week-report byKind/byProduct — san co). (4) LUAT 70/30 cua sep: generateContentDirections nhan winners[] (top 5 bai thang tu measurement.topPosts) — prompt yeu cau ~2/7 huong xoay lai chu de thang voi goc MOI, 5/7 tu tri thuc moi; ca plan tuan lan refill hang ngay deu truyen. (5) Video bai ban giu KIEU SHORT 10-20s qua co brief.video_short=true (rotate dat khi wantVideo; build-video isShort = video_short || ab_pair_id cu). Playbook 7 huong 2-2-1-1-1 GIU NGUYEN (da dung tu 26/8, khop van ban user). UI /ke-hoach bo nhan Ban A/Ban B -> Bai ban 1/Bai ban 2. -->
<!-- re-verified: 2026-08-29 03:30 - Doi chieu upload-zalo (packages/marketing/src) nhanh media + BOSS an tier/angle/key_message DATA 2 qua plan-directions: lam GIAU dau vao sinh huong di, khong doi NV/AC (flow sinh ke hoach giu nguyen). -->
<!-- re-verified: 2026-08-29 01:25 - Doi chieu vong rinh cookie 15s cua fb-suite-scan: ky thuat thuan tuy, NV/AC khong doi. -->
<!-- re-verified: 2026-08-29 01:10 - Doi chieu fb-suite-scan doi nhip 2h + muon phien Brave: van chi ghi mkt_metrics __page_real__, NV/AC khong doi. -->
<!-- re-verified: 2026-08-29 00:45 - Doi chieu fix thoat cua fb-suite-scan (exitCode thay exit): ky thuat thuan tuy, NV/AC khong doi. -->
<!-- re-verified: 2026-08-29 00:20 - Doi chieu fb-suite-scan.mjs (file MOI trong packages/marketing/src): bo quet insight cap trang, chi GHI mkt_metrics __page_real__ — khong cham flow ke hoach/rotate/evaluator, NV/AC khong doi. -->
<!-- re-verified: 2026-08-28 23:20 - Doi chieu hoan SPEED ve 1.0 (user che 1.1 re): thuan trinh bay giong doc, khong doi NV/AC. -->
<!-- re-verified: 2026-08-28 23:00 - Doi chieu server VieNeu them SPEED (time_stretch sau infer): thuan trinh bay giong doc, khong doi NV/AC ke hoach AI v2. -->
<!-- re-verified: 2026-08-28 21:40 - Doi chieu bieu cam giong theo loai bai: rotate route luu them brief.emotion (chu cam xuc BOSS chot, von da co trong suggestion); build-video map temperature giong local theo loai bai. Thuan trinh bay giong doc, khong doi NV/AC ke hoach AI v2 (suggestion/plan flow giu nguyen). -->
<!-- re-verified: 2026-08-28 20:30 - CHUOI GIONG VIDEO DOI HANH VI (user chot giong My Duyen local): build-video.mjs ca 2 duong doi thu tu engine thanh local -> gemini -> edge (truoc gemini dau). Video tu gio mac dinh giong local My Duyen; gemini/edge chi la du phong. Cac NV/AC khac cua ke hoach AI v2 khong doi. -->
<!-- re-verified: 2026-08-28 19:50 - Doi chieu them file local-tts-server-vieneu.py (packages/marketing/src/voice): CHI la server HTTP giong local moi (VieNeu thay F5), cung contract /tts nen khong doi hanh vi NV/AC nao cua ke hoach AI v2 — chain giong video van gemini -> local -> edge nhu spec. -->
<!-- re-verified: 2026-08-28 10:20 - TTS doc ten cong ty: cleanNarration them replace /SDVICO/gi -> "SD Vi Co" (user 28/8: doc "SD Vi Co" chu khong danh van "SD Vi C O"). Ap moi duong giong doc (gemini + edge + outro) vi tat ca deu qua cleanNarration; phu de/banner giu nguyen chu SDVICO. -->
<!-- re-verified: 2026-08-28 17:40 - Voice server local (packages/marketing/src/voice/local-tts-server.py) da cai + chay tren may chu; TTS_LOCAL_URL da vao .env checkout chinh. -->
<!-- re-verified: 2026-08-28 16:20 - build-video TTS chain gemini -> local (TTS_LOCAL_URL) -> edge; brief.fb_real_url ghep link bai Page chinh. -->
<!-- re-verified: 2026-08-28 15:00 - productOf (plan.ts + week-report.ts) fallback an toan: ten > 60 ky tu / co xuong dong -> Khác (fix weights rac tu bai import). applyLiveEvening them chay bu sang <12h khi toi qua 0 luot (may local tat). Data ban applied da don 4 key rac. -->
<!-- re-verified: 2026-08-28 09:40 - Route /api/knowledge-score cham tier DOC LAP (cron mkt-metrics-pull 90s nghi het gio truoc buoc cham - DATA 2 39 muc van 0 diem). build-video cacheControl 1 nam. -->
<!-- re-verified: 2026-08-27 23:40 - DOT 2 REDESIGN: DATA 2 tier S/A/B/C (Trending Digest). Migration knowledge_tier them score/tier/angle/key_message/keywords/plan_suggestions vao mkt_knowledge_public. scoreUnscoredKnowledge cham batch 20 dong/luot bang Gemini trong cron. loadRecentKnowledge uu tien tier cao khi feed BOSS. FIX ten bang sai mkt_public_knowledge -> mkt_knowledge_public o actions.ts (trend gen) + agent page. -->
<!-- re-verified: 2026-08-27 20:50 - VIDEO TREND cleanup asset cu (user 27/8): buildTrendVideoFromPexels truoc khi upload moi cleanup old brief.assets.video_v/video - Storage.remove + brand_assets.delete. San xuat + tu lieu bo product_group='Bai trend'. Route /api/cleanup-trend-videos xoa orphan tich luy. --> 
<!-- re-verified: 2026-08-27 19:00 - Nhap NHIEU su kien 1 lan sinh N bai trend. generateTrendPost split(/[,;\n]+/) + Promise.allSettled trong waitUntil. UI textarea rows=4 maxLength=600. -->
<!-- re-verified: 2026-08-27 18:20 - GIONG DONG DEU ca video trend (user 27/8): TTS 2-pass. Pass 1 thu Gemini toan bo canh, fail 1 canh nao -> pass 2 re-TTS TOAN BO bang edge (khong mix engine). Ghep clip them loudnorm=I=-16 can am luong + -ar 44100 cho sample rate dong nhat. -->
<!-- re-verified: 2026-08-27 17:50 - VIDEO TREND thanh 9:16 vertical (user 27/8). W/H 1080x1920. Subtitle Font 32 MarginV 140. brief.assets.video_v = asset.id. -->
<!-- re-verified: 2026-08-27 15:50 - Them subtitle burn cho video trend (SRT tu narration + sceneDurations, ffmpeg subtitles filter Arial 20 chu trang vien den can duoi). -->
<!-- re-verified: 2026-08-27 15:15 - Fix ffmpeg force_original_aspect_ratio cover->increase. -->
<!-- re-verified: 2026-08-27 15:00 - Fix download Pexels URL bang fetch (khong dung downloadAsset cho Supabase Storage). -->
<!-- re-verified: 2026-08-27 14:45 - Fix "args is not defined" trong buildTrendVideoFromPexels - bo param args, dung arg('voice', ...) helper. -->
<!-- re-verified: 2026-08-27 14:20 - Watcher local build mode trend: buildTrendVideoFromPexels download Pexels URL + TTS narration + ghep 1920x1080 + concat + upload Supabase. actions.ts generateTrendPost sau khi Pexels xong tu set video_requested=true. -->
<!-- re-verified: 2026-08-27 13:35 - FIX Watcher local mac ket bai trend: build-video.mjs skip generator='trend' + clear video_requested. bang-section.tsx an nut Lam video cho bai trend, hien badge Co N canh Pexels. /api/clear-trend-video reset bai dang mac ket. -->
<!-- re-verified: 2026-08-27 13:20 - TICH HOP PEXELS API + FIX web treo Sinh trend: lib/gen/pexels.mjs search anh/video CC0 free (env PEXELS_API_KEY). actions.ts generateTrendPost async pattern - tra contentId NGAY, background waitUntil Gemini + Pexels. -->
<!-- re-verified: 2026-08-27 12:35 - TANG 1+2+3 BAM TREND VN VIRAL MIEN PHI: (1) knowledge-public.ts SEARCH_TOPICS +3 topic trend cho Data 2 hoc hang ngay. (2) plan-directions.ts prompt BOSS: huong #5 Thu 6 uu tien bam trend, moc sang goc ngu dan. (3) lib/gen/trend-post.mjs generateTrendPost + actions.ts server action + /ke-hoach/trend-post-button.tsx nut "🔥 Sinh bai trend" o header. Modal nhap su kien, sinh 1 bai Facebook + kich ban video 5-8 canh, insert Bang cho duyet. -->
<!-- re-verified: 2026-08-27 04:35 - Nut "🎯 Bung 1 y thanh 7 bai" chuyen tu /noi-dung sang /ke-hoach header (canh 🔄 BOSS chay lai). Modal dung <dialog> HTML5 showModal() de browser tu lo backdrop. Bang hint "Khi nao bam nut nao" cua /ke-hoach them dong 5 cho nut nay. Server action generateSevenAngles giu nguyen (khong doi flow). -->
<!-- re-verified: 2026-08-27 02:15 - PLAYBOOK ITEM 1 - DO ZALO/INBOX THAY VIEW: lib/plan.ts loadMeasurement + lib/week-report.ts buildWeekReport dem lead per content_id tu bang mkt_leads (loai spam) trong 7 ngay/tuan roi CONG vao conversions cua bai. BuildPlan da san co avgConv > avgEng khi rank san pham (khong doi cong thuc) -> bai co Zalo se nang tier winner truoc bai chi nhieu like. UI: bang-section hien "🎯 N khach hoi" + nut ghi lead nhanh. actions.ts addLeadManual nhan them content_id + channel. KHONG can migration DB (tan dung mkt_leads.source='manual' + prefix message [Zalo]/[Inbox]). KHONG doi flow /ke-hoach. -->
<!-- re-verified: 2026-08-27 01:45 - /ke-hoach nut header doi label "🔄 BOSS chay lai" -> "🔄 BOSS chay lai (giu cai dat)" cho ro khac nut xanh "Luu & sinh ke hoach moi" (user 26/8 lan 2 van nham). Hint text "Khi nao bam nut nao?" cap nhat 2 dong dau: them cot "Cai dat tuan (nut xanh giua trang)" vs "Goc phai header" + wording "vua go doi" / "KHONG doi gi" de user chinh xac biet khi nao bam nut nao. KHONG doi flow NV: ca 2 nut van goi generateAndStorePlan(cadence=manual), chi khac nut xanh LUU form truoc khi sinh, nut header khong lu form. -->
<!-- re-verified: 2026-08-27 00:45 - AP PLAYBOOK SDVICO PHASE 3 BOSS - LICH TUAN 2-2-1-1-1: (1) plan.ts (khong doi flow, chi mo rong type): DailyPlan them contentEmotion?: string (4 chu NGHE/TIEN/RUI RO/TU HAO theo tung ngay); ContentDirection them emotion/role/hook cho BOSS truyen xuong Creator. (2) plan-live.ts (dao lich playbook): CONTENT_KIND_BY_DOW - T6 doi tu seeding->viral (chu TU HAO), T7 doi tu viral->portrait (chu TU HAO), CN doi tu portrait->seeding (chu TIEN). Bam PHAN 9 playbook. Them CONTENT_EMOTION_BY_DOW map, gan vao DailyPlan.contentEmotion trong buildDailySchedule. CONTENT_PURPOSE + CONTENT_STRUCTURE viet lai bam khung viral 6 nhip + hook nghich ly. (3) plan-directions.ts (siet prompt BOSS): Gemini nhan playbook day du - khach di bien khong an hai san, 4 chu bo loc vang, 7 huong CHIA DUNG bang 2-2-1-1-1 (moi huong role+emotion+kind gan cung), hook nghich ly mat mat <=15 chu cho viral, 5 co che tam ly hook cho cac loai khac, chi 2/7 ban truc tiep (Thu 4 + CN). Them 3 loi chet nguoi tuyet doi tranh, CTA mo chuyen thay goi tong dai. JSON schema output them role/emotion/hook. Map ContentDirection them 3 field moi (slice 20/20/150 chars). KHONG doi flow NV Ke hoach: van generateAndStorePlan(cadence=weekly|update|manual), van carry-over huong chua dung, van goi Gemini 4 model fallback. (4) social.mjs (Creator ban): generateSocialPost + generateContentPost them emotionOverride + preferredHook - cho A/B cung chu, khac goc. (5) rotate/route.ts: truyen sug.emotion + sug.hook xuong Creator ban, todaySched.contentEmotion xuong Creator content. -->
<!-- re-verified: 2026-08-26 23:30 - Migration 20260826040000_mkt_content_deleted_at: mkt_content.deleted_at cho soft-delete bai viet. KHONG doi flow NV Ke hoach - lib/plan.ts van query mkt_content theo id (co the join bai soft-deleted khi tinh so lieu lich su, dung y nghia). Chi anh huong hien thi UI /noi-dung (Bang bai viet + Bai viet day du an bai soft-deleted, tab Thung rac hien them). deleteContent chuyen tu hard delete 4 bang -> mark deleted_at, hardDeleteContent giu hard delete cho case can don thuc su. -->
<!-- re-verified: 2026-08-26 22:00 - Migration 20260826030000_mkt_posts_deleted_at: them cot mkt_posts.deleted_at cho soft-delete row bai user xoa tay tren nen tang (VD: TikTok). KHONG doi flow NV Ke hoach — chi tile Tong quan filter deleted_at null de dem dung, va chip TikTok co nut mark deleted. Kho tri thuc/lib plan khong dung deleted_at. -->
<!-- re-verified: 2026-08-26 18:30 - Migration 20260826020000_claude_code_usage: bang moi track Claude Code (Anthropic Max) token cho dashboard sep xem "quy doi ra tien". KHONG doi flow NV Ke hoach (Claude Code la dev tool user chat, tach hoan toan voi AI SDVICO Gemini o mkt.token_usage). -->
<!-- re-verified: 2026-08-26 17:45 - Voice track token: build-video.mjs geminiTTS fallback estimate token theo chars (Gemini TTS API không trả usageMetadata). Không đổi flow NV Ke hoach, không đụng script.mjs. -->
<!-- re-verified: 2026-08-26 16:00 - Noi long SHORTS 18-25s -> 40-55s script.mjs (user 26/8: "thoi gian short co the tang mien duoi 1p"). Canh 2 empathy chiem 15-20s (45-60 tu) bat buoc nem du con so tien/thoi gian/co hoi/tam trang. Canh 1 hook 8-12s. Canh 3 solution 10-15s. Tong ~120-160 tu. KHONG doi flow NV. -->
<!-- re-verified: 2026-08-26 15:30 - SIET Phase 2 LAN 3 script.mjs: JSON schema them field "role" bat buoc (enum hook/empathy/solution/reward/closing). SHORTS chinh xac 3 canh role [hook, empathy, solution], tang thoi luong 12-18s -> 18-25s de canh empathy du cho. LONG chinh xac 5 canh role [hook, empathy, solution, reward, closing]. Log warning khi thieu role empathy. KHONG doi flow NV, KHONG doi retry/model chain. -->
<!-- re-verified: 2026-08-26 14:40 - SIET Phase 2 video script.mjs: user test 1 shorts SF-50 phat hien model dung cau hoi ("May no ton dau xot ruot khong?") thay hook nghich ly + bo canh 2 dong cam. Sua 2 chuyen: system prompt them dinh nghia hook nghich ly = cau khang dinh 2 manh doi lap (thanh qua + mat mat), liet ke vi du DUNG/SAI de model khong lon; SHORTS user prompt bat buoc 3 canh (chao+hook / dong cam / loi thoat+chot) 12-18s thay 2-3 canh, cam cau hoi thay hook. -->
<!-- re-verified: 2026-08-26 11:15 - packages/marketing/src/video/script.mjs generateVideoScript AP PLAYBOOK 24/8: system prompt them 4 khoi rang buoc - canh dau sau loi chao trend PHAI co hook nghich ly mat mat <=15 chu (thanh qua lon bi pha boi nguyen nhan nho); canh 2 dong cam TIEC+UAT+LO; canh giua loi thoat bang loi ich + phan thuong + tin cay 1 cau; canh cuoi cau chot loi ich (khong nhac goi, outro co dinh dau ky). Bam 1 chu 4 chu cam xuc NGHE/TIEN/RUI RO/TU HAO. KHONG doi flow NV, KHONG doi retry/model chain/JSON output/asset chon. -->
<!-- re-verified: 2026-08-26 10:30 - packages/marketing/src/video/script.mjs generateVideoScript them optional param `client` cuoi cho logTokenUsage (creator_video_script) — KHONG doi flow NV, KHONG doi prompt/logic sinh kich ban. Duplicate token-log.mjs sang packages/marketing/src/ (module JS thuan, import supabase client vao insert run_log task=mkt.token_usage). rotate/route.ts truyen client vao generateSocialPost/generateContentPost/pickImageForContent (arg thu 4). actions.ts generateTextForTitle them getServerClient() truyen vao generateContentAsync. -->
<!-- re-verified: 2026-08-26 03:00 - Migration 20260826010000_mkt_posts_made_public: them cot mkt_posts.made_public_at (workaround TikTok audit reject — user danh dau bai da doi cong khai tay). KHONG doi flow NV Ke hoach: cot moi khong duoc query trong plan.ts/loadMeasurement, khong anh huong xep hang huong di / weighted rotate. Chi anh huong hien thi /noi-dung. -->
<!-- re-verified: 2026-08-24 23:30 - plan.ts truyen them `client` vao generateContentDirections() (chi de logTokenUsage — track token BOSS sinh huong di, xem README "Quan tri token"). KHONG doi logic sinh huong di/carry-over, chi them 1 tham so optional cuoi. -->
<!-- re-verified: 2026-08-24 23:00 - actions.ts them updateLeadStatus/addLeadManual (theo doi nguoi mua) — KHONG lien quan flow Ke hoach, chi them action moi cuoi file, khong sua ham nao co san (generatePlanNow/applyPlanWeights/clearPlanWeights nguyen). -->
<!-- re-verified: 2026-08-24 22:00 - FIX "bam Luu khong cap nhat": generateAndStorePlan cham (Gemini 30-133s), page thieu maxDuration -> server action bi cat, response khong ve browser. Them maxDuration=300 + SaveGenerateButton (useFormStatus hien "Dang sinh... dung roi trang"). KHONG doi flow NV. -->
<!-- re-verified: 2026-08-24 21:30 - THEM nut "Sinh bai ngay theo ke hoach" (generatePostsNow -> /api/rotate?force=1). Khong doi flow NV: bai van vao Hang doi duyet (dieu cam 1), chi bo guard 1 bai/slot/ngay de nguoi quan ly thay bai theo ke hoach moi ngay thay vi cho 7h mai. -->
<!-- re-verified: 2026-08-24 21:00 - FIX 3 bug huong di TRUNG LAI (user "KHONG DUOC TRUNG"): (1) plan-directions.ts avoidTitles khai bao nhung khong chen vao prompt -> them avoidBlock; (2) them quy tac chong trung trong prompt (moi huong 1 goc khac, cam na na); (3) loadRecentDirectionTitles gop ca huong plan dang ap (khong chi bai da dang); (4) temperature 0.5->0.85. KHONG doi flow NV — chi sua chat luong sinh huong. -->
<!-- re-verified: 2026-08-24 20:30 - FIX CARRY-OVER BUG (user "bam Luu ma T3-T6 khong doi"): tt-diag xac nhan moi plan moi sinh du apply, nhung firstThreeSuggestions all carried:true — carry-over lay 12 fresh cu dung dau -> slice(0,12) vut het fresh moi. FIX quy tac carry: pendingBs (dang cho ban B) LUON carry (khong the bo cap A/B); fresh chua dung: generatedBy='manual' KHONG carry (nguoi bam Luu = muon huong moi), 'cron' toi da 4 (khong mat sach). Voi manual: plan moi = pendingBs (0-N) + 12 fresh moi tu Gemini -> user thay huong doi that su. -->
<!-- re-verified: 2026-08-24 19:50 - Banner XAC NHAN thay doi ke hoach o dau trang (age log < 60s, border 2px xanh/do, emoji 1.8rem) + fix textarea resize:none. KHONG doi flow NV. -->
<!-- re-verified: 2026-08-24 19:30 - FIX silent fail saveGoalFocusAndRegenerate: regenerate return {ok,planId,error} + ghi run_log task=mkt.plan_manual moi lan; UI hien dong log gan nhat duoi nut submit. Them details "Khi nao bam nut nao?" o dau trang, bang datatable 3 cot bao phu 4 nut. KHONG doi flow NV. -->
<!-- re-verified: 2026-08-24 19:00 - Cai dat tuan hint gon: bo hint sub inline duoi field, chuyen vao title tooltip nhan; nut submit + caption vao .settings-cta box border dashed. KHONG doi flow NV. -->
<!-- re-verified: 2026-08-24 18:45 - GOP 3 nut Cai dat tuan ve 1 action moi saveGoalFocusAndRegenerate (upsert 2 app_config song song + 1 lan regeneratePlanAndApply, truoc 2 form 2 nut = 2 plan). Them hint text duoi moi field va tren nut, tooltip cho nut "Tao ke hoach ngay" o header giai thich khac nut moi. KHONG doi flow NV — chi rut gon UX. -->
<!-- re-verified: 2026-08-24 18:15 - REFACTOR /ke-hoach: Ban dang ap = banner len dau (border xanh, badges + Muc tieu + link AI Ke hoach + nut Go ap dung inline); bo dong Dang ap mo o header; bang chi tiet ngay them thead 3 cot; details cuoi chi con Lich su. KHONG doi flow NV. -->
<!-- re-verified: 2026-08-24 17:45 - REFACTOR summary 7 details Lich tuan: BO header row 4 cot dinh lien; summary chi giu ngay + huong di + badge (bo SP/kind/nhom trung body); nut Go ap dung len header; insight_line theo ngay (hom nay: brief.insight_line that; ngay khac: placeholder). KHONG doi flow NV. -->
<!-- re-verified: 2026-08-24 17:20 - REFACTOR body 7 details ngay trong Lich tuan: truoc 4 day-block dot xep doc (Ban A / Ban B / Content / Nhom) moi block padding ~60px = ~240px cao/ngay; sau bang datatable.dir-table compact 3 cot (Khung gio | Noi dung | Kenh) = ~120px cao/ngay. Doc theo cot de scan nhanh 3-4 slot cung ngay. KHONG doi noi dung — cac field giu nguyen (dayTitle, dayProduct, contentPurpose, contentStructure, d.groups). -->
<!-- re-verified: 2026-08-24 17:00 - REFACTOR UI /ke-hoach 4 khoi (thay 8): Header co badge dang ap + nut ap dung de xuat; Cai dat tuan grid 3 cot (Muc tieu+Focus+Nhom chia se); BO bang "Huong di bai viet" rieng (trung lich 7 ngay); Hom nay + Ke hoach tuan giu; Ban ap chi tiet + lich su van <details> cuoi. KHONG doi flow NV — cac form saveWeeklyGoal/saveFocus/applyPlanWeights nguyen, chi doi tri trong DOM. 621 -> 526 dong. -->
<!-- re-verified: 2026-08-24 16:10 - FIX rotate SUGGESTION FRESH pick folder tu 'eligible' thay 'unused' (usedThisCycle khong ap dung cho flow plan-driven). KHONG doi flow NV Ke hoach, sua bug bam sat NV5 R5 "may lam dung ke hoach" — plan uu tien SEA-40 weight 3 thi rotate phai lam SEA-40, khong nhay sang S-Tracking chi vi folder SEA-40 "da dung vong nay". -->
<!-- re-verified: 2026-08-24 15:35 - FIX rotate khong bam plan (KHONG doi flow NV, sua bug bam sat NV5 R5 "may lam dung ke hoach"). Bug: (1) slot chieu chi pick pendingBs -> plan moi ap giua ngay bi rong pendingB -> fallback random -> sinh SP ngoai plan. (2) fallback random khong loc theo weights -> Ac quy lot du plan chi co SF-50+SEA-40. Fix: candidateSuggestions = [...pendingBs,...freshSorted] cho ca 2 slot; fallback random khi hasWeights CHI pick folder in weights, empty -> skip bai ban (log ly do). Nguyen tac user 24/8 "100% theo ke hoach tuan" duoc dam bao. -->
<!-- re-verified: 2026-08-24 14:45 - Migration 20260824150000_mkt_metrics_source_tiktok noi CHECK mkt_metrics.source them 'tiktok'. KHONG doi flow NV Ke hoach: mkt_metrics vao loadMeasurementFromWeekReport (plan.ts) van chi query source='facebook'; tiktok chi phuc vu bang so lieu /do-luong. -->
<!-- re-verified: 2026-08-24 12:35 - UI bang tuan refactor thanh danh sach details.tuan-day (khong doi flow NV, chi doi trinh bay). -->
<!-- re-verified: 2026-08-24 12:15 - /ke-hoach lich tuan hien lai (query live fallback khong bi rop limit 12) + moi ngay co <details> Xem truoc (2 ban A/B + Content + Nhom). Khong doi flow NV. --><!-- re-verified: 2026-08-24 11:15 - Fix R5: ap dung ban learn-weekly = MERGE weights vao ban dang ap (giu huong di), khong thay hang; Nhom chia se dua len tren cung cum cau hinh. Khong doi flow NV. -->
<!-- re-verified: 2026-08-24 10:40 - /ke-hoach thu tu: Muc tieu+Focus (form) -> De xuat learn-weekly -> Hom nay -> lich tuan -> Huong di -> Nhom chia se -> Ban dang ap. Bo form trung. Khong doi flow NV. -->
<!-- re-verified: 2026-08-24 10:20 - Focus carry-over lọc: huong cu chua dung KHONG thuoc focus bi loai khi sinh ban moi (dong nhat cai dat -> ke hoach). Form Muc tieu + Focus len dau /ke-hoach. Nav link ra sdvico.vn. -->
<!-- re-verified: 2026-08-24 09:50 - /ke-hoach: khoi Muc tieu len dau (khong doi flow, chi doi bo cuc). /du-lieu-ai: UI the AI gon, khong doi flow NV. -->
<!-- re-verified: 2026-08-24 09:35 - /ke-hoach gon: huong di doi list->bang datatable 4 cot; ban day du bo bang SP (link sang tab AI Ke hoach), lich su gap 3 dong. Khong doi flow NV. -->
<!-- re-verified: 2026-08-24 09:15 - measurement_source het lap chu (chi tiet README). -->
<!-- re-verified: 2026-08-24 09:05 - Ban tuan lay dung tuan truoc: weekWindowVNOffset offset +1 (truoc -1 ra tuan sau 0 bai -> fallback 7 ngay). Khong doi flow NV. -->
<!-- re-verified: 2026-08-24 02:30 - Gio moi user chot: CN 19h hoc tuan, T2 8h ban tuan (tu ap), moi toi 19h chinh dan. Content bo loai Chan dung (T6 -> Thuat ngu), moi loai content khai MUC DICH (CONTENT_PURPOSE). ?plan=weekly ep ban tuan ngay. -->
<!-- re-verified: 2026-08-23 18:30 - Ban ke hoach TUAN (cron Thu 2) TU AP (sua R5 hanh vi: truoc applied=false cho nguoi bam; theo nguyen tac 22/8 do luong tuan -> ke hoach tuan, ban tuan la xuong song tu dong). Ban cap nhat Thu 6 + de xuat learn-weekly van chi de xuat. Evaluator ghep cap theo huong di (khong theo ab_pair_id). Trang Nguon hien cach Evaluator so + ket luan. -->
<!-- re-verified: 2026-08-22 12:30 - NGUYEN TAC BOSS user chot 22/8 (sua NV4/NV5 hanh vi): ban tuan lay DO LUONG TUAN VUA XONG (khong 7 ngay truot); so lieu ngay chi DICH trong so +-0.5/toi (dampWeights), khong lat ke hoach tuan; huong di A/B giu nguyen. Bai page khac gan nhan o Do luong (khong loai khoi xep hang — user chi yeu cau ghi chu). -->
<!-- re-verified: 2026-08-21 19:55 - Edge fallback voice -> HoaiMy (nu) — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 19:20 - Giong video default Leda (nu) + outro doc chung canh cuoi (chi tiet marketing.md) — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 17:05 - Gemini TTS du phong 3 model noi tiep chong can han muc ngay (chi tiet marketing.md) — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 16:50 - Gemini TTS gian nhip 20s + backoff 429 (chi tiet marketing.md) — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 16:40 - Giong video chinh doi sang Gemini TTS (fallback edge-tts, nguyen khoi theo ban dung) — khong doi flow NV nao cua ba-spec. -->
<!-- re-verified: 2026-08-21 16:15 - Hen gio FB ep +07:00 (fix lech 7 tieng) + video content remap folder Content — khong doi flow NV nao cua ba-spec. -->
<!-- re-verified: 2026-08-21 - NV5/NV11: trong so BOSS gio quyet THU TU rut huong (rotate + plan-live sort fresh theo weights qua guessGroup) — duong truyen BOSS->Creator kin; lich ngay co huong hien dung cap A/B cua huong. -->
<!-- re-verified: 2026-08-21 - /ke-hoach nhan "Cap nhat" doc data.generatedAt cua ban live (row update tai cho, created_at dung im); nhan gio doi 7h/12h30. Chi hien thi, khong doi flow. -->
<!-- re-verified: 2026-08-21 - Giong default ve NAM NamMinh — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 - TTS doc tung cau voi ngu dieu rieng roi ghep (len xuong giong) — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 - Loi thoai video tone trend gioi tre + rate/pitch tang nhe — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 - Giong doc video doi sang NU HoaiMy (default) — khong doi flow NV. -->
<!-- re-verified: 2026-08-21 - Video pipeline: so lien he doi 0939 243 222 + prompt kich ban them cam xuc + tts pitch +2Hz — khong doi flow NV nao. -->
<!-- re-verified: 2026-08-21 - Huong carry-over gan carried=true (plan.ts) de /ke-hoach hien badge "moi" + dong thoi gian ban ap; plan-live giu muc B mo coi trong lich du kien. Khong doi hanh vi rut huong cua rotate. -->
<!-- re-verified: 2026-08-21 - NV11 A/B DOI LAI LAN 2 (user chot dem 21/8): cap A/B chay CUNG NGAY — A slot sang, B slot chieu; slot chieu khong mo huong moi. Ghi de quyet dinh "B hom sau" ban sang. -->
<!-- re-verified: 2026-08-21 - NV11 A/B: ban B CHI sinh tu ngay hom sau (rotate loc pending B theo dayVN(a_at) != hom nay) — truoc slot chieu sinh B cung ngay voi A (user bat 21/8). Bai B sai lich da xoa, huong tra ve cho B. -->
<!-- re-verified: 2026-08-21 - Bo giong ElevenLabs khoi build-video.mjs (user doi y) — TTS ve edge-tts, khong doi hanh vi NV nao. -->
<!-- re-verified: 2026-08-21 - Huong di BOSS viet CO DAU (prompt plan-directions co dau + rang buoc); /ke-hoach huong rejected hien "da loai" thay vi "xong cap"; data plan dang ap viet lai co dau. Khong doi flow NV nao. -->
<!-- re-verified: 2026-08-21 - bumpers.mjs (packages/marketing/src/video) fit chu khung doc — khong doi hanh vi NV nao cua ba-spec (chi trinh bay intro/outro video). -->
<!-- re-verified: 2026-08-21 - Commit upload-zalo-to-bucket.mjs (ban 131 dong) + hoc-video.mjs vao git (NV1 nap tri thuc noi bo — script van hanh khong doi hanh vi). -->
<!-- re-verified: 2026-08-21 - Rotate 7h/12h30 VN; lich hom nay hien huong da sinh that; huong 3 trang thai; generateContentDirections + avoidTitles chong lap chu de. -->
<!-- re-verified: 2026-08-21 - DailyPlan v7 direction+contentStructure; bang lich 5 cot; khoi Nen dang lai; topic hub SEO; khung Zalo OA (NV theo whiteboard Social/Zalo). -->
<!-- re-verified: 2026-08-20 - loadMeasurement skip __page__/__page_real__ + bai da xoa; buildPlan/plan-live loai "Khac"+"Bai content" khoi ranked/weights; UI chi tiet bo narrative dai. -->
<!-- re-verified: 2026-08-20 - DailyPlan.contentKind (rotate lam dung loai ke hoach ghi) + carry-over content_suggestions chua dung khi sinh ban moi + UI bang chung huong da dung hom nay. -->
<!-- re-verified: 2026-08-20 - Nhom chia se 1 nguon /api/share-groups; /ke-hoach bo form nhap tay nhom (popover Quan ly bai viet la noi quan ly); refill huong di khi can (mkt.suggestions_refill 1 lan/ngay) de Creator luon nhan huong tu BOSS. -->
<!-- re-verified: 2026-08-20 - /ke-hoach redesign gon (user: "planner gon gang, the hien day du plan"): khoi Hom nay (dang SP nao may bai + nhom chia se) -> Ke hoach tuan -> Huong di bai viet (tu ban dang ap, hien used/fresh) -> Cai dat gop 3 form vao details -> Ban day du + lich su vao details. Khong doi action/logic, chi bo cuc. -->
<!-- Nhat ky re-verify cu don sang reverify-log.md (20/8/2026). Giu 3 dong moi nhat o day. -->
<!-- re-verified: 2026-08-20 - Bao cao tuan /do-luong/tuan (item 1a): lib/week-report.ts gom mkt_metrics theo tuan ISO VN (T2-CN), KPI+top5+phan bo theo product/kind+delta vs tuan truoc+nut Sao chep bao cao text. Diem composite = engagement + views*0.1 + watchSec*0.02 + reach*0.05. -->
<!-- re-verified: 2026-08-20 - Vong hoc tuan (item 1b, NV4/R5): lib/learn-weekly.ts chay Chu Nhat 23h+ VN qua /api/mkt-metrics-pull, sinh mkt_plans data.origin='learn-weekly' applied=false; /ke-hoach hien banner rieng "De xuat trong so tu so lieu tuan vua xong" - nguoi bam Ap dung moi co hieu luc. KHONG tu doi KIND_WEIGHT. Guard alreadyRanThisWeek 24h chan trung; ?learn=1 ep test. Plan.origin them truong ('boss' | 'learn-weekly'). -->
<!-- re-verified: 2026-08-20 - AI Planner NHIP MOI (user chot): "tu cap nhat de xuat roi moi toi ap dung, cuoi tuan bao cao" + them o nhap 4 group. lib/plan-live.ts: refreshLiveProposal (moi 30p, cron mkt-metrics-pull, khong Gemini) tinh trong so + so bai moi san pham + LICH THEO NGAY (san pham nao may bai, chia se nhom nao xoay vong) -> luu 1 ban origin='live' applied=false cap nhat tai cho. applyLiveEvening (>=21h VN, guard run_log mkt.live_apply 1 lan/ngay) GOP weights+daily_schedule+share_groups vao ban DANG AP (giu content_suggestions/huong di A/B). app_config mkt_share_groups (goal-actions saveShareGroups). Plan them daily_schedule + share_groups + origin 'live'. /ke-hoach: o nhap Nhom chia se + the "Ke hoach song" (bang so bai/SP + lich 7 ngay + nhom). ?live=1 ep ap. Kiem chung: SEA-40 11 bai/SF-50 4 bai, lich 7 ngay xoay 4 nhom, merge giu 6 huong di. -->

> **Mục đích**: oracle HÀNH VI cho khối tính năng "Kế hoạch AI v2 + kênh mở rộng" — phản hồi của sếp trên whiteboard Bạn B trình bày ngày 18/8/2026 (xem [marketing.md](marketing.md) cho luồng hiện có, [../roadmap-marketing.md](../roadmap-marketing.md) cho lịch 5 tuần). KHÔNG mô tả giao diện.

---

## 1. Vấn đề & JTBD

- **Job**: Khi một tuần làm việc mới bắt đầu, Bạn B muốn có một bản kế hoạch nội dung được đúc kết từ dữ liệu thật (nội bộ công ty + tri thức ngành cá cập nhật), không chỉ từ số đo lường cũ, để định hướng dây chuyền sản xuất tốt hơn — đồng thời công ty cần thêm ba năng lực còn thiếu mà sếp chỉ ra: SEO, Social đa kênh, và quảng cáo trả phí (AD).
- **Vì sao làm bây giờ**: sếp chê whiteboard hiện tại của Bạn B "còn thiếu", cụ thể Kế hoạch AI v1 (đã chạy) chỉ đọc `mkt_metrics`, chưa chủ động học; SEO/Social đa kênh/AD gần như chưa có gì.
- **Đo thành công bằng**: kế hoạch tuần sinh đúng lịch có ghi rõ nguồn đã học; không có nghiệp vụ mới nào phá vỡ bảy điều cấm hoặc "không phá rào nền tảng" (CLAUDE.md mục 7); phần phụ thuộc quyết định người khác được khoanh vùng rõ, không chặn phần làm được ngay (chi tiết từng chỉ tiêu ở §8).

## 2. User registry

| User (role/tier) | Là ai | Vòng đời | Thiết bị/bối cảnh chính |
|---|---|---|---|
| Bạn B | chủ dự án Marketing, vận hành hệ thống, duyệt kế hoạch và nội dung | quen | desktop |
| Phòng Kinh doanh | chốt dữ liệu sản phẩm thật, có thể chọn mục tiêu SEO địa phương | quen | — |
| Sếp / cấp quản lý | duyệt nội dung `needs_gov_review`, duyệt ngân sách AD | quen | — |
| Nhân viên phụ trách nạp tri thức nội bộ | định kỳ chuyển kết quả trích xuất từ Zalo (Cowork hoặc công cụ khác Bạn B tự chọn) thành file, thả vào bucket Supabase; hệ thống đọc file (KHÔNG phải bot tự vào Zalo — xem §5 NV1 lý do) | mới, vai trò cần Bạn B giao (hoặc Bạn B tự làm) | mobile hoặc desktop |
| Hệ thống Kế hoạch AI (cron) | actor tự động: học dữ liệu, tổng hợp, sinh kế hoạch tuần | — | nền, GitHub Actions |
| Hệ thống Dây chuyền nội dung (đã có) | actor tự động hiện có, nhận trọng số/định hướng từ Kế hoạch | — | nền |

## 3. User × Nghiệp vụ

| # | Nghiệp vụ | Owner-user | User liên quan (cross) | Phụ thuộc NV | Tần suất | Ưu tiên |
|---|---|---|---|---|---|---|
| NV1 | Nạp tri thức nội bộ vào Kho tri thức (thả file đã trích xuất từ Zalo vào bucket) | Nhân viên phụ trách nạp tri thức nội bộ | Hệ thống Kế hoạch AI (đọc lại làm nguyên liệu) | — | tuỳ ý, không bắt buộc mỗi tuần | Must — build khung ngay, việc vận hành chờ Bạn B giao người (xem §11) |
| NV2 | Tự học tri thức public ngành cá/thủy sản | Hệ thống Kế hoạch AI | — | — | mỗi ngày (RSS); Chủ nhật thêm lượt quét sâu | Must |
| NV3 | Tổng hợp và sinh Kế hoạch (kèm hướng đi cho Creator) | Hệ thống Kế hoạch AI | Bạn B (nhận để xem) | NV2 (bắt buộc), NV1 (tuỳ có) | Thứ 2 từ 8h sáng (kế hoạch tuần) và Thứ 6 từ 8h sáng (cập nhật lần 1, đủ 4 ngày số liệu); mỗi ngày tối đa 1 bản tự động | Must |
| NV4 | Xem, duyệt và áp dụng Kế hoạch tuần (mở rộng hiển thị nguồn học của bản v1 đã có) | Bạn B | Hệ thống Dây chuyền nội dung (nhận trọng số) | NV3 | mỗi tuần | Must |
| NV5 | Đề xuất và duyệt mục tiêu SEO backlink theo từ khóa | Hệ thống (đề xuất), Bạn B (duyệt) | Phòng Kinh doanh (nếu mục tiêu chạm nội dung sản phẩm/giá) | — | theo lô | Should — chờ chốt phạm vi, xem §11 |
| NV6 | Dựng thêm bản Video Shorts 10-20 giây cho đa kênh | Hệ thống Dây chuyền video (đã có) | Bạn B (duyệt như video hiện tại) | — | mỗi video được yêu cầu | Should |
| NV7 | Seeding hội nhóm ngoài (đăng video/bài vào group qua tài khoản cá nhân hoặc fanpage) | Bạn B (người thao tác) | — | — | theo lô | Could — chờ chốt tài khoản, xem §11 |
| NV8 | Đề xuất và duyệt ngân sách quảng cáo trả phí (AD) | Bạn B (đề xuất) | Sếp / cấp quản lý (duyệt ngân sách) | — | theo chiến dịch | Should — chờ chốt ngân sách, xem §11 |
| NV9 | Đo lường hiệu quả AD (CPC, điểm chạm) | Hệ thống (đọc report Ads) | Bạn B (xem ở Đo lường) | NV8 | định kỳ | Should |
| NV10 | Giao mục tiêu tuần cho Kế hoạch AI (flowchart v3: khối MỤC TIÊU) | Bạn B / Sếp | Hệ thống Kế hoạch AI (đọc khi sinh kế hoạch và hướng đi) | — | mỗi tuần hoặc khi đổi ưu tiên | Must |
| NV11 | Sinh cặp bài thử A/B cho một hướng đi (flowchart v3: AI Creator) | Hệ thống Dây chuyền nội dung | Bạn B (duyệt cả cặp như bài thường) | NV3 (có hướng đi) | mỗi lần vòng xoay chạy có hướng đi chưa dùng | Must |
| NV12 | Đánh giá cặp A/B và ghi kết quả ngược về Kho tri thức (flowchart v3: AI Evaluator, vòng lặp kín) | Hệ thống Kế hoạch AI | — | NV11 (có cặp) + số liệu Đo lường | hằng ngày (kết luận ghi đè theo cặp, số liệu lớn dần tự cập nhật) | Must |

> NV1, NV5, NV8, NV7 có phần **bị khoá bởi quyết định người khác chưa chốt** — không phải nghiệp vụ mồ côi, chỉ chưa đủ điều kiện build phần vận hành thật. Chi tiết Scope §7 và Open questions §11.

## 4. Cross-user handoff map

| Chặng | Nghiệp vụ | Từ user | → User nhận | Điều kiện chuyển | Điểm kết nếu KHÔNG ai nhận |
|---|---|---|---|---|---|
| H1 | NV1→NV3 | Nhân viên phụ trách (đã thả file vào bucket) | Hệ thống Kế hoạch AI (đọc file làm nguyên liệu) | file trong bucket được import thành bản ghi tri thức trước sáng Chủ nhật | không ai thả file tuần đó → Kế hoạch AI vẫn chạy, chỉ dùng NV2 và `mkt_metrics`, ghi rõ trong bản kế hoạch là thiếu nguồn nội bộ tuần này, KHÔNG chặn cả tiến trình |
| H2 | NV3→NV4 | Hệ thống Kế hoạch AI (đã sinh bản kế hoạch) | Bạn B (xem và quyết định áp dụng) | bản kế hoạch ở trạng thái mới sinh | Bạn B chưa xem → bản kế hoạch cũ đang áp dụng (nếu có) tiếp tục có hiệu lực, KHÔNG tự động thay bằng bản mới (giữ nguyên tắc máy đề xuất, người quyết) |
| H3 | NV4→Dây chuyền nội dung | Bạn B (đã xác nhận áp dụng trọng số) | Hệ thống Dây chuyền nội dung (nhận trọng số) | trạng thái áp dụng = có hiệu lực | đã có sẵn ở bản v1, không đổi |
| H4 | NV5 | Hệ thống (đã đề xuất danh sách mục tiêu backlink) | Bạn B (duyệt trước khi đăng ký ngoài) | danh sách ở trạng thái chờ duyệt | không duyệt → không mục tiêu nào được đăng ký, mặc định an toàn |
| H5 | NV8 | Bạn B (đã đề xuất ngân sách + chiến dịch cụ thể) | Sếp / cấp quản lý (duyệt ngân sách) | đề xuất có số tiền, kênh, thời gian cụ thể | sếp chưa duyệt → chiến dịch ở trạng thái chờ duyệt ngân sách vô thời hạn, KHÔNG tự chạy trên nền tảng quảng cáo |

## 5. Flows (Input → Steps → Output)

### Flow NV1 — Nạp tri thức nội bộ vào Kho tri thức · owner: Nhân viên phụ trách nạp tri thức nội bộ
- **Vì sao không phải bot tự đọc Zalo**: đã xác minh Zalo không có API chính thức nào cho ứng dụng bên ngoài đọc lịch sử tin nhắn của một nhóm chat nội bộ có sẵn (Zalo OA chỉ có GMF — nhóm do chính OA tạo để chăm sóc khách hàng, không áp dụng cho nhóm nội bộ nhân viên). Cách duy nhất để tự động hoá việc đọc là dùng thư viện không chính thức mô phỏng đăng nhập Zalo cá nhân, có rủi ro thật bị khoá tài khoản và vi phạm điều khoản dịch vụ. Việc này vi phạm CLAUDE.md mục 7 "gặp rào chắn của nền tảng thì dừng, không phá rào". Do đó NV1 tách rõ hai phần: phần trích xuất từ Zalo do người phụ trách (hoặc công cụ ngoài như Cowork) tự xử lý; hệ thống chỉ tiếp nhận đầu ra dưới dạng file.
- **Start**: có kết quả trích xuất từ Zalo (nội dung tin nhắn nội bộ, phản hồi khách, câu hỏi hay gặp...) do người phụ trách chuyển sang file
- **Input**: file văn bản (`.txt`, `.md`, `.html`, `.json`) hoặc ảnh chụp màn hình (`.jpg`, `.png`) chứa nội dung trích xuất
- **Steps**: người phụ trách thả file vào bucket Supabase `kho-tri-thuc-noi-bo` (qua giao diện Kho tư liệu có sẵn) → hệ thống định kỳ (hoặc chạy tay) quét bucket → với mỗi file mới, đọc nội dung (văn bản trực tiếp hoặc ảnh qua Gemini vision), tóm tắt các điểm chính, lưu thành bản ghi tri thức nguồn nội bộ có gắn tên file gốc → đánh dấu file đã import để không xử lý lại
- **Output**: một hoặc nhiều bản ghi tri thức nguồn nội bộ, mỗi bản ghi gắn đường dẫn tệp gốc trong bucket, sẵn sàng cho Kế hoạch AI đọc ở NV3
- **End**: bản ghi xuất hiện trong danh sách Kho tri thức, file gốc vẫn nằm trong bucket (đánh dấu đã import)
- **Cross**: H1 (→ Hệ thống Kế hoạch AI)

### Flow NV2 — Tự học tri thức public ngành cá · owner: Hệ thống Kế hoạch AI
- **Start**: đến lịch chạy Chủ nhật (giờ Việt Nam)
- **Input**: không cần thao tác người; hệ thống tự tìm kiếm nội dung public liên quan ngành biển và thủy sản Việt Nam
- **Steps**: tìm kiếm → chọn nguồn có đường dẫn xác định → tóm tắt và đánh giá mức liên quan → nếu nội dung chạm quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư thì gắn cờ cần duyệt cấp quản lý → lưu thành bản ghi tri thức nguồn public, kèm đường dẫn nguồn
- **Output**: một hoặc nhiều bản ghi tri thức nguồn public, mỗi bản ghi có đường dẫn nguồn xác định; KHÔNG có bất kỳ bài nội dung hay hàng chờ duyệt nào được tạo ở bước này (chỉ là nguyên liệu định hướng, xem R3)
- **End**: bản ghi sẵn sàng cho NV3 dùng sáng Thứ 2
- **Cross**: không cross-user, chỉ chuyển tiếp nội bộ hệ thống sang NV3

### Flow NV3 — Tổng hợp và sinh Kế hoạch tuần v2 · owner: Hệ thống Kế hoạch AI
- **Start**: đến lịch chạy sáng Thứ 2 (hoặc chạy tay)
- **Input**: số đo lường 7 ngày gần nhất (như bản v1), bản ghi tri thức nguồn internal trong 7 ngày qua (NV1, có thể rỗng), bản ghi tri thức nguồn public trong 7 ngày qua (NV2)
- **Steps**: xếp hạng sản phẩm theo số liệu (giữ nguyên thuật toán v1) → đọc thêm các bản ghi tri thức internal và public liên quan tuần đó → sinh đoạn định hướng có nêu rõ đã dùng bao nhiêu nguồn mỗi loại → nếu một nguồn loại nào đó rỗng, đoạn định hướng phải nêu rõ thay vì im lặng bỏ qua
- **Output**: một bản kế hoạch mới, có thêm số lượng nguồn tri thức đã dùng theo từng loại, và trọng số phân bổ như bản v1
- **End**: bản kế hoạch ở trạng thái mới sinh, chờ Bạn B xem
- **Cross**: H2 (→ Bạn B)

### Flow NV4 — Xem, duyệt và áp dụng Kế hoạch tuần · owner: Bạn B (mở rộng luồng v1 đã có)
- **Start**: có bản kế hoạch mới từ NV3
- **Input**: bản kế hoạch (đoạn định hướng, bảng xếp hạng sản phẩm, số nguồn tri thức đã dùng)
- **Steps**: Bạn B xem trang Kế hoạch, xem chi tiết từng bản ghi tri thức đã dùng nếu cần → xác nhận áp dụng trọng số hoặc bỏ qua
- **Output**: nếu áp dụng, trọng số có hiệu lực cho vòng xoay sinh nội dung; nếu bỏ qua, trọng số cũ (nếu có) giữ nguyên hiệu lực
- **End**: trạng thái áp dụng được cập nhật
- **Cross**: H3 (→ Dây chuyền nội dung)

### Flow NV5 — Đề xuất và duyệt mục tiêu SEO backlink · owner: Hệ thống (đề xuất), Bạn B (duyệt)
- **Start**: có kho từ khóa đã phân loại theo ý định tìm kiếm
- **Input**: kho từ khóa (`mkt_keywords`), danh mục sản phẩm thật đã chốt (CLAUDE.md mục 2)
- **Steps**: hệ thống đề xuất một danh sách mục tiêu (từ khóa trọng tâm + loại nội dung đẩy công khai) → Bạn B duyệt danh sách → mục đã duyệt mới được thực hiện đăng ký/gửi ngoài hệ thống công ty
- **Output**: danh sách mục tiêu ở trạng thái chờ duyệt, sau khi duyệt chuyển thành việc cần làm ngoài code (đăng ký thư mục, trao đổi đối tác)
- **End**: mục tiêu đã duyệt được đánh dấu để người thực hiện tiếp tục ngoài hệ thống
- **Cross**: H4 (→ Bạn B); nếu mục tiêu chạm nội dung sản phẩm/giá chưa chốt thì cross thêm Phòng Kinh doanh trước khi đưa vào danh sách đề xuất

### Flow NV6 — Dựng thêm bản Video Shorts 10-20 giây · owner: Hệ thống Dây chuyền video (mở rộng pipeline đã có)
- **Start**: có bài đã có kịch bản/video từ dây chuyền hiện tại (`build-video.mjs`)
- **Input**: kịch bản gốc và video đã dựng (bản ngang FB, bản dọc TikTok)
- **Steps**: chọn đoạn mở đầu gây chú ý nhất từ kịch bản gốc → dựng thêm một bản ngắn 10-20 giây → đẩy vào cùng hàng chờ duyệt như video gốc
- **Output**: thêm một bản Shorts gắn với cùng bài, chờ duyệt như quy trình video hiện tại
- **End**: bản Shorts xuất hiện trong hàng chờ duyệt kèm bản gốc
- **Cross**: không cross-user mới, dùng lại luồng duyệt hiện có

### Flow NV7 — Seeding hội nhóm ngoài · owner: Bạn B (người thao tác)
- **Start**: có bài/video đã đăng chính thức trên Trang của công ty
- **Input**: bài/video đã duyệt, danh sách nhóm mục tiêu do Bạn B tự chọn
- **Steps**: hệ thống chuẩn bị sẵn nội dung gợi ý (đoạn giới thiệu ngắn + liên kết bài gốc) → Bạn B tự thao tác đăng vào từng nhóm bằng tài khoản cá nhân hoặc fanpage của mình
- **Output**: bài xuất hiện trong nhóm ngoài do Bạn B tự đăng
- **End**: không có bản ghi tự động nào xác nhận (nghiệp vụ thủ công, ngoài hệ thống)
- **Cross**: không cross-user; KHÔNG tự động hoá đăng nhập tài khoản cá nhân vào nhóm ngoài — cùng lý do rủi ro khoá tài khoản như NV1

### Flow NV8 — Đề xuất và duyệt ngân sách quảng cáo trả phí (AD) · owner: Bạn B (đề xuất), Sếp/cấp quản lý (duyệt)
- **Start**: Bạn B muốn chạy một chiến dịch quảng cáo trả phí
- **Input**: kênh (FB, Google, TikTok, hoặc Zalo), số tiền ngân sách, thời gian chạy, mục tiêu click-to-action
- **Steps**: Bạn B gửi đề xuất chiến dịch cụ thể → Sếp/cấp quản lý xem và duyệt hoặc từ chối → chỉ chiến dịch đã duyệt mới được tạo thật trên nền tảng quảng cáo tương ứng
- **Output**: chiến dịch ở trạng thái đã duyệt (sẵn sàng tạo trên nền tảng) hoặc từ chối (kèm lý do)
- **End**: trạng thái chiến dịch rõ ràng, không có chiến dịch nào chạy ngoài luồng duyệt
- **Cross**: H5 (→ Sếp/cấp quản lý)

### Flow NV9 — Đo lường hiệu quả AD · owner: Hệ thống (đọc report Ads)
- **Start**: có ít nhất một chiến dịch đã chạy trên nền tảng quảng cáo
- **Input**: báo cáo từ nền tảng quảng cáo (chi phí, số click, số điểm chạm)
- **Steps**: kéo số liệu định kỳ → tính chi phí trên mỗi lượt click (CPC) → lưu vào bảng đo lường chung
- **Output**: số liệu CPC và điểm chạm gắn theo từng chiến dịch, hiển thị cùng trang Đo lường hiện có
- **End**: Bạn B xem được số liệu AD cạnh số liệu tổ chức tự nhiên hiện có
- **Cross**: không cross-user mới, Bạn B xem qua trang Đo lường hiện có

### Flow NV10 — Giao mục tiêu tuần · owner: Bạn B / Sếp
- **Start**: người quản lý muốn đổi ưu tiên tuần (sản phẩm, số cuộc gọi cần đạt, có chạy quảng cáo không)
- **Input**: một đoạn mục tiêu viết như giao việc cho nhân viên
- **Steps**: nhập mục tiêu trên trang Kế hoạch → hệ thống lưu (một bản duy nhất, ghi đè bản cũ) → mọi lần sinh kế hoạch và hướng đi sau đó đều đọc mục tiêu này đưa vào phần định hướng
- **Output**: bản kế hoạch và danh sách hướng đi bám mục tiêu; mục tiêu hiện nguyên văn đầu đoạn định hướng
- **End**: mục tiêu có hiệu lực tới khi người quản lý sửa lại
- **Cross**: không cross; hệ thống chỉ đọc

### Flow NV11 — Sinh cặp bài thử A/B · owner: Hệ thống Dây chuyền nội dung
- **Start**: vòng xoay chạy và kế hoạch đang áp dụng còn hướng đi chưa dùng
- **Input**: một hướng đi (tiêu đề, lý do, sản phẩm), tư liệu ảnh của folder sản phẩm khớp
- **Steps**: chọn đúng một hướng đi → sinh hai bài bán cùng sản phẩm: bản A theo góc của hướng đi, bản B theo góc đối chứng (ưu tiên ảnh khác nhau) → cả hai vào hàng chờ duyệt với nhãn phân biệt → đánh dấu hướng đi đã dùng
- **Output**: đúng 2 bài chờ duyệt cùng mã cặp, khác biến thể; cộng 1 bài content thường lệ là đủ hạn mức 3 bài/ngày
- **End**: người duyệt xử lý từng bài như bài thường (máy soạn, người bấm — điều cấm 1)
- **Cross**: không cross mới, dùng luồng duyệt hiện có

### Flow NV12 — Đánh giá cặp A/B và học ngược · owner: Hệ thống Kế hoạch AI
- **Start**: đến Thứ 4 hoặc Chủ nhật (trước bước sinh kế hoạch), có ít nhất một cặp A/B đã có số liệu
- **Input**: các cặp bài A/B 30 ngày qua và số liệu tương tác mới nhất của từng bài (khi quảng cáo trả phí chạy thì thêm CPC, điểm chạm)
- **Steps**: gom bài theo mã cặp → cặp nào đủ số liệu cả hai bên và không cùng bằng 0 thì so sánh → viết kết luận bản nào ăn khách hơn → ghi đè kết luận vào Kho tri thức nội bộ theo mã cặp (một cặp một bản ghi, số liệu lớn dần thì kết luận tự cập nhật)
- **Output**: bản ghi kết luận trong Kho tri thức; lần sinh kế hoạch và hướng đi kế tiếp tự đọc kết luận này làm nguyên liệu — vòng lặp kín, các AI cùng học từ kết quả thật
- **End**: cặp chưa đủ số liệu được bỏ qua chờ lần chạy sau, không kết luận ẩu
- **Cross**: không cross; đầu ra quay về chính Kho tri thức (H1)

## 6. Flow optimization log

| Flow | Candidate đã cân nhắc | Chọn / Loại | Lý do (theo rubric) | Đánh giá bởi | Conflict & xử (nếu có) |
|---|---|---|---|---|---|
| NV1 | A: bot tự động đăng nhập Zalo cá nhân đọc nhóm chat qua thư viện không chính thức · B: người phụ trách định kỳ nhập tay tổng hợp vào Kho tư liệu | Chọn B | A phá rào nền tảng (không có API chính thức, rủi ro khoá tài khoản, vi phạm điều khoản Zalo) — vi phạm CLAUDE.md mục 7 và rubric "định hướng" (nằm ngoài scope an toàn cho phép); B có input/output rõ, không treo khi thiếu người nhập (rubric #2, #3) | Domain-Specialist (xác minh kỹ thuật Zalo OA/GMF, xem §5 NV1) | Specialist veto A → Orchestrator chốt B |
| NV2 | A: AI tự do tìm kiếm và đưa thẳng kết quả vào bài đăng, không qua lọc · B: AI tìm kiếm định kỳ, chỉ tạo bản ghi tri thức có gắn nguồn, gắn cờ duyệt cấp quản lý nếu chạm quy định, không tự sinh bài đăng | Chọn B | A vi phạm điều cấm 3 và 5 (bịa/thiếu kiểm chứng nguồn, có thể chạm quy định nhà nước mà không qua duyệt); B giữ tri thức chỉ là nguyên liệu định hướng, mọi nội dung đăng thật vẫn qua luồng duyệt sẵn có (rubric "không dead-end", "cross tối thiểu") | Domain-Specialist (đối chiếu 7 điều cấm) + Optimizer | Không có, A bị loại thẳng vì vi phạm rule cứng |
| NV8 | A: Bạn B tự quyết ngân sách và chạy quảng cáo trực tiếp · B: Bạn B đề xuất, Sếp/cấp quản lý duyệt trước khi chiến dịch được tạo thật | Chọn B | A không có ai chốt thẩm quyền chi tiêu, rủi ro tài chính không kiểm soát (rubric "không dead-end" áp cho luồng tiền: chi tiêu không người duyệt = treo trách nhiệm); B theo đúng khuôn mẫu approval đã có trong hệ thống (tương tự điều cấm 1&2: máy/người đề xuất, người có thẩm quyền chốt) | Optimizer | Không có |
| NV7 | A: tự động hoá đăng nhập tài khoản cá nhân để seeding hàng loạt · B: hệ thống soạn sẵn nội dung gợi ý, người tự thao tác đăng | Chọn B | A cùng rủi ro khoá tài khoản như NV1, ngoài ra còn rủi ro bị nền tảng đánh dấu spam nếu đăng hàng loạt tự động vào nhiều nhóm; B giữ người trong vòng lặp, tuân "không phá rào" | Domain-Specialist + Optimizer | Specialist veto A → Orchestrator chốt B |

## 7. Scope & Priority

- **IN (build tuần 34, không phụ thuộc quyết định người khác)**:
  - NV2 — tự học tri thức public ngành cá (cron Chủ nhật)
  - NV3 — tổng hợp Kế hoạch tuần v2 dùng thêm nguồn NV2 (và NV1 nếu có)
  - NV4 — mở rộng hiển thị nguồn tri thức trên trang Kế hoạch (không đổi luồng duyệt/áp dụng hiện có)
  - NV1 — phần khung nhập liệu tổng hợp nội bộ ở Kho tư liệu (ai dùng khung này để nhập là việc vận hành, chờ Bạn B giao người — xem §11, nhưng bản thân khung nhập không phụ thuộc ai khác)
  - NV10 — ô giao mục tiêu tuần trên trang Kế hoạch (v1.3)
  - NV11 — vòng xoay sinh cặp bài thử A/B theo hướng đi (v1.3)
  - NV12 — đánh giá cặp A/B, ghi kết luận về Kho tri thức, chạy Thứ 4 và Chủ nhật (v1.3; thước đo tạm là tương tác, chờ AD để lên CPC)
  - NV6 — Video Shorts A/B: bài thuộc cặp thử tự dựng video chế độ Shorts 10-18 giây lõi, cặp video mang mã riêng để đánh giá tách khỏi cặp bài text (v1.4, user chốt "cứ làm đi" 18/8)
- **OUT (chờ chốt trước khi build phần vận hành thật — xem §11 Open questions)**:
  - NV1 (vận hành thật) — ai là người phụ trách, tần suất
  - NV5 — SEO backlink, danh sách mục tiêu do ai chọn (có thể gộp vào tuần 36 SEO địa phương đã có trong roadmap, tránh làm trùng)
  - NV6 — Video Shorts 10-20 giây, xác nhận ưu tiên thời gian với các việc khác trong tuần
  - NV7 — Seeding hội nhóm, dùng tài khoản nào
  - NV8, NV9 — AD trả phí, chờ ngân sách và kênh ưu tiên

## 8. Success metric

| Nghiệp vụ | Metric | Ngưỡng đạt |
|---|---|---|
| NV2 | tỷ lệ lần chạy cron Chủ nhật sinh được ít nhất 1 bản ghi tri thức public có nguồn hợp lệ | ≥ 90% trong 4 tuần đầu, đo qua `run_log` |
| NV3 | bản kế hoạch tuần có trường số nguồn tri thức đã dùng | 100% bản kế hoạch từ tuần 34 trở đi |
| NV1 | tỷ lệ tuần có ít nhất 1 bản ghi tổng hợp nội bộ mới (chỉ tính sau khi đã giao người phụ trách) | theo dõi, chưa đặt ngưỡng tới khi §11 mục 1 được chốt |
| NV8 | chiến dịch AD chạy thật trên nền tảng mà không có bản duyệt ngân sách trước đó | 0 (bắt buộc tuyệt đối, không có ngoại lệ) |

## 9. Rules & Invariants

| # | Rule | Edge case |
|---|---|---|
| R1 | Không có luồng nào tự động đăng nhập hoặc thao tác trên tài khoản Zalo/mạng xã hội cá nhân bằng thư viện không chính thức để đọc hoặc đăng thay người | nếu sau này nền tảng ra API chính thức phù hợp, phải chạy lại BA để đánh giá, không tự ý bật lại theo cách cũ |
| R2 | Mọi bản ghi tri thức nguồn public phải có đường dẫn nguồn xác định | tìm kiếm không ra nguồn nào hợp lệ tuần đó → không tạo bản ghi rỗng, chỉ ghi log, không giả lập nguồn |
| R3 | Tri thức có cờ cần duyệt cấp quản lý không được dùng để tạo trực tiếp bài nội dung hay hàng chờ duyệt ở bước học (NV2, NV3); nội dung sinh ra theo định hướng đó vẫn phải qua đúng luồng `needs_gov_review` hiện có | nếu Kế hoạch gợi ý một hướng nội dung dựa trên tri thức có cờ, bài content sinh ra theo hướng đó vẫn phải tự đặt `needs_gov_review=true` như luồng hiện tại, không có đường tắt |
| R4 | Chiến dịch AD không được tạo thật trên bất kỳ nền tảng quảng cáo nào nếu chưa có bản duyệt ngân sách ở trạng thái đã duyệt gắn số tiền cụ thể | không suy luận hoặc dùng ngân sách mặc định khi thiếu bản duyệt |
| R5 | Kế hoạch tuần không tự áp dụng trọng số mới; chỉ có hiệu lực khi Bạn B xác nhận (giữ nguyên nguyên tắc máy đề xuất, người quyết của bản v1) | bản kế hoạch mới sinh ra trong lúc bản cũ đang áp dụng → bản cũ tiếp tục có hiệu lực tới khi Bạn B xác nhận đổi |

## 10. Acceptance Criteria — ORACLE

> AC-1 đến AC-4 thuộc phần IN scope tuần 34 (§7), có thể build ngay. AC-5 đến AC-10 mô tả hành vi mục tiêu cho phần OUT scope, dùng làm oracle khi Open questions ở §11 được chốt.

### AC-1 — Import file từ bucket vào Kho tri thức nội bộ · Maps to flow: NV1 · Test: integration
- **Given** người phụ trách đã thả một file `.txt` (hoặc `.md`, `.html`, `.json`, ảnh) vào bucket `kho-tri-thuc-noi-bo` và file chưa từng được import
- **When** tiến trình quét bucket chạy (định kỳ hoặc chạy tay)
- **Then** một bản ghi tri thức mới nguồn nội bộ được tạo, có gắn đường dẫn tệp gốc trong bucket, có nội dung tóm tắt khác rỗng, và file được đánh dấu đã import để không xử lý lại
- **Assert**: sau khi tiến trình chạy xong, số bản ghi tri thức nguồn nội bộ gắn đường dẫn file đó == 1, nội dung tóm tắt của bản ghi khác rỗng, chạy lại tiến trình lần thứ hai không tạo thêm bản ghi trùng cho cùng file

### AC-2 — Kế hoạch AI tự học tri thức ngành cá hằng ngày · Maps to flow: NV2 · Test: integration
- **Given** tiến trình học tri thức public hằng ngày được kích hoạt (cron hoặc chạy tay) và nguồn tin ngành có bài mới chưa lưu
- **When** tiến trình chạy xong không lỗi
- **Then** có ít nhất một bản ghi tri thức mới nguồn public trong ngày đó, mỗi bản ghi có đường dẫn nguồn không rỗng, không trùng đường dẫn với bản ghi trong 30 ngày trước, và bản ghi nào có nội dung chạm quy định nhà nước/IUU/Cục Thủy sản/Kiểm ngư thì được gắn cờ cần duyệt cấp quản lý
- **Assert**: số bản ghi tri thức nguồn public tạo trong ngày đó >= 1, 100% số bản ghi đó có đường dẫn nguồn khác rỗng, và số bản ghi trùng đường dẫn trong 30 ngày == 0

### AC-3 — Kế hoạch nêu rõ số nguồn tri thức đã dùng · Maps to flow: NV3 · Test: integration
- **Given** đã có số đo lường 7 ngày qua, và có thể có hoặc không có bản ghi tri thức nội bộ và public trong 7 ngày qua
- **When** tiến trình sinh kế hoạch chạy (Thứ 2 kế hoạch tuần, Thứ 6 cập nhật lần 1, hoặc chạy tay)
- **Then** bản kế hoạch mới có một trường ghi rõ số bản ghi tri thức đã dùng theo từng loại (nội bộ, public); nếu một loại bằng 0 thì đoạn định hướng phải nêu rõ việc thiếu nguồn đó bằng chữ, không được bỏ qua im lặng
- **Assert**: bản kế hoạch mới có trường số nguồn tri thức là một cặp số nguyên không âm (nội bộ, public); nếu cả hai == 0 thì đoạn định hướng chứa cụm từ nêu rõ thiếu nguồn (kiểm bằng so khớp chuỗi)

### AC-14 — Mỗi ngày tối đa một bản kế hoạch tự động, đúng khung giờ · Maps to flow: NV3 · Test: integration
- **Given** hôm nay là Thứ 2 hoặc Thứ 6 theo giờ Việt Nam và tiến trình định kỳ chạy nhiều lần trong ngày (mỗi 30 phút)
- **When** các lần chạy trước 8 giờ sáng và các lần chạy sau khi đã có bản tự động trong ngày đi qua
- **Then** trước 8 giờ sáng không bản tự động nào được sinh; từ 8 giờ sáng chỉ lần chạy đầu tiên sinh đúng một bản (Thứ 2 mang nhãn kế hoạch tuần, Thứ 6 mang nhãn cập nhật giữa tuần, kèm hướng đi), các lần sau trong ngày không sinh thêm
- **Assert**: số bản kế hoạch nguồn tự động tạo trong một ngày Việt Nam <= 1, bản đó có thời điểm tạo >= 8 giờ sáng giờ Việt Nam và trường nhịp == "weekly" (Thứ 2) hoặc "update" (Thứ 6)

### AC-4 — Không tự tạo nội dung hay hàng chờ duyệt từ bước học tri thức · Maps to flow: NV2, NV3 · Test: integration
- **Given** một bản ghi tri thức nguồn public có cờ cần duyệt cấp quản lý
- **When** Kế hoạch AI dùng bản ghi đó để sinh đoạn định hướng của tuần
- **Then** đoạn định hướng chỉ tồn tại dưới dạng văn bản gợi ý trong bản kế hoạch; không có bài nội dung hay mục hàng chờ duyệt nào được tạo tự động từ bước này
- **Assert**: sau khi tiến trình chạy xong, số bài nội dung và số mục hàng chờ duyệt được tạo bởi chính tiến trình sinh kế hoạch trong lần chạy đó == 0

### AC-5 — Trang Kế hoạch hiển thị đúng số nguồn tri thức · Maps to flow: NV4 · Test: e2e
- **Given** có một bản kế hoạch mới nhất với số nguồn tri thức nội bộ bằng 2 và public bằng 5
- **When** Bạn B xem trang Kế hoạch
- **Then** trang hiển thị đúng hai con số đó gắn đúng nhãn loại nguồn tương ứng, kèm liên kết xem chi tiết từng bản ghi tri thức liên quan
- **Assert**: nội dung trang hiển thị chứa số "2" gắn nhãn nội bộ và số "5" gắn nhãn public, khớp đúng với dữ liệu bản kế hoạch đang xem

### AC-6 — Kế hoạch cũ giữ hiệu lực khi kế hoạch mới chưa được xác nhận · Maps to flow: NV4 · Test: integration
- **Given** một bản kế hoạch A đang ở trạng thái áp dụng, và một bản kế hoạch B mới sinh ra
- **When** Bạn B chưa xác nhận áp dụng bản B
- **Then** vòng xoay sinh nội dung vẫn dùng trọng số của bản A, không tự chuyển sang trọng số bản B
- **Assert**: trọng số đang có hiệu lực cho vòng xoay == trọng số của bản kế hoạch có trạng thái áp dụng == true, không phải bản kế hoạch mới nhất theo thời gian tạo

### AC-7 — Danh sách mục tiêu SEO backlink chỉ thực hiện sau khi duyệt · Maps to flow: NV5 · Test: manual (chưa có hạ tầng đăng ký ngoài tự động, người thực hiện đăng ký thủ công sau khi duyệt trong hệ thống — nêu ở §7 OUT)
- **Given** hệ thống đã đề xuất một danh sách mục tiêu backlink ở trạng thái chờ duyệt
- **When** Bạn B chưa xác nhận duyệt danh sách đó
- **Then** không có mục tiêu nào trong danh sách được đánh dấu sẵn sàng để đăng ký ngoài hệ thống
- **Assert**: số mục tiêu có trạng thái "sẵn sàng đăng ký" trong danh sách == 0 khi trạng thái duyệt tổng thể vẫn là "chờ duyệt"

### AC-8 — Bài bán hàng có clip gốc: video AI gộp vào chính bài, đăng Post và Reel · Maps to flow: NV6, NV11 · Test: integration
- **Given** một bài bán hàng từ vòng xoay thuộc folder sản phẩm có ít nhất một clip gốc, đã yêu cầu dựng video
- **When** dây chuyền video dựng xong không lỗi và người duyệt bấm Duyệt (không hẹn giờ)
- **Then** KHÔNG có bài video riêng nào được tạo; chính bài đó có thêm video ngang và video dọc bên cạnh ảnh gốc, kênh gồm Facebook và TikTok, được đánh dấu đăng Post kèm Reel; khi đăng, Facebook có một Post (video ngang, phần chữ bán hàng, ảnh sản phẩm thả bình luận) và một Reel (video dọc), TikTok có bản dọc
- **Assert**: số bài mới sinh bởi dây chuyền video cho bài này == 0; bài có đủ 3 mã tệp ảnh, video ngang, video dọc; sau khi duyệt, số bản ghi đăng kênh Facebook cho bài == 2 (một địa chỉ Post, một địa chỉ chứa "/reel/") và kênh TikTok == 1

### AC-9 — Không chiến dịch AD nào chạy khi chưa có bản duyệt ngân sách · Maps to flow: NV8 · Test: integration
- **Given** một đề xuất chiến dịch AD với số tiền ngân sách cụ thể, chưa được Sếp/cấp quản lý duyệt
- **When** Bạn B thao tác để chiến dịch bắt đầu chạy
- **Then** hệ thống từ chối tạo chiến dịch thật trên nền tảng quảng cáo, giữ chiến dịch ở trạng thái chờ duyệt ngân sách
- **Assert**: trạng thái chiến dịch == "chờ duyệt ngân sách", và số lần gọi tạo chiến dịch thật trên nền tảng quảng cáo cho đề xuất đó == 0

### AC-10 — Đo CPC gắn đúng theo chiến dịch đã duyệt · Maps to flow: NV9 · Test: integration
- **Given** một chiến dịch AD đã duyệt và đã chạy, có số liệu chi phí và số click từ nền tảng quảng cáo
- **When** tiến trình kéo số liệu định kỳ chạy xong
- **Then** một bản ghi đo lường mới được tạo, có chi phí trên mỗi lượt click tính đúng bằng tổng chi phí chia cho tổng số click của chiến dịch đó
- **Assert**: giá trị CPC lưu lại == tổng chi phí / tổng số click (sai số làm tròn không quá 1 đơn vị tiền nhỏ nhất), gắn đúng mã chiến dịch nguồn

### AC-11 — Kế hoạch bám mục tiêu tuần được giao · Maps to flow: NV10, NV3 · Test: integration
- **Given** người quản lý đã lưu mục tiêu tuần với nội dung không rỗng
- **When** tiến trình sinh kế hoạch chạy (cron hoặc chạy tay)
- **Then** bản kế hoạch mới lưu lại nguyên văn mục tiêu và đoạn định hướng mở đầu bằng mục tiêu đó
- **Assert**: bản kế hoạch mới nhất có trường mục tiêu == chuỗi đã lưu, và đoạn định hướng đầu tiên chứa chuỗi "Mục tiêu tuần được giao"

### AC-12 — Vòng xoay sinh đúng cặp A/B cho một hướng đi · Maps to flow: NV11 · Test: integration
- **Given** kế hoạch đang áp dụng có ít nhất một hướng đi chưa dùng, và folder sản phẩm khớp có ít nhất một ảnh
- **When** vòng xoay sinh bài chạy một lần
- **Then** đúng hai bài bán được tạo cùng mã cặp, một bản A một bản B, cả hai ở hàng chờ duyệt trạng thái chờ, và hướng đi đó được đánh dấu đã dùng
- **Assert**: số bài có cùng mã cặp == 2, tập biến thể == {A, B}, số mục hàng chờ duyệt tương ứng trạng thái "pending" == 2, hướng đi trong kế hoạch có mốc thời gian đã dùng khác rỗng

### AC-13 — Kết luận A/B được ghi về Kho tri thức để vòng sau học · Maps to flow: NV12 · Test: integration
- **Given** một cặp A/B mà cả hai bài đều có số liệu tương tác và tổng không cùng bằng 0
- **When** tiến trình đánh giá chạy
- **Then** đúng một bản ghi tri thức nội bộ gắn mã cặp được tạo hoặc cập nhật, nêu rõ biến thể thắng, và lần sinh hướng đi kế tiếp đọc được bản ghi này như một nguồn nội bộ
- **Assert**: số bản ghi tri thức nội bộ có đường dẫn nguồn == "evaluator/" + mã cặp là 1, tóm tắt chứa cụm "bản A" hoặc "bản B", chạy tiến trình lần hai không tạo thêm bản ghi trùng cho cùng cặp

## 11. Assumptions / Open questions

- **Assumptions** (tự quyết khi thiếu info, an toàn):
  - NV1 tần suất nhập không bắt buộc theo lịch cố định; hệ thống chấp nhận thiếu nguồn nội bộ ở bất kỳ tuần nào mà không chặn Kế hoạch AI (R theo H1).
  - NV2 giới hạn phạm vi tìm kiếm ở nội dung liên quan ngành biển và thủy sản Việt Nam để giảm nhiễu; chưa đặt danh sách trắng miền cụ thể, có thể bổ sung sau nếu thấy kết quả không liên quan.
  - NV6 hiểu "Video Shorts" là cắt/dựng thêm một bản ngắn từ kịch bản và tư liệu đã có của dây chuyền hiện tại, không phải sinh kịch bản hoàn toàn mới riêng cho Shorts.

- **Open (RED — chờ Bạn B/sếp chốt, gộp 1 lượt hỏi)**:
  1. NV1 — Ai là "nhân viên phụ trách nạp tri thức nội bộ" (Bạn B tự dùng Cowork rồi thả file, hay giao người khác), và có tần suất tối thiểu mong muốn không (ví dụ ít nhất 1 lần/tuần); Cowork xuất ra định dạng gì để hệ thống chỉnh phần đọc file cho khớp?
  2. NV5 — Danh sách mục tiêu SEO backlink do Bạn B tự tìm hay cần Phòng Kinh doanh chọn; có nên gộp việc này vào tuần 36 (SEO địa phương) đã có sẵn trong roadmap thay vì làm riêng ở đây không?
  3. NV8/NV9 — Ngân sách quảng cáo trả phí mỗi tháng là bao nhiêu, kênh nào chạy trước (FB, Google, TikTok, hay Zalo), và ai giữ tài khoản/thẻ thanh toán để tạo chiến dịch thật sau khi đã duyệt?
  4. NV7 — Seeding hội nhóm dùng tài khoản cá nhân của ai, và Bạn B có chấp nhận đây là thao tác thủ công hoàn toàn (không tự động hoá) hay muốn tìm phương án khác an toàn hơn?

## History

- v1 (2026-08-18): khởi tạo — đặc tả Kế hoạch AI v2 (học hai nguồn: nội bộ nhập tay + public tự tìm kiếm), SEO backlink, mở rộng Social (Video Shorts, seeding hội nhóm), và AD trả phí, theo phản hồi whiteboard của sếp trình bày qua Bạn B ngày 18/8/2026.
- v1.1 (2026-08-18): NV1 chuyển từ "nhập tay vào form Kho tư liệu" sang "thả file vào bucket Supabase" — vì Bạn B dùng Cowork trên chat Claude để đọc Zalo PC, chỉ cần hệ thống nhận đầu ra dạng file. Sửa NV1 flow, AC-1 (Test đổi thành integration, assert theo file), User registry, cross H1, Open question 1.
- v1.2 (2026-08-18): NV3 bổ sung output `content_suggestions` — Kế hoạch v2 giờ ra HƯỚNG ĐI CỤ THỂ (5-7 gợi ý bài đăng bám nguồn tri thức, gọi đúng sản phẩm SDVICO), không chỉ dừng ở "đã học N nguồn". Đây là bước cầu nối để vòng xoay sinh bài dùng tri thức thật. Cũng bổ sung phương án fallback học public qua Google News RSS khi Gemini google_search grounding bị rate limit 429.
- v1.3 (2026-08-18): khép VÒNG LẶP KÍN theo flowchart v3 của Bạn B (docs/flowchart-v3.html, 4 vai AI): thêm NV10 (người giao mục tiêu tuần cho BOSS — khối MỤC TIÊU), NV11 (Creator sinh cặp bài thử A/B cho một hướng đi, 2 bài bán + 1 content = đúng hạn mức 3/ngày), NV12 (Evaluator so cặp A/B theo tương tác FB rồi ghi kết luận ngược về Kho tri thức nội bộ — nhờ đó BOSS và mọi lần sinh kế hoạch sau tự học, không cần bảng mới). Thước đo A/B tạm dùng tương tác vì AD trả phí đang hoãn; khi AD chạy sẽ nâng lên CPC + điểm chạm đúng flowchart. Thêm AC-11, AC-12, AC-13.
- v1.4 (2026-08-18): NV10 nới rõ — mục tiêu tuần ĐƯỢC PHÉP TRỐNG, khi trống BOSS tự định hướng từ dữ liệu các AI đã học (người dùng chốt "đôi khi tôi không biết làm gì thì BOSS cứ dựa vào dữ liệu"); narrative và prompt hướng đi phải nói rõ đang tự định hướng. NV6 chuyển vào IN: bài thuộc cặp A/B tự dựng video chế độ Shorts (kịch bản 2-3 cảnh, lõi 10-18 giây), bài video kế thừa biến thể, mã cặp video = mã cặp nguồn + "-video" để Evaluator so cặp video tách khỏi cặp text. Sửa AC-8 theo flow thật (video là bài mới kế thừa cặp, không phải tệp gắn vào bài cũ). NV4 thêm: xem lại bản kế hoạch cũ từ lịch sử, và sau khi Áp dụng phải thông báo tóm tắt bản áp dụng (ưu tiên vòng xoay, số hướng đi, mục tiêu).
- v1.5 (2026-08-18): chốt NHỊP VÒNG LẶP theo lời user ("AI data 1 lấy data Zalo mỗi ngày, AI data 2 lên mạng học mỗi ngày, Thứ 4 8h sáng cập nhật kế hoạch lần 1, Chủ nhật thu thập tổng, Thứ 2 ra kế hoạch tuần"): NV2 đổi tần suất sang HẰNG NGÀY qua Google News RSS (không quota), Chủ nhật thêm lượt quét sâu Gemini grounding (lỗi 429 bỏ qua); NV3 đổi lịch sinh sang Thứ 2 từ 8h (kế hoạch tuần, cadence weekly) + Thứ 4 từ 8h (cập nhật lần 1, cadence update), mỗi ngày tối đa 1 bản tự động (chặn spam cron 30 phút — lỗi nhịp cũ); Evaluator chuyển sang chạy HẰNG NGÀY (chỉ query, verdict upsert). Mỗi bản kế hoạch (kể cả bấm tay) TỰ KÈM hướng đi qua lib/plan-directions.ts — chỉ đạo Creator không còn phụ thuộc chạy script tay. Sửa AC-2 (hằng ngày + không trùng URL 30 ngày), AC-3 (thêm Thứ 4), thêm AC-14 (khung giờ + chặn trùng).
- v1.6 (2026-08-18): dời bản cập nhật lần 1 từ Thứ 4 sang THỨ 6 từ 8h sáng (user: "cho nó xa tí, vậy mới có số liệu" — bài kế hoạch Thứ 2 chạy được 4 ngày mới đủ tương tác để cập nhật có căn cứ). NV12 ghi đúng tần suất hằng ngày (đã chạy vậy từ v1.5). Sửa NV3, AC-3, AC-14 theo. Hệ thống bắt đầu ĐƯA VÀO HOẠT ĐỘNG THẬT từ tuần này.
- v1.8 (2026-08-18): user chốt lại NV6 sau khi thấy 2 card tách rời: bài bán hàng của sản phẩm có clip gốc = MỘT bài duy nhất, video AI gắn vào chính bài (kèm ảnh), một lần duyệt đăng cả Facebook Post lẫn Reel và TikTok. Không còn "bài video riêng" cho bài bán hàng; bài content và bài Xưởng sản xuất bấm Làm video vẫn tạo bài video riêng như cũ. Đăng Reel không hỗ trợ hẹn giờ (chỉ Post hẹn được), ghi rõ khi duyệt. AC-8 viết lại theo hành vi mới.
- v1.7 (2026-08-18): lần chạy thật đầu tiên (rotate tay ra cặp A/B SF-50 + 1 bài content) bắt được 3 việc: (a) BUG map hướng đi → folder sản phẩm so lệch số thứ tự folder khiến cặp A/B không bao giờ sinh trên cron — đã sửa; (b) người duyệt không bấm được ô hẹn giờ gốc — đổi sang chọn ngày + khung giờ (8h/11h30/19h), hành vi hẹn giờ NV không đổi; (c) nhãn cặp thử không được lộ chữ A/B trong tiêu đề hàng chờ (thông tin cặp giữ trong dữ liệu bài, hiển thị dạng nhãn phụ "Thử A/B") — bổ sung vào R (quy tắc trình bày) cho NV11. Video Shorts từ cặp A/B do cron dựng tự động (~10 phút sau khi có bài), không cần chạm tay.
