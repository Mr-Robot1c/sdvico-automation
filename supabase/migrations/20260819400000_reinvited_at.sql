-- 20260819400000_reinvited_at.sql
-- Đánh dấu application đã được mời lại (auto qua cron reinvite-scan hoặc tay qua reinviteForJob).
-- Dùng để chọn template thư mời phù hợp: khi mời lại, thư phải nhắc "hồ sơ đã ứng tuyển
-- trước đây, phù hợp với vị trí X hiện đang tuyển" thay vì template chào lần đầu.
-- Giữ nguyên timestamp làm dấu vết; không clear sau khi soạn thư.

alter table public.hr_applications
  add column if not exists reinvited_at timestamptz;
