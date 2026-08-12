-- 20260812130000_hr_post_image.sql
-- Thêm cột hình ảnh cho tin đăng mạng xã hội. Chạy trong Supabase SQL editor.
alter table public.hr_job_posts add column if not exists image_url text;
