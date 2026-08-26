# Cơ sở dữ liệu: bảng và RLS

> Load khi / Load when: cần biết lược đồ bảng, cột chính và chính sách RLS. Nguồn sự thật là `supabase/migrations` (doc này tóm tắt, migration mới thì cập nhật ở đây cùng commit).
covers: supabase/migrations
last_verified: 2026-08-26
ttl_days: 180
<!-- re-verified: 2026-08-26 23:30 - Migration 20260826040000_mkt_content_deleted_at: them cot mkt_content.deleted_at timestamptz null. Soft-delete bai viet - user 26/8 mat lich su vi deleteContent cu hard delete 4 bang (mkt_content + mkt_posts + mkt_metrics + approval_queue). Cach C: deleteContent doi thanh mark deleted_at (khong cham 3 bang kia -> Like/View lich su con), them action hardDeleteContent (giu hard delete 4 bang, chi goi tu Thung rac voi confirm dialog), them restoreContent (undo). NULL = con hien, NOT NULL = da an khoi Bang bai viet + Bai viet day du (query filter deleted_at null). Tab "🗑️ Thung rac" moi tren /noi-dung hien danh sach da an voi 2 nut Khoi phuc + Xoa han. USER paste .sql vao Supabase SQL Editor. -->
<!-- re-verified: 2026-08-26 22:00 - Migration 20260826030000_mkt_posts_deleted_at: them cot mkt_posts.deleted_at timestamptz null. Soft-delete cho row bai bi user xoa TAY tren nen tang (VD: xoa video TikTok trong app). Bot khong tu biet nen phai user tu danh dau. User 26/8: xoa 3/5 video TikTok, tile "Video da dang" o Tong quan van hien 5 → sai; set deleted_at cho 3 row do → tile hien 2. NULL = con live, NOT NULL = da xoa (co the undo). Query tong-quan-section filter `.is('deleted_at', null)`. Bang-section (Bang bai viet) KHONG filter → chip van hien de user co the undo bang nut ↺. Them UI: nut "🗑 Da xoa" trong tiktok-private-chip + 2 actions markTikTokDeleted/undoMarkTikTokDeleted. USER paste .sql vao Supabase SQL Editor de ap. -->
<!-- re-verified: 2026-08-26 18:30 - Migration 20260826020000_claude_code_usage: bang moi `claude_code_usage` (id, message_id UNIQUE, session_id, project, model, ts, input/cache_creation/cache_read/output_tokens, estimated_cost_usd numeric, estimated_cost_vnd int). Dedupe theo message_id. Index ts DESC + model. RLS on staff. Muc dich: track token Claude Code (Anthropic Max) user dot khi chat, quy doi tien theo API pricing (user 26/8: "sep muon thay dung luong token dung + quy doi ra tien"). Nguon du lieu: script upload-claude-usage.mjs (cron Windows Task 1h/lan) doc jsonl ~/.claude/projects/*SDVICO*/*.jsonl → parse assistant events co message.usage → upsert. Dashboard /kho-tri-thuc?ai=token khoi "Claude Code" doc bang nay. Them 1 hang tuong ung o bang duoi. -->
<!-- re-verified: 2026-08-26 03:00 - Migration 20260826010000_mkt_posts_made_public: them cot mkt_posts.made_public_at timestamptz null. Dung cho TikTok da audit reject 26/8 ("internal company use") — video dang qua Direct Post API bi ep SELF_ONLY, user vao app TikTok doi cong khai tay roi bam nut o /noi-dung de danh dau. Row mkt_posts cap nhat mo ta them "made_public_at". USER paste .sql vao Supabase SQL Editor de ap. -->
<!-- re-verified: 2026-08-24 23:00 - Migration 20260824230000_mkt_leads: bang mkt_leads (theo doi nguoi mua — user "khoi do co bao nhieu nguoi"). source facebook_comment/facebook_message/manual, status new/contacted/closed/spam, content_id lien ket bai. Webhook /api/facebook/webhook bat comment NGAY (khong can quyen dac biet); tin nhan Messenger can pages_messaging (dang xin Facebook App Review 24/8, chua duyet). Trang /khach-hang xem + cap nhat trang thai, /noi-dung them tile so lead 7 ngay + link. USER CAN AP MIGRATION qua Supabase SQL Editor truoc khi webhook chay duoc. -->
<!-- re-verified: 2026-08-24 14:45 - Migration 20260824150000_mkt_metrics_source_tiktok: noi CHECK mkt_metrics.source them 'tiktok'. Cap nhat mo ta hang mkt_metrics duoi day (gsc/ga4/facebook/youtube/tiktok/manual). Ly do: cron 24/8 keo TikTok view/like/comment vao mkt_metrics source='tiktok' nhung constraint chua cho, insert bi chan. USER paste .sql vao Supabase SQL Editor de ap. -->
<!-- re-verified: 2026-08-13 - Lap doc luoc do lan dau: liet ke 14 bang tu supabase/migrations. Them mkt_oauth_tokens (token OAuth TikTok, RLS khong policy = chi service_role doc/ghi). -->
<!-- re-verified: 2026-08-14 - Migration 20260813150000 noi CHECK: mkt_posts.channel them 'tiktok', mkt_metrics.source them 'manual'. Cap nhat 2 hang bang tuong ung. -->
<!-- re-verified: 2026-08-14 - Migration 20260814100000: them cot brand_assets.product_group (folder san pham theo STT) + index. Phuc vu vong xoay dang bai hang ngay theo folder. -->
<!-- re-verified: 2026-08-14 - Migration 20260814120000: them bang mkt_plans (con bot dinh huong ke hoach tu so lieu Do luong, cron T4 & CN). RLS bat, policy staff. Them 1 hang bang. -->
<!-- re-verified: 2026-08-18 - Migration 20260818120000_kho_tri_thuc: them 2 bang mkt_knowledge_internal + mkt_knowledge_public cho Ke hoach AI v2 (dac ta docs/app-map/ke-hoach-ai-v2-ba-spec.md). Them bucket Storage kho-tri-thuc-noi-bo (private, RLS authenticated). CHI la nguyen lieu dinh huong, KHONG tu tao bai/hang cho duyet. Da ap len live jwisiccphcepgpabyyco qua db-apply.mjs. -->
<!-- re-verified: 2026-08-20 - Migration 20260820000000_mkt_ads (item 4 do luong quang cao): them bang mkt_ads (chien dich AD nguoi quan ly khai bao: platform, UTM, budget, results jsonb; bot KHONG tu chay AD) + 4 key app_config (mkt_meta_pixel_id, mkt_ga4_measurement_id, mkt_messenger_username, mkt_zalo_oa_id, gia tri cong khai khong phai secret). RLS bat policy staff. Da ap len live jwisiccphcepgpabyyco qua DATABASE_URL (pooler). App doc bang OK trong preview. -->
<!-- LUU Y: DATABASE_URL trong .env tro NHAM project cu (schema khac). Migration phai ap len project live jwisiccphcepgpabyyco qua SQL Editor hoac sau khi sua DATABASE_URL. db-apply.mjs da co chot chan ap nham DB. (20/8: DATABASE_URL hien tro dung jwisiccphcepgpabyyco - da ap mkt_ads thanh cong qua pooler.) -->

Chi tiết cột và chính sách nằm trong `supabase/migrations`. Cách áp dụng: `supabase/README.md`.

## Bảng

| Bảng | Mảng | Vai trò | RLS |
|---|---|---|---|
| approval_queue | Chung | Hàng đợi duyệt, cổng điều cấm 1 (pending → approved mới đăng) | Bật, staff |
| run_log | Chung | Nhật ký thao tác tự động, kèm ảnh chụp khi lỗi | Bật, staff |
| brand_assets | Marketing | Kho tư liệu ảnh/clip thật (owned/licensed), cột `product_group` = folder sản phẩm (STT) cho vòng xoay | Bật, staff |
| mkt_keywords | Marketing | Kho từ khóa, phân loại theo ý định | Bật, staff |
| mkt_content | Marketing | Nội dung + trạng thái, cờ needs_gov_review, brief.assets, `deleted_at` = soft-delete (giữ lịch sử Like/View ở mkt_metrics) | Bật, staff |
| mkt_posts | Marketing | Bài đã đăng + kênh (facebook/website/youtube/tiktok), external_url, `made_public_at` = user đánh dấu đã đổi công khai tay (TikTok chưa audit), `deleted_at` = soft-delete user tự đánh dấu bài đã bị xoá tay (VD: xoá video TikTok trên app) | Bật, staff |
| mkt_metrics | Marketing | Số liệu đo lường (gsc/ga4/facebook/youtube/tiktok/manual) | Bật, staff |
| mkt_oauth_tokens | Marketing | Token OAuth cần refresh (TikTok): access/refresh token, hạn. **RLS không policy = chỉ service_role đọc/ghi, không lộ ra giao diện** | Bật, service_role only |
| mkt_plans | Marketing | Kế hoạch định hướng do bot sinh từ số liệu Đo lường (cron T4 & CN hoặc bấm tay). data jsonb chứa xếp hạng + trọng số + đoạn định hướng; `applied` bật thì vòng xoay ưu tiên theo; v2 thêm `summary.knowledge` (số nguồn tri thức 7 ngày đã dùng) | Bật, staff |
| mkt_knowledge_internal | Marketing | Tri thức nội bộ (file trong bucket kho-tri-thuc-noi-bo, Cowork xuất từ Zalo). Cột `source_path` UNIQUE để idempotent. Chỉ nguyên liệu cho Kế hoạch AI | Bật, staff |
| mkt_knowledge_public | Marketing | Tri thức public bot học mỗi CN từ Gemini google_search grounding. Cột `source_url` bắt buộc khác rỗng. Chỉ nguyên liệu cho Kế hoạch AI | Bật, staff |
| mkt_leads | Marketing | Người hỏi mua bắt được từ comment/tin nhắn Facebook (webhook `/api/facebook/webhook`) hoặc nhập tay. `status` new/contacted/closed/spam, `content_id` liên kết bài nếu là comment. Máy CHỈ đọc/lưu, không tự nhắn lại khách (điều cấm 1) | Bật, staff |
| claude_code_usage | Chung | Token Claude Code (Anthropic Max) user đốt khi chat, quy đổi tiền theo API pricing. Dedupe `message_id` UNIQUE. Sync bằng script `upload-claude-usage.mjs` (cron Windows Task 1h/lần) đọc jsonl `~/.claude/projects/*SDVICO*`. Dashboard `/kho-tri-thuc?ai=token` block "Claude Code" | Bật, staff |
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
