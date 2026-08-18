-- Quản lý nhân viên sau khi đã nhận việc thật (không phải chỉ được mời).
-- hr_applications.stage='offer' nghĩa là ĐÃ MỜI, chưa chắc ứng viên đã đi làm. hired_at là
-- mốc người thật xác nhận ứng viên đã nhận việc, tạo ra bản ghi hr_employees.
--
-- Dữ liệu ở đây nhạy cảm hơn hr_candidates (BHXH, CCCD, hợp đồng lao động), nên KHÔNG theo
-- pattern RLS "for all to authenticated using(true)" đang dùng cho phần lớn bảng khác. Hai
-- bảng dưới đây không cấp policy nào cho authenticated (giống hr_users) — chỉ service role
-- đọc/ghi được, mọi truy cập từ app đi qua Server Action tự kiểm role admin trong lib/employees.ts.

alter table public.hr_applications
  add column if not exists hired_at timestamptz; -- mốc xác nhận đã nhận việc thật, khác offer (chỉ là đã mời)

comment on column public.hr_applications.hired_at
  is 'Người thật bấm "Xác nhận đã nhận việc" sau khi stage đã là offer. Tạo kèm 1 bản ghi hr_employees.';

create table if not exists public.hr_employees (
  id                    uuid primary key default gen_random_uuid(),
  candidate_id          uuid references public.hr_candidates(id) on delete set null,
  application_id        uuid references public.hr_applications(id) on delete set null,
  full_name             text,
  email                 text,
  phone                 text,
  chuc_danh             text,
  phong_ban             text,
  ngay_bat_dau          date,
  trang_thai            text not null default 'active' check (trang_thai in ('active','probation','left')),
  so_bhxh               text,
  so_cccd               text,
  onboarding_checklist  jsonb not null default '[]'::jsonb,
  created_by            text, -- email người bấm "Xác nhận đã nhận việc"
  created_at            timestamptz not null default now()
);

create index if not exists hr_employees_application_idx on public.hr_employees(application_id);

create table if not exists public.hr_employee_documents (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.hr_employees(id) on delete cascade,
  loai          text not null check (loai in ('hop_dong','bang_cap','bhxh','cccd','khac')),
  storage_path  text not null,
  ghi_chu       text,
  uploaded_by   text,
  created_at    timestamptz not null default now()
);

create index if not exists hr_employee_documents_employee_idx on public.hr_employee_documents(employee_id);

alter table public.hr_employees enable row level security;
alter table public.hr_employee_documents enable row level security;

-- Không cấp quyền cho authenticated hay anon. App đọc/ghi bằng service role, tự kiểm role
-- admin ở lib/employees.ts trước khi gọi (giống hr_users_no_public ở 20260815000000_hr_users.sql).
drop policy if exists hr_employees_no_public on public.hr_employees;
create policy hr_employees_no_public on public.hr_employees for all
  using (false) with check (false);

drop policy if exists hr_employee_documents_no_public on public.hr_employee_documents;
create policy hr_employee_documents_no_public on public.hr_employee_documents for all
  using (false) with check (false);
