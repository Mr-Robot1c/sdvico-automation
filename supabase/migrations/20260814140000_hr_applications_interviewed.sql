-- Mốc "đã phỏng vấn xong": chỉ khi có mốc này mới hiện nút Nhận/Không nhận.
-- Tách bước phỏng vấn (đã mời) với bước quyết định (đã phỏng vấn xong).
alter table if exists public.hr_applications
  add column if not exists interviewed_at timestamptz;
