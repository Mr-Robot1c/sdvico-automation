-- 20260819600000_refresh_default_month.sql
-- Đổi mặc định refresh_after_days từ 4 ngày → 30 ngày (1 tháng).
-- Sau 1 tháng bài mới tự soạn refresh, không phải mỗi 4 ngày spam Facebook.
-- Row cũ được đổi từ giá trị 4 → 30 (giả định 4 là default cũ, không phải user chọn).
-- Ai đã sửa tay sang giá trị khác (VD 7, 14) thì giữ nguyên.

alter table public.hr_jobs
  alter column refresh_after_days set default 30;

-- Chỉ đổi các row có giá trị = 4 (default cũ). Rows đã sửa tay giữ nguyên.
update public.hr_jobs
set refresh_after_days = 30
where refresh_after_days = 4;
