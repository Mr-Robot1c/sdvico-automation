-- 20260819600000_hr_job_posts_loai.sql
-- Phân biệt bài tương tác (hâm nóng trang) với tin tuyển dụng, dùng chung bảng hr_job_posts.
-- Bài tương tác không gắn với vị trí nào (job_id để trống), đi cùng đường ống đăng:
-- máy soạn, đẩy approval_queue kind='hr_job_post', người bấm Duyệt, worker publish-facebook.mjs đăng.
-- Bổ sung, không sửa dữ liệu cũ. Chạy trong Supabase SQL editor.

-- loai: 'tuyen_dung' là tin tuyển vị trí (mặc định, giữ nguyên hành vi cũ),
--       'tuong_tac' là bài hâm nóng trang, không gắn job_id.
alter table public.hr_job_posts
  add column if not exists loai text not null default 'tuyen_dung'
  check (loai in ('tuyen_dung','tuong_tac'));

-- Chủ đề bài tương tác, để lọc và tránh lặp góc bài. Rỗng với tin tuyển dụng.
alter table public.hr_job_posts
  add column if not exists chu_de text;

-- Lọc nhanh danh sách bài tương tác trong giao diện.
create index if not exists hr_job_posts_loai_idx on public.hr_job_posts (loai);
