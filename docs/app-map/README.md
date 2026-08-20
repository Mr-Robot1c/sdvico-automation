# App Map: bản đồ hệ thống sdvico-automation

> Load khi / Load when: cần hiểu hệ thống chạy thế nào, con AI nào làm gì, file nào ở đâu, hoặc trước khi sửa code chạm nhiều mảng. Đây là trang chỉ mục + bản đồ tổng.
> Nguồn sự thật khác: `CLAUDE.md` (bảy điều cấm + giọng văn), `supabase/migrations` (lược đồ), các file bên dưới cho chi tiết từng mảng.
covers: packages/core, apps/approval-ui, supabase/migrations
last_verified: 2026-08-20
ttl_days: 180
<!-- re-verified: 2026-08-20 - Pipeline 16:30 them buoc 2b: packages/marketing/src/up-media-kho-tu-lieu.mjs tu up anh/video Zalo/media len KHO TU LIEU brand-assets (Gemini vision phan loai vao folder san pham; CHAN giay_to_ca_nhan + man_hinh_app - dieu cam 6; idempotent license_note zalo-media:<folder>/<file>; video can ban tom tat hoc-video truoc; fallback flash-lite khi 503). Trang /ke-hoach sap lai GON: Hom nay -> Ke hoach tuan (bang 7 ngay highlight hom nay) -> Huong di bai viet -> Cai dat (details thu gon) -> Chi tiet+lich su (details). -->
<!-- DOC-STATUS: SUSPECT (2026-08-20) — code 'supabase/migrations' doi sau last_verified. DOI CHIEU VOI CODE truoc khi tin. May quan ly dong nay, dung sua tay. -->

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
