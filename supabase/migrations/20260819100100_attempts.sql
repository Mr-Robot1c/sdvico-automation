-- 20260819100100_attempts.sql
-- Đếm số lần thử đăng để chặn retry vô hạn ở cron publish / comment-publish.
-- Sau MAX_ATTEMPTS (3) lần thất bại, cron bỏ qua và giữ mục ở trạng thái 'failed'
-- cho người vận hành xử lý tay qua trang Đăng tin / Bình luận.

alter table public.hr_job_posts
  add column if not exists attempts integer not null default 0;

alter table public.hr_fb_comments
  add column if not exists attempts integer not null default 0;
