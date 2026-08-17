-- Bảng danh sách trắng người được vào giao diện duyệt.
-- Điều cấm 6: dữ liệu ứng viên nằm trong hạ tầng công ty, chỉ nhân sự được cấp quyền mới xem được.
--
-- Cách dùng: sau khi bật Supabase Auth và cấu hình magic link theo docs/dang-nhap-supabase-auth.md,
-- thêm email nhân sự vào bảng này. Người có email trong danh sách bấm link magic mail là đăng
-- nhập được. Ai không có trong danh sách, dù có mail hợp lệ, cũng bị chặn ở trang đăng nhập.
--
-- Không dùng auth.users trực tiếp vì auth.users là chỗ Supabase tự sinh ra khi ai đó thử đăng
-- nhập lần đầu. Bảng riêng hr_users giữ danh sách trắng đơn giản, tự quản, không lệ thuộc
-- ai đã lỡ tay bấm gửi link magic.

create table if not exists public.hr_users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  full_name    text,
  role         text not null default 'staff' check (role in ('admin','staff')),
  created_at   timestamptz not null default now(),
  disabled_at  timestamptz -- đặt giá trị là vô hiệu hóa, không xóa để giữ vết trong decided_by
);

create index if not exists hr_users_email_idx on public.hr_users(lower(email));

-- Bật RLS. Backend dùng service role sẽ tự bỏ qua RLS.
alter table public.hr_users enable row level security;

-- Không cho ai đọc từ client, kể cả user đã đăng nhập. App đọc bằng service role.
drop policy if exists hr_users_no_public on public.hr_users;
create policy hr_users_no_public on public.hr_users for all
  using (false) with check (false);
