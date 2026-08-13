-- 20260813010000_hr_job_posts_fb_post_id.sql
-- Lưu ID bài đăng trên Facebook để có thể gỡ bài qua Graph API sau này.
-- Graph API trả về id dạng "123456789_987654321" khi đăng thành công.
alter table public.hr_job_posts
  add column if not exists fb_post_id text;
