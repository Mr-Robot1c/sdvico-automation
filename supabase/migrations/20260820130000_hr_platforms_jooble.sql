-- 20260820130000_hr_platforms_jooble.sql
-- Đăng ký kênh Jooble vào hr_platforms để hiện ở trang /kenh.
-- Method 'feed': Jooble crawl XML feed tổng tại /api/jobs/feed.xml,
-- không đăng per-post. Bật sẵn = true vì luồng không cần credentials.
-- Bootstrap 1 lần: gửi email xml_support@jooble.com kèm URL feed
-- (xem docs/runbooks/jooble-bootstrap.md).
--
-- Không đụng constraint hr_job_posts.kenh vì jooble KHÔNG đi qua bảng đó.

insert into public.hr_platforms (ten, loai, bat, kenh, ghi_chu)
select 'Jooble', 'job_board', true, 'jooble',
       'Tự động qua XML feed /api/jobs/feed.xml. Bootstrap 1 lần qua xml_support@jooble.com.'
where not exists (select 1 from public.hr_platforms p where p.kenh = 'jooble');
