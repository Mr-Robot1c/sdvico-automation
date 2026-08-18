-- 20260819010000_hr_channels_userdefined.sql
-- Cho phép người dùng tự THÊM / XÓA sàn tuyển dụng từ giao diện web (không cần sửa code lõi).
-- Bổ sung, không sửa dữ liệu cũ. Chạy trong Supabase SQL editor.

-- 1. Bỏ CHECK cứng trên hr_job_posts.kenh: kênh do người dùng tạo có khóa tùy ý,
--    không thể liệt kê trước trong CHECK. Hợp lệ hóa ở tầng ứng dụng (registry + hr_platforms).
--    Cột vẫn NOT NULL, mặc định 'facebook' như cũ.
alter table public.hr_job_posts drop constraint if exists hr_job_posts_kenh_check;

-- 2. hr_platforms lưu trang đăng của kênh (nút "Mở kênh để đăng"). KHÔNG chứa bí mật (điều cấm 7).
--    Kênh người dùng thêm luôn là 'manual' (đăng thủ công/track-only); nối API cần code + credentials.
alter table public.hr_platforms
  add column if not exists post_url text;
