-- 20260812100000_hr_jobs_group.sql
-- Phân nhóm ngành cho vị trí tuyển dụng (A kỹ thuật, B kinh doanh, C văn phòng, D kho vận).
-- Bổ sung cột, không sửa dữ liệu cũ. Chạy trong Supabase SQL editor.

alter table public.hr_jobs add column if not exists nhom text
  check (nhom in ('A','B','C','D'));
