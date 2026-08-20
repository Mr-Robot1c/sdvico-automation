# Runbook: gỡ nhánh Jooble / trang tuyển public

Ba mức gỡ, chọn mức phù hợp. Càng lên trên càng nhanh và ít rủi ro. Chỉ xuống mức 3 khi chắc chắn không dùng lại.

Điều cấm 1 áp dụng: mọi thay đổi trên nền tảng ngoài (email cho Jooble, chỉnh env Vercel) do người bấm gửi.

## Mức 1: Tắt tức thì (1 phút, không đụng data, không cần deploy)

Trên Vercel, đặt biến môi trường:

```
JOBS_PUBLIC_ENABLED=false
```

Redeploy (Vercel tự làm khi đổi env). Sau đó:

- `${DOMAIN}/api/jobs/feed.xml` → 404
- `${DOMAIN}/tuyen-dung` → 404
- `${DOMAIN}/tuyen-dung/[slug]` → 404

Bên trong app quản lý (nội bộ) không đổi: HR vẫn thấy tin trong `/vi-tri`, `/dang-tin`, `/kenh`. Facebook, LinkedIn và các job board thủ công vẫn chạy bình thường.

JoobleBot sẽ thấy 404 và trong ~24 giờ tự loại tin khỏi jooble.org. Không cần liên hệ Jooble.

Bật lại: xoá biến (hoặc đặt `=true`), redeploy.

## Mức 2: Gỡ code (30 phút, không đụng data, cần deploy)

Khi biết chắc không dùng feed nữa và muốn giữ codebase sạch. Data trong `hr_jobs` giữ nguyên — các cột mới nhàn rỗi, không hại.

Xoá các file sau:

- `apps/approval-ui/app/api/jobs/` (endpoint feed)
- `apps/approval-ui/app/tuyen-dung/` (trang public)
- `apps/approval-ui/lib/jobs-public.ts` (kill switch helper)
- `docs/jooble-bootstrap.md` và `docs/jooble-rollback.md` (runbook)

Xoá các đoạn thêm vào (tìm bằng grep `jooble`, `feed.xml`, `tuyen-dung`, `isFeed`, `jobsPublicEnabled`):

- `apps/approval-ui/middleware.ts` → xoá 2 khối `if (path === '/api/jobs/feed.xml') ...` và `if (path === '/tuyen-dung' ...)`
- `apps/approval-ui/app/nav.tsx` → xoá dòng `if (path === '/tuyen-dung' ...)` return null
- `apps/approval-ui/lib/channels.ts` → xoá entry `jooble`, xoá `'feed'` khỏi `ChannelMethod`, xoá `isFeed()`, xoá nhánh `if (m === 'feed')` trong `methodLabel()`
- `apps/approval-ui/app/actions.ts` → xoá import `isFeed` và block `if (isFeed(post.kenh)) ...` trong `publishJobPost`
- `apps/approval-ui/app/kenh/page.tsx` → không cần đụng (đã dùng type từ channels.ts)
- `.env.example` → xoá `NEXT_PUBLIC_SITE_URL` và `JOBS_PUBLIC_ENABLED`

Trên Vercel: xoá biến `NEXT_PUBLIC_SITE_URL` và `JOBS_PUBLIC_ENABLED`.

Trên Supabase: xoá dòng `jooble` khỏi `hr_platforms`:

```sql
delete from public.hr_platforms where kenh = 'jooble';
```

Chạy `npx tsc --noEmit` và `npx next build --no-lint` trong `apps/approval-ui/` để bảo đảm không còn tham chiếu chết.

## Mức 3: Gỡ hoàn toàn schema (không khuyến nghị trừ khi cần)

Sau khi đã Mức 2, và biết chắc dữ liệu trong các cột mới không dùng lại. Việc này KHÔNG THỂ HOÀN TÁC — sau khi drop, muốn có lại phải chạy lại migration + backfill.

Chạy trong Supabase SQL Editor (không đặt vào `supabase/migrations/` vì file trong đó sẽ tự chạy trên môi trường mới):

```sql
-- Rollback: gỡ toàn bộ cột và index sinh bởi 20260820120000_hr_jobs_feed_columns.sql
-- CẢNH BÁO: xoá data trong 6 cột dưới đây, không hoàn tác.

alter table public.hr_jobs
  drop column if exists slug,
  drop column if exists salary_display,
  drop column if exists employment_type,
  drop column if exists published_at,
  drop column if exists updated_at,
  drop column if exists expire_at;

drop index if exists public.hr_jobs_slug_uidx;
drop index if exists public.hr_jobs_feed_idx;

-- Xoá cả entry Jooble khỏi hr_platforms nếu chưa xoá ở Mức 2.
delete from public.hr_platforms where kenh = 'jooble';
```

Sau đó Mức 2 (nếu chưa làm) để codebase không còn tham chiếu cột đã drop.

## Kiểm sau khi gỡ

Mức | Cần verify
--- | ---
1   | Feed 404, trang 404, `/kenh` và `/dang-tin` vẫn chạy, Facebook/LinkedIn vẫn đăng được.
2   | Trên đây + `npx tsc --noEmit` pass, `next build` pass, grep `jooble\|feed.xml\|tuyen-dung\|isFeed\|jobsPublicEnabled` trong `apps/approval-ui/` trả về rỗng.
3   | Trên đây + `select column_name from information_schema.columns where table_name = 'hr_jobs'` không còn 6 cột đã drop.

## Nếu Jooble đã whitelist feed rồi mà muốn rút

Không cần liên hệ Jooble để "unregister". Chỉ cần feed trả 404 hoặc empty. JoobleBot crawl thấy không có gì sẽ tự loại tin trong 24–72 giờ. Nếu muốn báo cho gọn, email lại địa chỉ ban đầu (`xml_support@jooble.com`) yêu cầu "please stop crawling feed at [URL], we are no longer publishing jobs there".
