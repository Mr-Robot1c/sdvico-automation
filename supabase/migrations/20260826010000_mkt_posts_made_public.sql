-- mkt_posts.made_public_at: thời điểm user đánh dấu bài (đã đăng qua API ở chế độ riêng tư)
-- được đổi công khai bằng tay trên nền tảng. Dùng cho TikTok: app SDVICO không được TikTok
-- audit ("internal company use" — reject 26/8/2026), video buộc đăng SELF_ONLY qua Direct
-- Post API; user phải mở app TikTok đổi Công khai tay. Cột này lưu dấu người đã xử lý xong.
-- NULL = bài còn ở chế độ riêng tư, chưa xử. NOT NULL = đã đánh dấu công khai (có thể kèm
-- URL bài thật ở external_url nếu user paste vào form).
alter table public.mkt_posts
  add column if not exists made_public_at timestamptz;

comment on column public.mkt_posts.made_public_at is
  'Thời điểm user đánh dấu bài (đăng riêng tư qua API) đã được đổi công khai tay trên nền tảng. Dùng cho TikTok chưa audit.';

-- Reload PostgREST schema cache để Supabase client thấy cột mới ngay.
notify pgrst, 'reload schema';
