-- 20260819200000_gov_review_gate.sql
-- P2-17: chốt chặn điều cấm 3 (nội dung chạm quy định nhà nước/IUU/Cục Thủy sản/Kiểm ngư
-- phải qua duyệt cấp quản lý). Trước đây điều cấm 3 chỉ là quy trình con-người, không
-- có bit nào trong DB chặn cron publish. Nay thêm 3 cột vào hr_job_posts:
--   needs_gov_review: cron auto-detect khi soạn (heuristic từ khoá regulation),
--   gov_reviewed_by:  email người bấm duyệt cấp quản lý,
--   gov_reviewed_at:  thời điểm duyệt.
-- Route publish sẽ SKIP bài có needs_gov_review=true khi gov_reviewed_by chưa đặt.

alter table public.hr_job_posts
  add column if not exists needs_gov_review boolean not null default false;

alter table public.hr_job_posts
  add column if not exists gov_reviewed_by text;

alter table public.hr_job_posts
  add column if not exists gov_reviewed_at timestamptz;
