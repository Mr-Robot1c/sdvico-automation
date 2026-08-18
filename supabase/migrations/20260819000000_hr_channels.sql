-- 20260819000000_hr_channels.sql
-- Lớp kênh đăng tuyển đa nền tảng: mở kênh cho các sàn tuyển dụng Việt Nam
-- (TopCV, VietnamWorks, CareerBuilder, ITviec, Vieclam24h) + cột theo dõi đăng tay.
-- Bổ sung, không sửa dữ liệu cũ. Chạy trong Supabase SQL editor.
--
-- Nền: các sàn trên KHÔNG mở API đăng tin cho nhà tuyển dụng nên đăng thủ công.
-- Máy soạn (hoặc người tự đăng), người bấm ghi nhận — vẫn theo bảy điều cấm.

-- 1. Nới CHECK kenh cho hr_job_posts. Giữ nguyên các giá trị cũ, thêm 5 sàn VN.
--    (Theo pattern migration 20260814150000_hr_job_posts_kenh_linkedin.sql)
alter table public.hr_job_posts drop constraint if exists hr_job_posts_kenh_check;
alter table public.hr_job_posts
  add constraint hr_job_posts_kenh_check
  check (kenh in (
    'facebook','linkedin','zalo','job_board','website','other',
    'topcv','vietnamworks','careerbuilder','itviec','vieclam24h'
  ));

-- 2. Cột theo dõi đăng thủ công.
--    posted_by kiểu text (email) cho khớp cột audit decided_by (20260815010000_audit_columns.sql).
alter table public.hr_job_posts
  add column if not exists posted_by  text,   -- email người bấm "đã đăng"/"ghi nhận đã đăng"
  add column if not exists proof_path text;    -- ảnh chụp bài đã đăng (bucket post-images, prefix proof/)

comment on column public.hr_job_posts.posted_by
  is 'Email nhân sự bấm Đánh dấu đã đăng hoặc Ghi nhận đã đăng. Null nếu do worker API tự đăng.';
comment on column public.hr_job_posts.proof_path
  is 'Đường dẫn ảnh bằng chứng bài đã đăng (Storage post-images/proof/...). Null nếu không tải.';

-- 3. hr_platforms: thêm khóa kenh để đối chiếu với registry code + danh sách bật/tắt trên web.
alter table public.hr_platforms
  add column if not exists kenh text;

-- Mỗi kenh chỉ một dòng nền tảng. Partial unique để dòng cũ (kenh null) không vướng.
create unique index if not exists hr_platforms_kenh_uidx
  on public.hr_platforms (kenh) where kenh is not null;

-- Seed đủ các kênh để trang Kênh liệt kê và cho bật/tắt.
-- Facebook/LinkedIn bật sẵn (đã có đường đăng); 5 sàn VN tắt sẵn, bật khi sẵn sàng vận hành.
-- Dùng WHERE NOT EXISTS thay ON CONFLICT: index kenh là partial (where kenh is not null)
-- nên arbiter của ON CONFLICT không suy ra được. Cách này idempotent, chạy lại vẫn an toàn.
insert into public.hr_platforms (ten, loai, bat, kenh, ghi_chu)
select v.ten, v.loai, v.bat, v.kenh, v.ghi_chu
from (values
  ('Facebook',      'social',    true,  'facebook',     'Đăng tự động qua Graph API.'),
  ('LinkedIn',      'social',    true,  'linkedin',     'Đăng qua LinkedIn API khi đã nối; chưa nối thì đăng tay.'),
  ('TopCV',         'job_board', false, 'topcv',        'Không có API đăng tin — đăng thủ công.'),
  ('VietnamWorks',  'job_board', false, 'vietnamworks', 'Không có API đăng tin — đăng thủ công.'),
  ('CareerBuilder', 'job_board', false, 'careerbuilder','Không có API đăng tin — đăng thủ công.'),
  ('ITviec',        'job_board', false, 'itviec',       'Không có API đăng tin — đăng thủ công.'),
  ('Vieclam24h',    'job_board', false, 'vieclam24h',   'Không có API đăng tin — đăng thủ công.')
) as v(ten, loai, bat, kenh, ghi_chu)
where not exists (select 1 from public.hr_platforms p where p.kenh = v.kenh);
