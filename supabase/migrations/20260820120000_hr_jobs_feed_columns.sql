-- 20260820120000_hr_jobs_feed_columns.sql
-- Thêm cột cho XML feed Jooble (spec: jooble.org/files/xml_feed_specifications.pdf)
-- và trang canonical /tuyen-dung/[slug]. Feed đọc thẳng hr_jobs, tin phải có
-- status='open' và expire_at > now(). Không đi qua hr_job_posts hay approval_queue,
-- vì Jooble crawl một feed tổng, không đăng per-post.
--
-- Bổ sung, không phá cột cũ. Chạy trong Supabase SQL Editor.
--
-- Bootstrap Jooble (một lần, ngoài code): gửi email xml_support@jooble.com kèm URL feed
-- production. Điều cấm 1 giữ nguyên (người bấm gửi email), xem docs/runbooks/jooble-bootstrap.md.

alter table public.hr_jobs
  add column if not exists slug             text,
  add column if not exists salary_display   text,
  add column if not exists employment_type  text default 'full-time',
  add column if not exists published_at     timestamptz,
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists expire_at        timestamptz;

comment on column public.hr_jobs.slug
  is 'Khóa URL cho /tuyen-dung/[slug], duy nhất. Backend sinh từ title + id ngắn khi tạo/đổi tin.';
comment on column public.hr_jobs.salary_display
  is 'Lương hiển thị (text tự do), ví dụ "12-18 triệu" hoặc "Thỏa thuận". Rỗng thì feed bỏ tag <salary>.';
comment on column public.hr_jobs.employment_type
  is 'full-time | part-time | contract | internship | temporary. Vào tag <jobtype> của feed Jooble.';
comment on column public.hr_jobs.published_at
  is 'Lần đầu tin chuyển draft->open. Vào tag <pubdate> DD.MM.YYYY.';
comment on column public.hr_jobs.updated_at
  is 'Backend set mỗi lần sửa tin. Vào tag <updated> DD.MM.YYYY.';
comment on column public.hr_jobs.expire_at
  is 'Hạn tin. Mặc định = published_at + 45 ngày (khớp giới hạn crawl của Jooble). Tin quá hạn bị loại khỏi feed.';

-- Slug unique nhưng cho phép null tạm (tin draft chưa mở chưa cần slug).
create unique index if not exists hr_jobs_slug_uidx
  on public.hr_jobs (slug) where slug is not null;

-- Index phục vụ truy vấn feed: WHERE status='open' AND expire_at > now().
create index if not exists hr_jobs_feed_idx
  on public.hr_jobs (status, expire_at)
  where status = 'open';

-- Backfill slug cho tin cũ: dùng full UUID hex (không dấu gạch) để bảo đảm KHÔNG TRÙNG,
-- vì unique index dưới sẽ fail migration nếu 2 hàng cùng slug. Tin mới do backend sinh slug đẹp.
update public.hr_jobs
   set slug = 'tin-' || replace(id::text, '-', '')
 where slug is null;

-- Backfill published_at cho tin đã mở/đóng: lấy created_at làm mốc.
update public.hr_jobs
   set published_at = created_at
 where published_at is null and status in ('open','closed');

-- Backfill expire_at cho mọi tin cũ: created_at + 45 ngày. Tin nào đã quá 45 ngày
-- sẽ tự động không xuất hiện trong feed (đúng ý muốn).
update public.hr_jobs
   set expire_at = created_at + interval '45 days'
 where expire_at is null;
