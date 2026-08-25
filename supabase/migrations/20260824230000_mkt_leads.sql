-- 20260824230000_mkt_leads.sql
-- Ha tang "theo doi nguoi mua" (24/8, user: "khoi do co bao nhieu nguoi hay sao do", "gui ve
-- cho nhan vien kinh doanh"). Nguon lead: comment/inbox Facebook hoi mua duoi bai dang.
--
-- TRANG THAI HA TANG (24/8): token Facebook hien tai CHUA co quyen pages_messaging (doc
-- inbox) — da xac nhan qua audit code. User dang xin quyen tren Facebook App (App Review,
-- mat vai ngay-tuan). Bang nay + webhook route lam SAN, chua nhan duoc du lieu that cho toi
-- khi: (1) Facebook duyet pages_messaging, (2) dang ky Webhook URL tren Facebook Developer
-- Console tro ve /api/facebook/webhook.
--
-- mkt_leads: moi dong = 1 nguoi hoi mua bat duoc tu comment hoac tin nhan Facebook.
create table if not exists public.mkt_leads (
  id              uuid primary key default gen_random_uuid(),
  source          text not null default 'facebook_comment'   -- nguon bat lead
                  check (source in ('facebook_comment','facebook_message','manual')),
  fb_user_id      text,                        -- PSID (Page-Scoped ID) hoac commenter id tu Facebook
  fb_user_name    text,                        -- ten hien thi Facebook tai thoi diem bat
  fb_profile_url  text,                        -- link profile (khong phai luc nao cung co)
  message         text not null default '',    -- noi dung comment/tin nhan hoi mua
  content_id      uuid references public.mkt_content(id) on delete set null,  -- bai lien quan (neu la comment)
  product_guess   text,                        -- san pham doan duoc tu noi dung (khong bat buoc dung)
  status          text not null default 'new'  -- new | contacted | closed | spam
                  check (status in ('new','contacted','closed','spam')),
  note            text,                        -- ghi chu cua nguoi ban hang (theo doi da lien he chua)
  raw_payload     jsonb not null default '{}'::jsonb,  -- webhook payload goc, phong khi can doi chieu
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists mkt_leads_status_idx on public.mkt_leads (status, created_at desc);
create index if not exists mkt_leads_created_idx on public.mkt_leads (created_at desc);
create index if not exists mkt_leads_content_idx on public.mkt_leads (content_id);

-- Dedup: cung 1 nguoi (fb_user_id) hoi lien tuc duoi nhieu bai khong tao lead trung —
-- unique theo (fb_user_id, content_id) khi ca hai co gia tri, webhook route tu kiem tra
-- truoc khi insert (khong dung constraint cung vi fb_user_id/content_id co the null cho
-- nguon 'manual').

alter table public.mkt_leads enable row level security;

do $$
begin
  drop policy if exists mkt_leads_staff_all on public.mkt_leads;
  create policy mkt_leads_staff_all on public.mkt_leads
    for all to authenticated using (true) with check (true);
end $$;

-- FACEBOOK_WEBHOOK_VERIFY_TOKEN: chuoi tu chon (khong phai secret Facebook cap), dat trong
-- bien moi truong, dung de Facebook xac minh webhook URL that su thuoc ve minh (GET request
-- hub.challenge). Khong luu trong DB, chi ghi chu o day de nguoi trien khai biet can co bien nay.
