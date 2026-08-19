-- 20260819500000_boss_review_link.sql
-- Link công khai cho sếp xem CV và ra quyết định phỏng vấn mà không cần đăng nhập.
-- HR tạo link, copy gửi sếp qua chat. Sếp mở link → xem CV + chọn khung giờ → tạo pending
-- trong approval_queue → HR vào / bấm Duyệt & gửi thật (điều cấm 1 vẫn giữ).
-- Token 32 ký tự random, hết hạn mặc định sau 7 ngày, revoke sau khi sếp bấm.

alter table public.hr_applications
  add column if not exists review_token text;

alter table public.hr_applications
  add column if not exists review_token_expires_at timestamptz;

alter table public.hr_applications
  add column if not exists boss_reviewed_at timestamptz;

-- Quyết định của sếp: 'interview' (hẹn phỏng vấn), 'reject' (từ chối), 'hold' (chờ thêm thông tin).
alter table public.hr_applications
  add column if not exists boss_decision text;

-- Index cho lookup nhanh theo token (public page dùng).
create unique index if not exists hr_applications_review_token_uniq
  on public.hr_applications (review_token)
  where review_token is not null;
