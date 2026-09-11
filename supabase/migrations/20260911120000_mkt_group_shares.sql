-- 20260911120000_mkt_group_shares.sql
-- Ghi nhan NGUOI da chia bai Page vao group Facebook nao, luc nao (Thanh 11/9: chia 51 group theo
-- lo 8 nhom/ngay, xoay deu 7 ngay). May KHONG tu dang vao group (Groups API dong tu 2020, dieu cam 1);
-- bang nay chi la so ghi chep de xep lo hom nay + dem luot chia o Tong quan.
-- group_id = id trong app_config mkt_share_groups (so hoac slug), group_label = ten luc chia.
create table if not exists public.mkt_group_shares (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid references public.mkt_content(id) on delete set null,
  group_id     text not null,
  group_label  text,
  post_url     text,
  shared_at    timestamptz not null default now(),
  shared_by    text,
  source       text not null default 'popover',
  created_at   timestamptz not null default now()
);
create index if not exists mkt_group_shares_group_time_idx on public.mkt_group_shares (group_id, shared_at desc);
create index if not exists mkt_group_shares_time_idx on public.mkt_group_shares (shared_at desc);
alter table public.mkt_group_shares enable row level security;
do $$
begin
  drop policy if exists mkt_group_shares_staff_all on public.mkt_group_shares;
  create policy mkt_group_shares_staff_all on public.mkt_group_shares
    for all to authenticated using (true) with check (true);
end $$;
