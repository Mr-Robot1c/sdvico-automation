-- 20260819300000_proposed_slot.sql
-- Cho ứng viên đề xuất giờ khác khi 3 khung đã đề xuất không phù hợp.
-- Trước đây trang /phong-van/[token] chỉ có 3 nút chọn 1 trong 3 → ứng viên bị mắc kẹt.
-- Nay có ô "Đề xuất giờ khác" lưu vào 2 cột dưới; /lich hiển thị cho Phòng Nhân sự liên hệ lại.

alter table public.hr_applications
  add column if not exists proposed_slot text;

alter table public.hr_applications
  add column if not exists proposed_note text;

alter table public.hr_applications
  add column if not exists proposed_at timestamptz;
