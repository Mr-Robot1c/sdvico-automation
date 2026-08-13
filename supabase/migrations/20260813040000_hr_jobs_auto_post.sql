-- Thêm hai cột cho tính năng danh sách tự động đăng bài.
-- auto_post: vị trí này có nằm trong vòng lặp tự động không.
-- refresh_after_days: sau bao ngày kể từ bài cũ thì soạn bài mới.
ALTER TABLE hr_jobs
  ADD COLUMN IF NOT EXISTS auto_post boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refresh_after_days integer NOT NULL DEFAULT 4;
