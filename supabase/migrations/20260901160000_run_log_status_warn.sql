-- Audit SEO hằng tuần cần status 'warn': lần chạy THÀNH CÔNG nhưng có điểm dưới ngưỡng
-- (trước đây seo-audit luôn ghi 'ok' nên UI không bao giờ cảnh báo).
-- Constraint gốc ở 20260810090000_init.sql chỉ nhận ok/error/skipped.
alter table public.run_log drop constraint if exists run_log_status_check;
alter table public.run_log add constraint run_log_status_check
  check (status in ('ok', 'error', 'skipped', 'warn'));
