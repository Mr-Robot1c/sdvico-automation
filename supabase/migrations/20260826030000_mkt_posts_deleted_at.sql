-- mkt_posts.deleted_at: soft-delete cho các row bài đã bị xoá TAY trên nền tảng (user vào app
-- TikTok/Facebook xoá video/bài). Bot không có cách nào biết được nên phải để user tự đánh
-- dấu. Ban đầu ra đời cho TikTok: user 26/8 xoá 3/5 video trên app TikTok, tile "Video đã
-- đăng" ở Tổng quan vẫn hiện 5 → sai. Đặt deleted_at = now() cho 3 row đó → tile hiện 2.
-- NULL = còn live trên nền tảng. NOT NULL = user đã đánh dấu xoá (có thể undo bấm ↺).
-- Query tile Tổng quan (tong-quan-section) filter .is('deleted_at', null) để đếm đúng.
-- Bang-section (Bảng bài viết) KHÔNG filter — vẫn hiển thị để user có thể undo.
alter table public.mkt_posts
  add column if not exists deleted_at timestamptz;

comment on column public.mkt_posts.deleted_at is
  'Soft-delete row do user tự đánh dấu bài đã bị xoá tay trên nền tảng (VD: xoá video TikTok trong app). NULL = còn live.';

-- Reload PostgREST schema cache để Supabase client thấy cột mới ngay.
notify pgrst, 'reload schema';
