-- Thêm số lượng cần tuyển. Người dùng nhập để hệ thống biết
-- còn tuyển hay đã đủ người, tránh đăng bài thừa.
ALTER TABLE hr_jobs
  ADD COLUMN IF NOT EXISTS headcount integer NOT NULL DEFAULT 1;
