# Marketing: workflow và app map

> Đọc khi làm phần Marketing. Phụ trách Bạn B. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.
covers: packages/marketing
last_verified: 2026-08-14
ttl_days: 180
<!-- DOC-STATUS: SUSPECT (2026-08-19) — code 'packages/marketing' doi sau last_verified. DOI CHIEU VOI CODE truoc khi tin. May quan ly dong nay, dung sua tay. -->
<!-- re-verified: 2026-08-14 - build-video RESTORE dung CA 2 ban: horizontal (16:9 cho FB) + vertical (9:16 cho TikTok). Truoc chi ngang -> user thay TikTok khong thay video moi. pushToApprovalQueue upload 2 file -> brand_assets, brief.assets.{video_h,video_v}, channels ['facebook','tiktok'], nhan "[FB 16:9 + TikTok doc] 🎬". Thoi gian dung tang tu ~8p len ~15-20p (danh doi de co ca 2 dinh dang). --skip-whisper van dung. -->
<!-- re-verified: 2026-08-19 - Form Xuong san xuat input/select bi cao ngat vi .note co flex:1 (danh cho .row hang duyet); .sx-field la flex COLUMN nen flex:1 keo chieu cao. Them flex:0 0 auto cho .sx-field .note -> height tu nhien theo padding. -->
<!-- re-verified: 2026-08-19 - Form Xuong san xuat: gioi han .sx-form max-width 720px (user: o bu qua), select ngan .sx-field select.note 320px. Chi trong form san xuat. -->
<!-- re-verified: 2026-08-19 - BUG am thanh chay nen: dialog zoom composer TikTok dong nhung video autoPlay ben trong VAN chay -> chuyen trang khac quay lai van nghe. Fix: onClose pause + currentTime=0. -->
<!-- re-verified: 2026-08-19 - UI LIGHT MODE (user 19/8: kho thay duong): dam mau chu phu --ink-2 #5b6879 -> #3c4a5c (contrast ~7:1 tren trang), dam --line #dce2ec -> #c7d0dd (card noi bat hon), --ink #1a2230 -> #0f1622. applied-banner tang font 15px + line-height 1.6, border-left day 6px, chu p/div dung --ink dam. Dark mode khong doi. -->
<!-- re-verified: 2026-08-19 - Xuong san xuat form (san-xuat/form.tsx) input/select dung .note bi max-width 320px cua .note (dung cho o ghi chu hang doi) -> cot phai trong. Scope override .sx-field .note {max-width:none; width:100%} de field lap full cot form. -->
<!-- re-verified: 2026-08-19 - Giong doc video quay lai NamMinh (nam), rate +8%. -->
<!-- re-verified: 2026-08-19 - Giong doc video mac dinh doi tu vi-VN-NamMinhNeural sang vi-VN-HoaiMyNeural (nu, Friendly Positive) + rate +8% (build-video.mjs). Env TTS_VOICE / TTS_RATE ep khac. -->
<!-- re-verified: 2026-08-19 - packages/marketing/src/product-guard.mjs (SU THAT NGHE theo san pham) dung o social.mjs generateSocialPost + video/script.mjs generateVideoScript: chen luat vao prompt, quet sau sinh, sinh lai 1 lan, cat cau sai (video) / flag 'Sai nghe' (bai). Bo dong 'Nhan loi ich: tiet kiem nhien lieu va nuoc ngot' (goc loi SEA-40 19/8). Sua thi sua CA 2 ban product-guard (app + packages). -->
<!-- re-verified: 2026-08-19 - Bai chan dung (portrait) doi tu KHUNG SUON dien tay sang viet HOAN CHINH voi nhan vat dien hinh (sep chot 19/8 qua user): packages/marketing/src/social.mjs prompt portrait moi; rotate-run.mjs portrait weight 1, khong needsGov, nhan '👤 Chan dung'. Video AI dung LOCAL cho bai e7f6279a (Ac quy) roi mo lai queue row bi tu choi voi assets video_h/video_v + post_reel + tiktok. -->
<!-- re-verified: 2026-08-18 - Ke hoach AI v2 (dac ta docs/app-map/ke-hoach-ai-v2-ba-spec.md, ba-verify PASS): them 2 nguon tri thuc lam nguyen lieu bot sinh Ke hoach. NV1 = file trong bucket kho-tri-thuc-noi-bo (Cowork xuat tu Zalo PC roi tha vao) -> lib/knowledge.ts importInternalFromBucket doc .txt/.md/.html/.json/.jpg/.png (anh qua Gemini vision), tom tat qua Gemini, luu mkt_knowledge_internal (idempotent theo source_path UNIQUE). NV2 = lib/knowledge-public.ts learnPublicKnowledge dung Gemini google_search grounding tim 6 chu de nganh ca VN, luu mkt_knowledge_public co URL nguon bat buoc (dedup 30 ngay). Ca hai KHONG tao bai/hang cho duyet (rule R3 ba-spec). Cron mkt-metrics-pull Chu nhat tu chay ca hai TRUOC khi sinh Ke hoach, maxDuration nang 60->90s. lib/plan.ts generateAndStorePlan them loadRecentKnowledge (7 ngay, 30 muc) -> nhet vao plan.summary.knowledge (internal+publicSrc counts + 5 highlight moi ben), buildNarrative them doan mo dau ve so nguon (cal 2=0 thi noi ro thieu nguon - AC-3). Trang /kho-tri-thuc moi list 2 bang. Trang /ke-hoach them 2 stat tile + details Xem chi tiet nguon. Route /api/kho-tri-thuc?do=internal|public|both cho chay tay/test. Migration 20260818120000 da ap live. -->
<!-- re-verified: 2026-08-18 - Fix narrative Ke hoach v2: doan mo dau ve so nguon tri thuc chay TRUOC early return totalPosts=0 (bug ban dau che khuat "da hoc N ban ghi noi bo" khi chua co bai co so lieu). Nay 0 bai van neu ro so nguon + push doan "chua xep hang" o cuoi. Sinh tay ke hoach id 8893b608 (bam nut Tao tay) hien "Nguon noi bo dung: 4" tren /ke-hoach. Them apps/approval-ui/scripts/run-knowledge-now.mjs va packages/marketing/src/{upload-zalo-to-bucket,check-kho-tri-thuc,check-all-buckets}.mjs cho chay tay khi can gap. Zalo/ folder + zalo-*.{json,jsonl,md} them .gitignore (dieu cam 6). -->
<!-- re-verified: 2026-08-18 - Ke hoach v2 them "Huong di tuan toi" (content_suggestions): Plan type them field content_suggestions: ContentDirection[] (title, why, product, kind, sources, needs_gov_review). Trang /ke-hoach hien section rieng list 5-7 goi y bai dang bam nguon tri thuc that. Sinh boi apps/approval-ui/scripts/generate-plan-directions.mjs (goi Gemini fallback 4 model 2.5-flash->2.0-flash->flash-latest->flash-lite-latest, KHONG dung google_search grounding vi grounding quota nho, chi feed 4 noi bo + 18 public tu DB, prompt yeu cau moi goi y bam nguon cu the va goi ten san pham SDVICO chinh xac). Plan id fcb96a15 sinh 6 huong: "Go the vang IUU quyet liet" (S-Tracking, cần duyệt QL), "Tranh mat song khi vuon khoi" (Thuraya MarineStar), "Meo tiet kiem dau" (SF-50), "Giai dap thac mac loc dau" (SF-50), "Canh giac vi pham VMS" (S-Tracking, cần duyệt QL), "Bao duong may loc dau" (SF-50) - moi goi y neu ro dua public #N hoac noi bo #N. Them apps/approval-ui/scripts/learn-public-rss.mjs (Google News RSS fetch, mien phi khong quota, thay Gemini google_search khi bi 429). -->
<!-- re-verified: 2026-08-18 - Rotate route wire content_suggestions vao vong xoay: neu plan applied co suggestion chua dung (khong co used_at), UU TIEN chon slot theo suggestion (map suggestion.product -> folder qua guessGroup), truyen angleOverride=suggestion.why + preferredHeadline=suggestion.title vao generateSocialPost. Suggestion co needs_gov_review -> ep co gov cho bai (R3 ba-spec). Bai co suggestion se co brief.suggestion_index + suggestion_sources, approval_queue title prefix 🎯. Cuoi vong ROTATE cap nhat plan.data.content_suggestions[i].used_at de khong lap. Slot con thieu sau khi het suggestion -> fallback random/weighted nhu cu. social.mjs generateSocialPost them 2 param optional: angleOverride, preferredHeadline. Them BOT chip goc duoi phai moi trang (apps/approval-ui/app/bot-chip.tsx, client component) poll /api/bot-status moi 60s hien "Bot da hoc N nguon" / "N huong di san"; click mo popup chi tiet + link Kho tri thuc + Ke hoach; dismissable persist localStorage. Route /api/bot-status tra count noi bo + public 7 ngay + so suggestions con lai/da dung, khong tra noi dung du lieu (an toan). -->
<!-- re-verified: 2026-08-18 - VIDEO SHORTS A/B (packages/marketing/src/video): script.mjs generateVideoScript them opts.short -> prompt SHORTS 2-3 canh, tong loi thoai 10-18 giay (~30-50 tu), cau dau la MOC CAU; mac dinh van ban dai 40-50s nhu cu. build-video.mjs: bai nguon co brief.ab_pair_id (rotate 🎯A/🎯B dat) -> tu bat short mode; pushToApprovalQueue ke thua ab_variant + suggestion_title tu bai nguon, ma cap video = "<pair>-video" (Evaluator so cap VIDEO tach cap TEXT, khong tron 4 bai 1 cap), nhan queue "⚡<variant> Shorts [FB 16:9 + TikTok doc] 🎬 <title>". Vi rotate dat video_requested=true cho ca A va B nen cron video GA tu dung CA HAI ban shorts (~40 phut/cap do 2 build x 2 dinh dang) - user chot "cu lam di" 18/8. -->
<!-- re-verified: 2026-08-18 - upload-zalo-to-bucket.mjs: skip tai lieu huong dan/log, so md5 voi bucket, noi dung doi + ten khong co ngay -> upload them ban dated de AI Data 1 hoc lai. Task Windows SDVICO-DayKhoZalo 16:30 goi scripts/day-kho-zalo-tudong.bat (upload + run-knowledge-now --only-internal). -->
<!-- re-verified: 2026-08-18 - bumpers.mjs redesign (logo dia trang khong cat nen, nen navy + spotlight + song, gach xanh/do, previewFrame export); assemble.mjs banner brand chi enable trong khoang canh noi dung (probeDuration intro/outro/base). Da dung lai video SF-50 B 90efab4b bang bumper moi. -->
<!-- re-verified: 2026-08-18 - build-video-all.mjs: doc lai mkt_content.brief MOI NHAT truoc khi tat video_requested (tranh ghi de mat video/post_reel ma build-video.mjs vua gan). -->
<!-- re-verified: 2026-08-18 - build-video.mjs GOP video vao bai ban hang: pushToApprovalQueue neu content.brief.generator==='rotation' -> update brief.assets bai goc (video/video_h/video_v, giu image), channels+=tiktok, post_reel=true, video_requested=false, cap nhat payload approval_queue pending; return som (khong tao mkt_content moi). Bai khac (content/Xuong san xuat) van tao bai video rieng nhu cu. build-video-all.mjs bo qua bai da co brief.assets.video_h. Publish: actions.ts dang Post (video_h /videos + chu + anh comment) roi Reel (video_v qua video_reels API) khi post_reel. -->
<!-- re-verified: 2026-08-18 - build-video.mjs + rotate-run.mjs: BO HAN tag ngoac kenh khoi tieu de queue ("[FB 16:9 + TikTok doc]", "[Facebook]") theo user - tieu de video nay la "🎬 Shorts <title>" / "🎬 <title>", bai rotate CLI la "<title>" hoac "<kindTag> <title>". Kenh da co badge tren card. Publish FB/TikTok dang tu draft nen tag chua tung lot len bai. -->
<!-- re-verified: 2026-08-18 - build-video.mjs pushToApprovalQueue: bo A/B khoi nhan queue ("Shorts [FB 16:9 + TikTok doc] 🎬 <title>" thay vi "⚡A Shorts ..."), user "de title A/B ki lam". Thong tin cap van o payload.ab_variant + ab_pair_id "<pair>-video" -> Hang doi hien badge "🧪 Thu A/B". Logic dung short mode KHONG doi. -->
<!-- re-verified: 2026-08-14 - CONTENT_TYPE_INSTRUCTION.checklist siet moi muc phai xuong dong rieng bang 

. KIND_WEIGHT rotate-run.mjs + rotate/route.ts: portrait=0, news=0. -->
<!-- re-verified: 2026-08-14 - Rotate BAI BAN chi dung ANH; video san pham goc KHONG dang thang len FB nua (user chot 18/8: dung video AI tu build-video pipeline chu khong gui clip goc). Chi channels=[facebook], brief.assets.video=null, brief.video_requested=true de cron GA */10 phut quet + dung video AI + push bai moi "[FB 16:9 + TikTok doc] 🎬". Folder khong co anh -> skip. Sua ca app rotate/route.ts va CLI rotate-run.mjs. Bai content van dung anh goc nhu cu de giu chan that. -->
<!-- re-verified: 2026-08-14 - script.mjs prompt siet MOI SO dang so cho phu de video. products.mjs dong bo sang CLI. -->
<!-- re-verified: 2026-08-14 - Video AI (build-video pushToApprovalQueue) nay chon 1 ANH san pham trong dung folder san pham -> assets.image, khong con null. Khi Duyet, publishContentToFacebook thay video + image se dang video roi tha ANH SAN PHAM vao binh luan dau. Truoc do bai video AI chi co video, khong co anh, ba con khong thay san pham ro. -->
<!-- re-verified: 2026-08-14 - Content 7 cum (Phong KD de xuat): products.mjs CONTENT_TOPICS them 2 kind moi - PORTRAIT (chan dung nguoi that, tao KHUNG SUON co placeholder [TEN, TUOI, DIA PHUONG] + "..." de Phong KD dien tay, khong AI bia - dieu cam 5) va NEWS (thoi su nganh, dung ngon ngu chung "quy dinh moi/gan day/theo co quan quan ly", KHONG mot so lieu cu the, tu gan needs_gov_review=true - dieu cam 3). social.mjs CONTENT_TYPE_INSTRUCTION them portrait + news. rotate-run.mjs (CLI) + rotate/route.ts (app) chon kind theo TY LE weighted qa=2,checklist=2,glossary=1,tip=1,engage=1,portrait=1,news=1 (rat gan de xuat Phong KD 2qa/2checklist/1glossary/1engage/1chan-dung-news). Nhan queue theo kind: ❓ Hoi-Dap, 📋 Checklist, 📖 Thuat ngu, 💡 Meo, 💬 Hoi ba con, 👤 Chan dung (dien tay), ⚠️ Thoi su (cho duyet QL). packages/marketing/src/{products,social}.mjs sync tu app. Da test: portrait ra khung + placeholder; news ra text chung khong bia mot, ca hai gan flag needsGov dung. -->
<!-- re-verified: 2026-08-14 - 3 fix video: (1) script.mjs prompt CAM canh cuoi goi tong dai / moi lien he SDVICO (outro cuoi da doc "Goi ngay tong dai 1900 23 23 49" roi -> KHONG lap lai o noi dung chinh); canh cuoi la 1 cau chot ve loi ich, KHONG nhac so dien thoai/tu "goi/lien he". (2) Prompt: so dien thoai PHAI viet dang SO (1900 23 23 49), khong viet ra chu "mot chin khong khong" (may doc tu spellPhones). (3) bumpers.mjs REWRITE: render sequence PNG frames (30fps, moi frame khac nhau) roi ffmpeg concat -> animation THAT: logo scale-in fade, text slide-up/left, so dien thoai scale-in + PULSE lien tuc, nen gradient shift + wave dots trang tri. Truoc chi zoompan 1 anh tinh -> don dieu. Chi phi: ~35s render (210 PNG cho 7s outro), chap nhan duoc. -->
<!-- re-verified: 2026-08-14 - bumpers.mjs bumped path logo-sdvico.jpg -> logo-sdvico.png (logo moi 350x350 net, nen trong suot san). Khong doi logic. -->
<!-- re-verified: 2026-08-14 - 4 fix video pipeline theo yeu cau user: (1) build-video.mjs TTS chi giu 1 GIONG (nam), bo fallback qua giong nu -> giu on dinh giong xuyen suot video, chi retry rate khac nhau (0%,-5%,-10%,+5%). (2) script.mjs prompt Gemini: video 5-7 canh, tong 40-50 giay (100-130 tu), moi canh 6-9s. Truoc "8-12 canh 3-4 phut" -> qua dai. (3) bumpers.mjs makeBumperClip THEM zoompan 1.0->1.08 + fade in 0.4s + fade out 0.5s + audio fade -> intro/outro co hieu ung bay ra bay vao, khong con dung yen. (4) buildBumpers: outroDur = MAX(4s, audioDur+1s) - probeDuration audio outro va cho video du dai; truoc 4s cung nen cat tieng doc so 1900... giua chung. -->
<!-- re-verified: 2026-08-14 - bumpers.mjs (intro/outro): (1) LOGO tu CAT NEN TRANG bang getImageData (cung thuat toan voi logo-overlay.mjs) -> khong con khoi trang xau tren nen xanh gradient. (2) Layout OUTRO tach theo dinh dang PORTRAIT vs LANDSCAPE (isPortrait): dat vi tri y va logoRatio khac nhau, cong voi font co theo H (doc) hoac min(W,H*1.6) (ngang) de khong bi chong "Goi ngay tong dai" len so 1900. Them auto-shrink neu so vuot 88% W. INTRO cung cap nhat theo. -->
<!-- re-verified: 2026-08-14 - build-video.mjs: san pham cua bai FALLBACK guessGroup neu chua co brief.rotation_group (bai Xuong san xuat nguoi tu soan thuong khong co rotation). Truoc day strict throw "chua gan san pham" -> pipeline bo qua -> bai video_requested cho mai. -->
<!-- re-verified: 2026-08-14 - CLI sync: packages/marketing/src/{products,social}.mjs dong bo tu apps/approval-ui/lib/gen/ (CONTENT_TOPICS moi 5 cum + generateContentPost siet theo type). rotate-run.mjs loai folder Content khoi vong xoay ban, bai content uu tien anh trong folder Content. -->
<!-- re-verified: 2026-08-14 - pushToApprovalQueue chi day ban NGANG 16:9 (bo tham chieu results.vertical - session song song da bo dung vertical, chi 16:9 cho FB, Reel dung duong avatar rieng). brief.assets = {video, video_h}, channels ['facebook']. Nhan hang doi "[Facebook 16:9] 🎬 <title>". Fix "results is not defined" o cuoi pipeline (video van dung xong nhung crash luc day queue). -->
<!-- re-verified: 2026-08-14 - build-video.mjs 3 fix: (1) normalizeForTts thay so tong dai 1900 23 23 49 va cac phone thanh cach doc tung chu so truoc khi day vao edge-tts (tranh doc "mot nghin chin tram"). (2) Loc brand_assets THEO product_group cua bai (content.brief.rotation_group), bai SEA-40 chi dung tu lieu SEA-40 khong lan san pham khac. (3) BO ban vertical, chi xuat horizontal 16:9 cho post FB - Reel dung duong avatar AI rieng theo phan cong. -->
<!-- re-verified: 2026-08-14 - 3 fix day chuyen video: (1) LOC TU LIEU theo folder san pham cua bai (rotation_group hoac guessGroup tren tieu de+tu khoa+draft) -> Gemini chi chon anh/video trong dung folder (vd bai loc dau CHI dung tu lieu folder 6, khong lay S-Tracking linh tinh). Da test 5b75cc75: 4 muc, dung folder. (2) TTS RESILIENT them: thu giong chinh -> giong du phong (Hoai My) -> cham -10% -> cuoi cung moi lang; giam ty le mat tieng do edge-tts "No audio". (3) build-video.mjs nhan CA UUID day du va PREFIX (>=32 ky tu la full, <32 la prefix - UUID khong LIKE duoc nen quet ordered limit 500 roi so trong JS). --skip-whisper truyen tu build-video-all. -->

<!-- re-verified: 2026-08-14 - build-video.mjs them --skip-whisper (bo whisperArtifact) de dung tren GitHub Actions khoi cai faster-whisper (nang). Phu de van co (buildBlocks/srt.mjs tu kich ban). build-video-all.mjs passthrough co --skip-whisper. .github/workflows/video-build.yml pip install edge-tts, chay --requested --skip-whisper --limit 3, timeout 55 phut. -->

<!-- re-verified: 2026-08-14 - Them file Windows scripts/video-watch.bat (chay watcher --requested --watch, tu restart neu loi) + cai-tu-dong-video.bat (schtasks onlogon "SDVICO Video Watcher") + go-tu-dong-video.bat. De "bam nut Lam video tren web -> may noi bo tu dung" chay khong can mo tay. Node o C:\Program Files\nodejs\node.exe. video/README.md co huong dan. -->

<!-- re-verified: 2026-08-14 - build-video-all.mjs them --requested (chi dung bai co brief.video_requested = bai bam nut "Lam video" tren web /noi-dung; dung xong tu xoa co) + --watch [--interval 60] (quet lien tuc). "--requested --watch" chay tren may noi bo = bam nut tren web -> ~1 phut may tu dung (FB 16:9 + TikTok doc) -> Hang doi duyet. --limit N de chay theo me (161 bai ~13h neu lam het). -->

<!-- re-verified: 2026-08-14 - Video pipeline dinh dang theo kenh + batch: pushToApprovalQueue nay upload CA HAI ban (ngang 16:9 + doc 9:16) -> brand_assets, gan brief.assets.video_h (FB) + video_v (TikTok) + video (fallback), channels ['facebook','tiktok']. Them build-video-all.mjs: batch dung video cho MOI bai mkt_content co draft chua co video (spawn build-video.mjs tung bai, isolate loi, bo qua bai da co video-pipeline output theo source_content) -> chay lai chi xu ly bai moi, hop hen gio dinh ky = "tu dong cho tat ca". Chi tiet video/README.md. -->

<!-- re-verified: 2026-08-14 - Day chuyen video not 2 viec: (1) doc SO tong dai/dien thoai TUNG chu so cho GIONG DOC (spellPhones trong build-video.mjs: 1900 23 23 49 -> "mot chin khong khong, hai ba, hai ba, bon chin"; GIU NGUYEN so luong 80 lit/3.000.000 dong/15 met; phu de van hien so goc). (2) DAY vao Hang doi duyet: pushToApprovalQueue upload ban DOC len Storage + brand_assets(kind=video) + mkt_content(status review) + approval_queue(pending, kenh Facebook) -> nguoi bam Duyet moi dang (dieu cam 1). Mac dinh bat; --no-queue de chi tao file. Da chay end-to-end: video + day queue OK ([Facebook] 🎬 ..., risk amber). README video da cap nhat. -->
<!-- re-verified: 2026-08-14 - Day chuyen video (build-video.mjs) HOAN THIEN + chay end-to-end: TTS resilient - cleanNarration (bo emoji/ky hieu la de edge-tts khong tra "No audio") + neu edge-tts van loi sau retry thi dung TIENG LANG (silentAudio, do dai uoc theo so ky tu) de MOT canh TTS hong khong keo sap CA day chuyen (truoc day 1 canh loi -> crash het). Da chay: ban doc 29s 4 canh OK (kich ban Gemini + ghep clip ffmpeg + burn phu de srt.mjs + nhan dien SDVICO). Python edge-tts 7.2.8 + faster-whisper da cai. Con lai: day dau ra len Storage/brand_assets + approval_queue (chua lam). -->
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
