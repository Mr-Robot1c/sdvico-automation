-- Cột audit: ai bấm cái gì và khi nào.
-- Ghi email người bấm vào các bảng chính. Không hiện email này ra thư gửi ứng viên
-- (thư mời vẫn ký "Phòng Nhân sự SDVICO" như cũ, chờ mộc/chữ ký thật rồi mới cá nhân hóa).
--
-- Ở chế độ AUTH_MODE=basic, các cột này sẽ để trống. Chế độ supabase mới điền được.

alter table public.approval_queue
  add column if not exists decided_by text;   -- email người bấm Duyệt/Từ chối/Xóa

alter table public.hr_applications
  add column if not exists advanced_by text,  -- email người bấm "Đưa vào phỏng vấn"
  add column if not exists interviewed_by text, -- email người bấm "Đã phỏng vấn xong"
  add column if not exists decided_by text;   -- email người bấm Nhận/Không nhận

comment on column public.approval_queue.decided_by
  is 'Email nhân sự bấm Duyệt/Từ chối/Xóa. Null nếu chế độ AUTH_MODE=basic hoặc do worker tự chạy.';
comment on column public.hr_applications.decided_by
  is 'Email nhân sự quyết Nhận hoặc Không nhận ứng viên.';
