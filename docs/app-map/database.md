# Cơ sở dữ liệu: bảng và RLS

> Load khi / Load when: cần biết lược đồ bảng, cột chính và chính sách RLS. Nguồn sự thật là `supabase/migrations` (doc này tóm tắt, migration mới thì cập nhật ở đây cùng commit).
covers: supabase/migrations
last_verified: 2026-08-14
ttl_days: 180
<!-- re-verified: 2026-08-13 - Lap doc luoc do lan dau: liet ke 14 bang tu supabase/migrations. Them mkt_oauth_tokens (token OAuth TikTok, RLS khong policy = chi service_role doc/ghi). -->
<!-- re-verified: 2026-08-14 - Migration 20260813150000 noi CHECK: mkt_posts.channel them 'tiktok', mkt_metrics.source them 'manual'. Cap nhat 2 hang bang tuong ung. -->
<!-- re-verified: 2026-08-14 - Migration 20260814100000: them cot brand_assets.product_group (folder san pham theo STT) + index. Phuc vu vong xoay dang bai hang ngay theo folder. -->
<!-- LUU Y: DATABASE_URL trong .env tro NHAM project cu (schema khac). Migration phai ap len project live jwisiccphcepgpabyyco qua SQL Editor hoac sau khi sua DATABASE_URL. db-apply.mjs da co chot chan ap nham DB. -->

Chi tiết cột và chính sách nằm trong `supabase/migrations`. Cách áp dụng: `supabase/README.md`.

## Bảng

| Bảng | Mảng | Vai trò | RLS |
|---|---|---|---|
| approval_queue | Chung | Hàng đợi duyệt, cổng điều cấm 1 (pending → approved mới đăng) | Bật, staff |
| run_log | Chung | Nhật ký thao tác tự động, kèm ảnh chụp khi lỗi | Bật, staff |
| brand_assets | Marketing | Kho tư liệu ảnh/clip thật (owned/licensed), cột `product_group` = folder sản phẩm (STT) cho vòng xoay | Bật, staff |
| mkt_keywords | Marketing | Kho từ khóa, phân loại theo ý định | Bật, staff |
| mkt_content | Marketing | Nội dung + trạng thái, cờ needs_gov_review, brief.assets | Bật, staff |
| mkt_posts | Marketing | Bài đã đăng + kênh (facebook/website/youtube/tiktok), external_url | Bật, staff |
| mkt_metrics | Marketing | Số liệu đo lường (gsc/ga4/facebook/youtube/manual) | Bật, staff |
| mkt_oauth_tokens | Marketing | Token OAuth cần refresh (TikTok): access/refresh token, hạn. **RLS không policy = chỉ service_role đọc/ghi, không lộ ra giao diện** | Bật, service_role only |
| hr_jobs | Tuyển dụng | Vị trí tuyển dụng | Bật, staff |
| hr_candidates | Tuyển dụng | Ứng viên, dữ liệu cá nhân (consent_at, retention_until, dedup_key) | Bật, dữ liệu cá nhân |
| hr_applications | Tuyển dụng | Hồ sơ ứng tuyển, dữ liệu cá nhân | Bật, dữ liệu cá nhân |
| product_facts | Marketing | Dữ kiện sản phẩm SDVICO (chống bịa, điều cấm 5) | Bật, staff |
| app_config | Chung | Cấu hình khóa–giá trị, có công tắc dừng khẩn (emergency_stop) | Bật, staff |
| daily_counters | Chung | Bộ đếm hạn mức theo tài khoản/loại/ngày | Bật, staff |

## Ghi chú

- Backend và tác vụ theo lịch dùng khóa **service role**, tự bỏ qua RLS. Giao diện duyệt server-side cũng dùng service role (xem `apps/approval-ui/lib/supabase-server.ts`).
- `mkt_oauth_tokens` cố tình **không có policy** nào: kể cả vai trò authenticated cũng không đọc được, chỉ service role. Token là bí mật (điều cấm 7).
- Trọng tâm RLS bảo vệ dữ liệu cá nhân: `hr_candidates`, `hr_applications` (điều cấm 6).
