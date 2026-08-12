-- 20260812090000_hr_social_posts.sql
-- Đăng tin tuyển dụng lên mạng xã hội theo mô hình: máy soạn, người bấm Duyệt, worker mới đăng.
-- Bổ sung cột cho tin đăng, không sửa dữ liệu cũ. Chạy trong Supabase SQL editor.

-- Nội dung bài đăng. Bản nháp máy soạn, người duyệt có thể sửa. Nguồn sự thật cho worker đăng.
alter table public.hr_job_posts add column if not exists noi_dung text;

-- Kênh của tin đăng, để worker biết đăng đi đâu. Giai đoạn này dùng facebook.
alter table public.hr_job_posts add column if not exists kenh text not null default 'facebook'
  check (kenh in ('facebook','zalo','job_board','website','other'));

-- Mở rộng trạng thái: thêm 'failed' cho lần đăng lỗi. Các giá trị cũ vẫn hợp lệ.
alter table public.hr_job_posts drop constraint if exists hr_job_posts_trang_thai_check;
alter table public.hr_job_posts add constraint hr_job_posts_trang_thai_check
  check (trang_thai in ('draft','scheduled','posted','failed','cancelled'));
