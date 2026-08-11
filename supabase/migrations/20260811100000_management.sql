-- 20260811100000_management.sql
-- Bổ sung cho quản lý trên web: ghi chú hồ sơ, khung giờ phỏng vấn, nền tảng đăng tuyển, theo dõi tin đăng.
-- Bổ sung, không sửa bảng cũ. Chạy trong Supabase SQL editor.

-- Ghi chú của người duyệt cho từng hồ sơ ứng tuyển.
alter table public.hr_applications add column if not exists note text;

-- Khung giờ phỏng vấn mong muốn, dùng cho tự sắp lịch. Lưu ở app_config.
insert into public.app_config (key, value)
values ('interview_windows', '["09:00","10:30","14:00","15:30"]'::jsonb)
on conflict (key) do nothing;

-- hr_platforms: nền tảng đăng tuyển hoặc tìm ứng viên. Cấu hình KHÔNG chứa bí mật (điều cấm 7).
create table if not exists public.hr_platforms (
  id         uuid primary key default gen_random_uuid(),
  ten        text not null,
  loai       text not null default 'job_board' check (loai in ('job_board','social','other')),
  bat        boolean not null default true,
  ghi_chu    text,
  created_at timestamptz not null default now()
);

-- hr_job_posts: theo dõi tin đăng theo vị trí và nền tảng, cả giờ đăng và trạng thái.
create table if not exists public.hr_job_posts (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.hr_jobs(id) on delete set null,
  platform_id  uuid references public.hr_platforms(id) on delete set null,
  tieu_de      text not null,
  trang_thai   text not null default 'draft' check (trang_thai in ('draft','scheduled','posted','cancelled')),
  scheduled_at timestamptz,
  posted_at    timestamptz,
  url          text,
  ghi_chu      text,
  created_at   timestamptz not null default now()
);

alter table public.hr_platforms enable row level security;
alter table public.hr_job_posts enable row level security;

drop policy if exists hr_platforms_staff_all on public.hr_platforms;
create policy hr_platforms_staff_all on public.hr_platforms for all to authenticated using (true) with check (true);

drop policy if exists hr_job_posts_staff_all on public.hr_job_posts;
create policy hr_job_posts_staff_all on public.hr_job_posts for all to authenticated using (true) with check (true);
