-- Cho phép kênh 'linkedin' cho hr_job_posts. Trước đây CHECK chỉ có facebook/zalo/...,
-- nên insert bài LinkedIn bị chặn (server action lỗi, không tạo được nháp).
alter table public.hr_job_posts drop constraint if exists hr_job_posts_kenh_check;
alter table public.hr_job_posts
  add constraint hr_job_posts_kenh_check
  check (kenh in ('facebook','linkedin','zalo','job_board','website','other'));
