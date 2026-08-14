-- mkt_plans: bản kế hoạch marketing do con bot định hướng sinh ra từ số liệu Đo lường.
-- Bot ĐỀ XUẤT, người quyết (điều cấm 1 và 2). Cron sinh bản 'cron', người bấm sinh bản 'manual'.
-- Trọng số chỉ tác động vòng xoay sinh bài SAU KHI người bấm "Áp dụng" (applied = true).
create table if not exists public.mkt_plans (
  id            uuid primary key default gen_random_uuid(),
  period_start  date,
  period_end    date,
  generated_by  text not null default 'cron' check (generated_by in ('cron','manual')),
  -- data: { threshold, weeklyBudget, products:[...], weights:{product:posts}, narrative:[...], summary:{...} }
  data          jsonb not null default '{}'::jsonb,
  applied       boolean not null default false,   -- true khi người bấm "Áp dụng trọng số"
  applied_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists mkt_plans_created_idx on public.mkt_plans (created_at desc);
create index if not exists mkt_plans_applied_idx on public.mkt_plans (applied, created_at desc);

-- RLS như các bảng mkt khác: chỉ người đăng nhập nội bộ đọc/ghi. Backend dùng service role, tự bỏ qua RLS.
alter table public.mkt_plans enable row level security;

do $$
begin
  drop policy if exists mkt_plans_staff_all on public.mkt_plans;
  create policy mkt_plans_staff_all on public.mkt_plans
    for all to authenticated using (true) with check (true);
end $$;
