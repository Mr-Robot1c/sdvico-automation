-- 20260918180000_mkt_seo_queries.sql
-- Plan 18/9 (docs/plans/plan-seo-vong-kin-tu-khoa-18-09.md), viec B: diem tu khoa THAT tu Google
-- Search Console ("ai kiem nhieu hon" - sep hoi qua Thanh 18/9). Bang nay CHUA co du lieu cho toi
-- khi anh Thanh them tai khoan dich vu sdvico-kho-tu-lieu@sdvico-youtube.iam.gserviceaccount.com
-- vao property sdvico.vn (npm run gsc:kiem da kiem 18/9: API bat, CHUA duoc them quyen).
--
-- Ghi boi packages/marketing/src/gsc-keo-so.mjs (cron Thu 2 sau seo-audit, seo-weekly.yml). Doc
-- boi trang /seo (top 15 diem + danh sach tu khoa Google da thay nhung kho chua co bai).
-- window_start/window_end = khung 28 ngay cua lan keo; moi lan keo XOA dong CUNG window_end roi
-- chen lai (idempotent, khong dup khi chay lai cung ngay).

create table if not exists public.mkt_seo_queries (
  id           uuid primary key default gen_random_uuid(),
  query        text not null,
  page         text,
  clicks       int not null default 0,
  impressions  int not null default 0,
  position     numeric,
  window_start date,
  window_end   date,
  pulled_at    timestamptz not null default now()
);
create index if not exists mkt_seo_queries_query_window_idx on public.mkt_seo_queries (query, window_end);

alter table public.mkt_seo_queries enable row level security;
do $$
begin
  drop policy if exists mkt_seo_queries_staff_all on public.mkt_seo_queries;
  create policy mkt_seo_queries_staff_all on public.mkt_seo_queries
    for all to authenticated using (true) with check (true);
end $$;
