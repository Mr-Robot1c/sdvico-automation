-- 20260820100000_hr_fb_post_metrics.sql
-- Snapshot mới nhất số lượt tương tác của mỗi bài đã đăng trên Facebook Page.
-- Không có cron riêng: khi user mở /dang-tin hay /tuong-tac, server component
-- kiểm cache; snapshot cũ hơn HR_FB_METRICS_TTL_MINUTES (mặc định 15 phút) thì
-- tự gọi Graph API và upsert vào bảng này (xem apps/approval-ui/lib/fb-metrics.ts).
-- Bảng chỉ giữ 1 dòng mới nhất per fb_post_id.
--
-- Dữ liệu công khai (like, comment, share, và nếu có quyền: reach/impressions/click)
-- — không nhạy cảm, dùng RLS mặc định "authenticated can read/write" giống hr_fb_comments.
--
-- insights_available=false nghĩa là token Page chưa có quyền read_insights;
-- 3 cột impressions/reach/clicks có thể là NULL trong trường hợp đó.

create table if not exists public.hr_fb_post_metrics (
  fb_post_id          text primary key,
  job_post_id         uuid references public.hr_job_posts(id) on delete set null,
  reactions           integer not null default 0,
  comments            integer not null default 0,
  shares              integer not null default 0,
  impressions         integer,
  reach               integer,
  clicks              integer,
  insights_available  boolean not null default false,
  fetched_at          timestamptz not null default now(),
  error_last          text
);

create index if not exists hr_fb_post_metrics_job_post_idx
  on public.hr_fb_post_metrics (job_post_id);

create index if not exists hr_fb_post_metrics_fetched_idx
  on public.hr_fb_post_metrics (fetched_at desc);

alter table public.hr_fb_post_metrics enable row level security;

drop policy if exists hr_fb_post_metrics_staff_all on public.hr_fb_post_metrics;
create policy hr_fb_post_metrics_staff_all on public.hr_fb_post_metrics
  for all to authenticated using (true) with check (true);
