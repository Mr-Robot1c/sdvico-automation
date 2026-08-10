-- 20260810140000_core.sql
-- Bảng phụ trợ cho packages/core: công tắc dừng khẩn và bộ đếm hạn mức ngày.
-- Bổ sung, không sửa bảng cũ.

-- app_config: cấu hình dạng khóa và giá trị. Dùng cho công tắc dừng khẩn.
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value)
values ('emergency_stop', 'false'::jsonb)
on conflict (key) do nothing;

-- daily_counters: bộ đếm hạn mức theo tài khoản, loại việc, ngày. Hạn mức tự đặt lưu trong cơ sở dữ liệu.
create table if not exists public.daily_counters (
  account text not null,
  kind    text not null,
  day     date not null,
  count   int  not null default 0,
  primary key (account, kind, day)
);

-- Bật RLS cho hai bảng mới. service_role tự bỏ qua. authenticated thao tác theo chính sách.
alter table public.app_config     enable row level security;
alter table public.daily_counters enable row level security;

drop policy if exists app_config_staff_all on public.app_config;
create policy app_config_staff_all on public.app_config
  for all to authenticated using (true) with check (true);

drop policy if exists daily_counters_staff_all on public.daily_counters;
create policy daily_counters_staff_all on public.daily_counters
  for all to authenticated using (true) with check (true);
