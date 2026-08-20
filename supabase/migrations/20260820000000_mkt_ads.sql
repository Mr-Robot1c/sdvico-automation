-- 20260820000000_mkt_ads.sql
-- Ha tang DO LUONG quang cao (item 4, 20/8). Bot KHONG tu tao/chay quang cao (khong ton ngan
-- sach, khong dung Meta Marketing API). Thay vao do: nguoi quan ly chay AD tay tren FB Ads
-- Manager / Google Ads, he thong sinh link UTM + gan Pixel/GA4 de DO don ve tu tung campaign.
--
-- mkt_ads: moi dong = 1 chien dich quang cao nguoi quan ly khai bao de theo doi.
create table if not exists public.mkt_ads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                       -- Ten chien dich (nguoi dat)
  platform      text not null default 'facebook'     -- Kenh chay AD
                check (platform in ('facebook','google','tiktok','zalo','khac')),
  objective     text,                                -- Muc tieu: tin_nhan | truy_cap | mua_hang | ...
  landing_path  text not null default '/',           -- Trang dich tren site (vd /san-pham/sea-40)
  utm_source    text not null default 'facebook',
  utm_medium    text not null default 'cpc',
  utm_campaign  text not null,                        -- Ma chien dich (khong dau, khong khoang trang)
  utm_content   text,                                 -- Bien the quang cao (A/B)
  budget        numeric,                              -- Ngan sach du kien (dong)
  note          text,
  status        text not null default 'active'        -- active | paused | ended
                check (status in ('active','paused','ended')),
  -- Ket qua nguoi quan ly nhap tay tu FB Ads Manager (bot khong doc duoc Ads API phien nay):
  -- { spend, reach, clicks, messages, leads, orders } — de doi chieu chi phi / hieu qua.
  results       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists mkt_ads_status_idx on public.mkt_ads (status, created_at desc);
create index if not exists mkt_ads_campaign_idx on public.mkt_ads (utm_campaign);

alter table public.mkt_ads enable row level security;

do $$
begin
  drop policy if exists mkt_ads_staff_all on public.mkt_ads;
  create policy mkt_ads_staff_all on public.mkt_ads
    for all to authenticated using (true) with check (true);
end $$;

-- Luu Pixel ID + GA4 Measurement ID trong app_config (dat qua UI /quang-cao, khong can
-- redeploy). Gia tri la CONG KHAI (nhung id nay hien tren trang public) nen khong phai secret.
insert into public.app_config (key, value)
values
  ('mkt_meta_pixel_id', 'null'::jsonb),
  ('mkt_ga4_measurement_id', 'null'::jsonb),
  ('mkt_messenger_username', 'null'::jsonb),   -- m.me/<username> cho nut nhan tin
  ('mkt_zalo_oa_id', 'null'::jsonb)            -- zalo.me/<oa_id> cho nut Zalo
on conflict (key) do nothing;
