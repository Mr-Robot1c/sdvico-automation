-- 20260813000000_hr_job_posts_soft_delete.sql
-- Thêm cột deleted_at cho soft delete (thùng rác 7 ngày).
-- Bài xoá sẽ có deleted_at IS NOT NULL. Truy vấn chính lọc IS NULL.
-- Chạy trong Supabase SQL editor.
alter table public.hr_job_posts
  add column if not exists deleted_at timestamptz;
