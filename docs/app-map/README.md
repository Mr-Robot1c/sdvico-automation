# App Map: bản đồ hệ thống sdvico-automation

> Load khi / Load when: cần hiểu hệ thống chạy thế nào, con AI nào làm gì, file nào ở đâu, hoặc trước khi sửa code chạm nhiều mảng. Đây là trang chỉ mục + bản đồ tổng.
> Nguồn sự thật khác: `CLAUDE.md` (bảy điều cấm + giọng văn), `supabase/migrations` (lược đồ), các file bên dưới cho chi tiết từng mảng.
covers: packages/core, apps/approval-ui, supabase/migrations
last_verified: 2026-08-21
ttl_days: 180
<!-- re-verified: 2026-08-21 - BOSS TRUYEN TRONG SO CHO CREATOR + lich bam thuc te + UI ke hoach gon (user: "co that su hoc va ap dung khong? UI roi ram"): (1) rotate + plan-live sort huong CHUA DUNG theo trong so san pham (guessGroup product -> weights) — truoc trong so chi anh huong fallback, huong chay theo thu tu Gemini. (2) buildDailySchedule: ngay co huong thi sales = cap A/B cua huong do (het canh "lich bao 2 bai SEA-40 ma may sinh 1 bai loc dau"). (3) /ke-hoach: bang san pham cot "Bai/tuan" doi thanh "Uu tien xN"; lich tuan gop cot bai ban + huong lam mot, bo cau truc lap 7 lan; khoi Hom nay 3 dong. -->
<!-- re-verified: 2026-08-21 - NHAN "Cap nhat ..." khoi Ke hoach tuan DUNG IM (user: "cho nay het cap nhat"): ban live UPDATE TAI CHO nen row.created_at khong doi tu lan tao dau (16:10 20/8) — nhan gio phai doc data.generatedAt. fmtDateTime tu ghep HH:mm dd/mm (ICU Node tra gach). Nhan gio 8h/13h cu doi 7h/12h30 khap /ke-hoach. -->
<!-- re-verified: 2026-08-21 - "BAM TAO KE HOACH KHONG THAY MOI GI" (user): nut CO chay (ban 75af5c08 ap 13:47, 7 huong moi) nhung carry-over dung DAU danh sach nen huong moi chim cuoi, khong tin hieu gi. Fix: plan.ts carry-over gan carried=true; /ke-hoach hien "Ban ke hoach dang ap tao luc HH:mm — co N huong moi" + badge "✨ moi" tren huong khong carried; plan-live rest filter GIU muc B mo coi cung title (lich mai khong mat ban B). Data ban ap da backfill 5 carried. -->
<!-- re-verified: 2026-08-21 - A/B CUNG NGAY (user chot qua AskUserQuestion sau khi hoi "khong the chay A va B cung 1 ngay sao"): ban A slot SANG 7h, ban B slot CHIEU 12h30. rotate: slot chieu CHI rut pending B (khong mo huong moi de nhip khong troi thanh A-chieu/B-sang); slot sang uu tien B mo coi roi moi mo huong moi. plan-live v8: moi huong chua dung = 1 ngay variant "AB" (lich hien "A sang, B chieu"); DailyPlan.direction.variant them "AB". Huong loc dau dang treo B -> sang 22/8 sinh B (mo coi), tu ngay 23/8 nhip chuan. -->
<!-- re-verified: 2026-08-21 - MO TA SHORTS HET LAP (user bat tren video dau): makeDescription (lib/youtube-publish.ts) truoc noi CTA tong dai + hashtag vao MOI caption -> lap 2 lan vi caption bai da co san cau do. Gio chi them khi caption CHUA co (regex 1900 23 23 49 / "nhan tin cho page" / sdvico.vn / tung hashtag), cau them viet co dau. Test 2 truong hop. -->
<!-- re-verified: 2026-08-21 - FIX A/B SAI LICH + Tong quan platform-centric (user dem 21/8): (1) rotate candidateSuggestions rut pending B KHONG kiem ngay -> slot chieu sinh B cung ngay voi A sang (bai "Ra khoi gap song lon" 12:02). Fix: B chi sinh khi dayVN(a_at) != hom nay. Bai B sai da XOA (content b8a7fdd7 + queue + 2 video asset), suggestion #1 tra ve pending_variant=B (run_log mkt.fix_ab_schedule) — mai 22/8 rotate sang sinh B dung lich. (2) /noi-dung tab MAC DINH la "Tong quan" moi (tong-quan-section.tsx): stat row + callout cho duyet + 4 the nen tang .pf-card (icon mau brand, badge, chay toi dau, mini-stats react/cmt/share/view, ca the la link chi tiet); kanban + van hanh don sang tab "Bang bai viet" (?loai=bang). -->
<!-- re-verified: 2026-08-21 - POLISH UI theo mau user (user: "thiet ke kieu nay trong gom"): Tong quan /noi-dung dung class moi .board-top (4 stat card + o van hanh cung hang), .chan-panel/.chan-item (kenh ket noi dang sub-card), .kanban-col/.kanban-head tone-pending|approved|published|rejected (cot co khoi nen + header pill mau), .kanban-empty (o dashed thay chu "Trong."). KHO TU LIEU /tu-lieu lam lai kieu trinh quan ly file theo anh mau: sidebar cay folder trai (.lib-side/.lib-folder.on, chon qua ?folder=) + luoi thumbnail phai (.lib-grid/.lib-card, ten + loai + ngay dd/mm, thao tac gap trong details "Sua, chuyen folder, xoa"); AssetViewer lightbox giu nguyen; data van brand_assets.product_group nhu cu. CSS append cuoi globals.css. -->
<!-- re-verified: 2026-08-21 - GOP TONG QUAN + BANG BAI VIET (user toi 21/8: "tong quan ket hop voi bai viet, dua tren hinh"): /noi-dung la trang "Tong quan" duy nhat (stat row + panel Kenh ket noi trai co so lieu YT + kanban phai; tab Bai viet/Video); /tong-quan va / redirect ve; nav bo muc Bang bai viet. BO GIONG ADAM (user): go elevenLabsTTS khoi build-video.mjs + env khoi video-build.yml + xoa runbook-elevenlabs-voice.md — TTS ve edge-tts nhu cu. -->
<!-- re-verified: 2026-08-21 - TACH DO LUONG + so lieu YouTube + board theo mau (user chieu 21/8): (1) /do-luong lai la TRANG RIENG (nav muc Do luong; section move ve app/do-luong/do-luong-section.tsx; /noi-dung?loai=do-luong redirect; revalidate cac action do luong ve /do-luong). (2) lib/youtube-metrics.ts pullYouTubeMetrics: videos.list part=statistics theo mkt_posts youtube -> mkt_metrics source='youtube' entity_ref=content_id; goi trong cron mkt-metrics-pull (detail them ytPulled/ytErrors) + nut Cap nhat so lieu; trang Do luong them bang "YouTube Shorts"; the YouTube /tong-quan hien view/like/cmt that (snapshot dau: 195 view sau 1h). (3) Board /noi-dung theo mau user: stat row 4 tile + panel Kenh ket noi trai + kanban phai. (4) vClip = wrapper ElevenLabs Adam (research 21/8, khong co API cong khai, Firebase+reCAPTCHA) -> giu tich hop ElevenLabs, ghi ro trong runbook-elevenlabs-voice.md. -->
<!-- re-verified: 2026-08-21 - HUONG DI CO DAU + trang thai dung + badge A/B + giong Adam (user): (1) prompt plan-directions.ts + scripts/generate-plan-directions.mjs chuyen sang tieng Viet CO DAU + yeu cau bat buoc co dau (prompt khong dau lam Gemini tra khong dau); data plan dang ap a4513660 + brief.suggestion_title bai da sinh da viet lai co dau tay; live proposal refresh qua POST /api/share-groups. (2) /ke-hoach: huong rejected=true tach khoi "xong cap" -> badge "da loai (ban thu bi tu choi)" + dem rieng. (3) Bang bai viet (loai=bai-viet) + the Da dang tren board hien badge "Thu A/B" tu brief.ab_variant. (4) build-video.mjs: elevenLabsTTS uu tien khi co ELEVENLABS_API_KEY (voice Adam pNInz6obpgDQGcFmaJgB, model eleven_multilingual_v2), loi lui edge-tts; video-build.yml nhan secret; docs/runbook-elevenlabs-voice.md — CHO USER them secret. -->
<!-- re-verified: 2026-08-21 - GOM NAV dot 2 (user): "Tong quan" (bo chu kenh) len DAU nav; Hang doi duyet + Van hanh + Quan ly bai viet GOP thanh 1 muc "Bang bai viet" (/noi-dung) — tab Bang (board 4 cot: Cho duyet co DecideActions duyet ngay tren the, Da duyet, Da dang kem so lieu + ShareGroups, Tu choi) la mac dinh + thanh van hanh (dung khan + han muc + link /van-hanh, /hang-doi). Trang hang doi day du move / -> /hang-doi (HR + canh bao); / redirect /tong-quan; loai=bai-viet la danh sach cu. revalidatePath('/') -> '/hang-doi' + '/noi-dung' (5 cho). -->
<!-- re-verified: 2026-08-21 - DUYET XONG KHONG LEN YOUTUBE (user bao): decideForm vong lap dang chi duyet ['facebook','tiktok'] nen nhanh if ch==='youtube' KHONG BAO GIO chay du payload.channels co youtube (bai loc dau 10:13 chi len FB+TikTok). Them 'youtube' vao mang lap. -->
<!-- re-verified: 2026-08-21 - UI GOM LAI cho do roi mat (user 21/8): (1) trang moi /tong-quan "Tong quan kenh" (dau nhom QL&SX): 4 stat-tile tong + 4 the FB/YouTube/TikTok/Zalo (trang thai fbStatus/tiktokStatus tach ra lib/platform-status.ts dung chung voi /ket-noi, so bai mkt_posts theo channel, tong tuong tac + follower tu mkt_metrics). (2) Do luong = tab thu 3 trong /noi-dung (?loai=do-luong, app/noi-dung/do-luong-section.tsx); /do-luong redirect, /do-luong/tuan giu; nav bo muc Do luong; revalidatePath('/do-luong') -> '/noi-dung' (9 cho actions.ts). (3) Bang bai viet them cot So lieu (like/cmt/share/view moi nhat theo content id). (4) FIX __page_real__ lot thanh bai ao trong bang Do luong (guard cid.startsWith('__'), follower uu tien page that). -->
<!-- re-verified: 2026-08-21 - DISPATCH VIDEO FAIL het im lang: bai 09:20 21/8 treo 39p vi env GITHUB_REPO/GITHUB_TOKEN tren Vercel SAI -> GitHub 404 ma run_log chi co videoTriggered:false. Da sua env (repo Mr-Robot1c + token scope workflow, qua vercel env add --force --sensitive) + redeploy + test {ok:true}. rotate gio ghi videoTriggerError (status+body GitHub hoac 'thieu env') vao run_log mkt.rotate. -->
<!-- re-verified: 2026-08-21 - generatePlanNow (nut Tao ke hoach ngay) gio SINH + AP DUNG NGAY + refresh live proposal (truoc chi sinh, phai bam them "Ap dung trong so" nam khuat trong details -> user bam Tao ma Creator van chay ban cu). Nguoi bam Tao = nguoi quyet, khong pham dieu cam 2. -->
<!-- re-verified: 2026-08-21 - TAT lich mkt-content.yml (duong sinh bai theo TU KHOA cu, 1 keyword x 3 dinh dang): truoc "im" vi can keyword, 20/8 mkt_keywords nap 152 muc nen SONG DAY sinh 3 bai trung 9h22 (generator=gemini, run_log mkt.content_run). Chi con workflow_dispatch chay tay. Da xoa 3 bai rac + 3 queue item. Duong sinh bai chinh thuc duy nhat: /api/rotate. -->
<!-- re-verified: 2026-08-21 - TU CHOI bai thu A/B = LOAI HUONG DI: decideForm khi reject bai co ab_pair_id + from_plan_direction -> set suggestion used_at + rejected=true + xoa pending_variant trong mkt_plans (khong sinh tiep ban B cua huong bi che, carry-over khong mang sang). run_log mkt.direction_rejected. Da xu tay huong "Lap dat may loc dau kip chuyen bien" (user tu choi 21/8) + ep sinh dot moi: bai "Chung minh hieu qua loc dau thuc te duoi ham tau" (huong ke tiep, ban A, video). -->
<!-- re-verified: 2026-08-21 - SINH BAI SOM + lich khop thuc te + chong lap chu de: (1) cron rotate doi 7h + 12h30 VN (vercel.json 0 0 / 30 5 UTC; yml luoi >=7h/>=12h) — video xong truoc gio lam viec. (2) Lich hom nay hien huong DA SINH that (+badge "da sinh"), queue du kien doi sang ngay mai (fix "lich ghi B ma bai ra A"). (3) Huong di dem 3 trang thai: chua dung / dang thu (pending B) / xong cap. (4) generateContentDirections nhan avoidTitles (loadRecentDirectionTitles: suggestion_title 7 ngay) — Gemini cam sinh chu de na na huong da chay. -->
<!-- re-verified: 2026-08-21 - (1) FB BO dang Reel doc kem Post (user: "dang ca 16:9 lan doc la loi" - trung tren cung Page; ban doc danh TikTok + YouTube Shorts). Gate env FACEBOOK_ALSO_REEL=1 bat lai. (2) Rotate xong co bai video_requested -> dispatch video-build.yml NGAY (khong cho cron 10p); can GITHUB_REPO + GITHUB_TOKEN tren Vercel (hien CHUA co - user them). run_log mkt.rotate them videoTriggered. -->
<!-- re-verified: 2026-08-21 - KE HOACH CHI TIET (user: "huong di gi, dang bai gi, cau truc sao, gio nao, group nao"): DailyPlan v7 them direction {title,product,variant} (mo phong thu tu vong xoay rut: pendingB truoc, moi huong fresh 2 ngay A->B) + contentStructure. Bang lich /ke-hoach 5 cot: Ngay | 8h bai ban + cau truc | Huong di du kien | 13h content + cau truc | Chia se nhom. Khoi "Nen dang lai" (top 3 bai >7 ngay engagement cao, may de xuat nguoi chia se). SEO topic hub /blog/chu-de/[slug] (6 SP, CollectionPage JSON-LD, vao sitemap + nav chu de o /blog). Zalo OA KHUNG: lib/zalo-oa.ts (createZaloArticle, token tu mkt_oauth_tokens provider zalo hoac env ZALO_OA_ACCESS_TOKEN) + hang Zalo o /ket-noi + docs/runbook-zalo-oa-setup.md (can OA XAC THUC moi dung API - user phai lam buoc 1-3). -->
<!-- re-verified: 2026-08-20 - O nhap trang Quang cao to khong lo: .note (flex 1 1 200px cho .row ngang) trong .field-col cot doc -> basis thanh CHIEU CAO 200px. Fix scoped .field-col .note { flex: 0 0 auto; } -> 12 o ve 38-39px. Cung bay .sx-field 19/8 - lan thu 3 dinh bay nay (note class can refactor ve input class rieng, de backlog). -->
<!-- re-verified: 2026-08-20 - FIX "Dan dau la Khac" (3 tang): (1) GOC SAU: loadMeasurement de __page__/__page_real__ (dong follower page-level) lot vao cids -> .in(id,...) chet vi khong phai uuid -> tra ten bai RONG -> moi bai roi vao "Khac". Gio skip cid.startsWith(__). (2) Bai DA XOA con snapshot metric (entity_ref mo coi) -> loc contents.has(cid). (3) buildPlan + plan-live rankProducts CAM "Khac"/"Bai content" vao xep hang/weights (NOT_PRODUCT set). UI details "Ban ke hoach day du" bo narrative van mau dai -> Muc tieu 1 dong + 1 dong so lieu + bang. Kiem chung: 3 bai/15 tuong tac that, SEA-40 len bang, khong con Khac. -->
<!-- re-verified: 2026-08-20 - Content ghi RO loai + huong di khong mat: (1) DailyPlan them contentKind/contentKindLabel, plan-live chia loai theo NGAY TRONG TUAN (CONTENT_KIND_BY_DOW: T2 qa, T3 checklist, T4 tip, T5 qa, T6 portrait, T7 checklist, CN engage); rotate doc contentKind cua live plan hom nay -> sinh DUNG loai (fallback random). (2) generateAndStorePlan CARRY-OVER huong di chua dung cua ban dang ap sang ban moi (dedupe title, cap 12) - het canh reset 0 da dung. (3) /ke-hoach: cot Content hien "1 · Hoi Dap", khoi Hom nay hien "May da sinh bai theo huong: X" tu mkt_content.brief.suggestion_title hom nay. -->
<!-- re-verified: 2026-08-20 - FIX 4 loi user bao: (1) textarea muc tieu to lai (.plan-card textarea min-height 88px, rows 4); (2) hang HOM NAY bang lich dung class .row-today (var --surface-2, theme-safe) thay inline #f0f6ff lam dark mode trang xoa; (3) NHOM CHIA SE dong bo 1 nguon: /api/share-groups (app_config mkt_share_groups {id,label,url}) - popover noi-dung doc/ghi server + migrate localStorage cu 1 lan, /ke-hoach chi HIEN THI + tro ve popover, bo form nhap tay saveShareGroups; (4) Creator luon co huong tu BOSS: cron nap lai content_suggestions khi ban dang ap can (generateContentDirections tu tri thuc, guard run_log mkt.suggestions_refill 1 lan/ngay). -->
<!-- re-verified: 2026-08-20 - Pipeline 16:30 them buoc 2b: packages/marketing/src/up-media-kho-tu-lieu.mjs tu up anh/video Zalo/media len KHO TU LIEU brand-assets (Gemini vision phan loai vao folder san pham; CHAN giay_to_ca_nhan + man_hinh_app - dieu cam 6; idempotent license_note zalo-media:<folder>/<file>; video can ban tom tat hoc-video truoc; fallback flash-lite khi 503). Trang /ke-hoach sap lai GON: Hom nay -> Ke hoach tuan (bang 7 ngay highlight hom nay) -> Huong di bai viet -> Cai dat (details thu gon) -> Chi tiet+lich su (details). -->

## Chỉ mục

| File | Nội dung |
|---|---|
| [marketing.md](marketing.md) | Mảng Marketing: sinh bài, video, đăng kênh |
| [tuyen-dung.md](tuyen-dung.md) | Mảng Tuyển dụng |
| [database.md](database.md) | Lược đồ bảng + RLS |
| [ke-hoach-ai-v2-ba-spec.md](ke-hoach-ai-v2-ba-spec.md) | Bot Kế hoạch, nguồn tri thức, mở kênh, quảng cáo |
| [reverify-log.md](reverify-log.md) | Nhật ký các lần sửa (trước nằm trong file này, tách ra 20/8 cho gọn) |

## Kiến trúc chung (đã chốt, CLAUDE.md mục 5)

- Điều phối: Vercel Cron + GitHub Actions schedule.
- Suy luận ngôn ngữ: Gemini (model `gemini-flash-lite-latest`, env `MKT_MODEL`).
- Dữ liệu: Supabase Postgres + Storage (bucket `brand-assets`, `kho-tri-thuc-noi-bo`).
- Giao diện duyệt: Next.js trên Vercel (`apps/approval-ui`), khoá basic-auth trừ trang công khai.
- Nền chung ở `packages/core`: client Supabase, ghi `run_log`, đẩy `approval_queue`, browser runner (Playwright).

## Vòng chạy Marketing: 5 con AI (input → xử lý → output)

Không phải máy tự luyện. Đây là VÒNG LẶP DỮ LIỆU: mỗi vòng, BOSS đọc số liệu + kết luận Evaluator rồi chỉnh trọng số và hướng đi; bài nào ăn thì đẩy mạnh, bài nào tệ thì đổi góc. Người vẫn bấm quyết (điều cấm 1, 2).

```
INPUT  →  PROCESS  →  OUTPUT  →  (số liệu quay lại INPUT)
```

| Con AI | Input | Xử lý | Output | File chính |
|---|---|---|---|---|
| AI Data 1 (nội bộ) | File bucket `kho-tri-thuc-noi-bo` (phiên Zalo/Cowork đẩy) | Đọc, khử trùng theo `source_path`, gắn cờ gov | Bảng `mkt_knowledge_internal` | `lib/knowledge.ts` |
| AI Data 2 (public) | Google News RSS (hằng ngày) + Gemini search (CN) | Lọc tin ngành cá, khử trùng theo tiêu đề | Bảng `mkt_knowledge_public` | `lib/knowledge-public.ts` |
| AI Planner (BOSS) | 2 kho tri thức + `mkt_metrics` | Xếp hạng sản phẩm theo điểm, chia số bài, sinh hướng đi (Gemini), lịch theo ngày | Bảng `mkt_plans` (trọng số + hướng đi + lịch) | `lib/plan.ts`, `lib/plan-live.ts`, `lib/learn-weekly.ts` |
| AI Creator | Hướng đi từ BOSS + hàng rào sự thật nghề | Viết cặp A/B, quét tuân thủ (`product-guard`), sai thì sinh lại | Bài nháp vào `approval_queue` (pending) | `lib/gen/social.mjs`, `app/api/rotate/route.ts` |
| AI Evaluator | Cặp A/B đã đăng + số liệu | So tương tác, kết luận A hay B ăn hơn | Verdict vào `mkt_knowledge_internal` | `lib/evaluator.ts` |

Đầu ra cuối vòng: người bấm Duyệt trong hàng đợi → `decideForm` (`app/actions.ts`) đăng lên Facebook / TikTok / YouTube → số liệu kéo về `mkt_metrics` → quay lại làm input cho BOSS.

## Nhịp cron (Vercel Hobby chỉ 2 cron cứng + GitHub */30 phủ lưới)

| Việc | Khi nào | Route/file |
|---|---|---|
| Sinh bài (rotate) | 8h + 13h VN (2 slot/ngày) | `app/api/rotate/route.ts` |
| Kéo số liệu + học + đề xuất sống | mỗi 30 phút | `app/api/mkt-metrics-pull/route.ts` |
| BOSS tự áp dụng trọng số | mỗi tối ≥21h VN, 1 lần/ngày | `lib/plan-live.ts` applyLiveEvening |
| Học tuần + báo cáo | Chủ nhật 23h VN | `lib/learn-weekly.ts` |
| Dựng video AI | 10 phút/lần (GitHub) | `packages/marketing/src/video/build-video-all.mjs` |

## Kênh đăng

- Facebook: tự đăng khi Duyệt (Post + Reel nếu có video). Token env `FACEBOOK_PAGE_ACCESS_TOKEN`.
- TikTok: tự đăng (Direct Post), còn chờ audit nên chỉ đăng riêng tư/bạn bè. `lib/tiktok.ts`.
- YouTube Shorts: tự đăng bản dọc 9:16. `lib/youtube-publish.ts`, 3 env `YOUTUBE_*` (token Testing mode hết hạn 7 ngày).

## Trang công khai (SEO) + đo lường quảng cáo

- `/blog`, `/san-pham`, `/sitemap.xml`, `/robots.txt`: công khai (không basic-auth), có Meta Pixel + GA4 khi cấu hình.
- `/quang-cao`: khai báo chiến dịch → sinh link UTM; bot KHÔNG tự chạy quảng cáo.

## Cổng an toàn chung

- Máy soạn, người bấm. Mọi bài đi qua `approval_queue`, người bấm mới chuyển approved (điều cấm 1, 2).
- Dừng khẩn + hạn mức ngày: `lib/safety.ts` (app_config `emergency_stop`, `daily_counters`). Trang `/van-hanh`.
- RLS bật cho bảng dữ liệu cá nhân (`hr_candidates`, `hr_applications`) — điều cấm 6.
- Nội dung chạm quy định nhà nước/IUU: cờ `needs_gov_review`, chờ người duyệt (điều cấm 3).

## Bảng dữ liệu chính

| Bảng | Mảng | Dữ liệu cá nhân |
|---|---|---|
| hr_candidates, hr_applications | Tuyển dụng | Có, bật RLS |
| hr_jobs | Tuyển dụng | Không |
| mkt_content, mkt_posts, mkt_metrics | Marketing | Không |
| mkt_plans | Marketing | Không |
| mkt_knowledge_internal, mkt_knowledge_public | Marketing | Không |
| mkt_ads | Marketing | Không |
| brand_assets | Chung (thiên Marketing) | Không |
| approval_queue, run_log | Chung | Có thể chứa, thận trọng |
| app_config, daily_counters | Chung | Không |

Chi tiết cột + RLS: [database.md](database.md).

<!-- re-verified: 2026-08-20 - Logo THAT (public/logo-sdvico.png, decode tu LOGO_B64 logo-data.mjs) thay SVG chu S tu ve o ca 2 shell (root-shell.tsx). Nav gop: bo 2 group Ket noi (3 muc) + Quy tac (2 muc), thay bang group He thong 2 muc -> trang gop /ket-noi (status 3 kenh + link chi tiet) va /quy-tac (link privacy/terms); bo accordion (khong can nua). FIX Next Data Cache dong bang response 401 thoang qua cua YouTube channels GET -> moi request sau an lai loi cu; them cache no-store vao youtube-publish + fb fetch trang ket-noi. Kho tu lieu: nap 20 file backlog-tkkd tu Zalo (10 anh + 10 video, phan product_group SEA-40/SF-50/S-Tracking/Thuraya/Content); LOAI 4 file (2 CCCD nguoi that - dieu cam 6, 2 screenshot). -->

## Nhật ký thay đổi

Lịch sử re-verify chi tiết ở [reverify-log.md](reverify-log.md). Từ đây, các dòng `<!-- re-verified -->` mới do hook doc-health sinh ra sẽ nằm bên dưới; định kỳ dồn sang file nhật ký khi phình.
