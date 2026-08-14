-- Cho phép ứng viên tự chọn khung giờ phỏng vấn qua link công khai (token).
-- schedule_token: mã ngẫu nhiên trong link gửi ứng viên. chosen_slot: khung giờ họ chọn.
alter table if exists public.hr_applications
  add column if not exists schedule_token text,
  add column if not exists chosen_slot text,
  add column if not exists slot_chosen_at timestamptz;

create unique index if not exists hr_applications_schedule_token_idx
  on public.hr_applications (schedule_token)
  where schedule_token is not null;
