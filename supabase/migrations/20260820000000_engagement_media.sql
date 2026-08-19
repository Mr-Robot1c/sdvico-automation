-- 20260820000000_engagement_media.sql
-- Bổ trợ bài tương tác:
--   1) hr_job_posts.video_url: link video đính kèm (song song image_url).
--      publish-facebook.mjs ưu tiên video > image > text.
--   2) brand_assets mở rộng để dùng làm THƯ VIỆN MEDIA cho tab /tuong-tac:
--      deleted_at (soft delete để không mất lịch sử), mime, size_bytes,
--      public_url (để list nhanh không cần re-sign; bucket dùng chung 'post-images' đã public).
-- Không sửa dữ liệu cũ. Chạy trong Supabase SQL editor.

-- Bài đăng: hỗ trợ video song song ảnh.
alter table public.hr_job_posts
  add column if not exists video_url text;

-- Thư viện media dùng chung: mở rộng brand_assets.
alter table public.brand_assets
  add column if not exists deleted_at timestamptz;

alter table public.brand_assets
  add column if not exists mime text;

alter table public.brand_assets
  add column if not exists size_bytes bigint;

alter table public.brand_assets
  add column if not exists public_url text;

-- Lọc nhanh media chưa xóa theo kind trên trang thư viện.
create index if not exists brand_assets_kind_active_idx
  on public.brand_assets (kind)
  where deleted_at is null;
