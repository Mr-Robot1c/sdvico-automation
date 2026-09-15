-- 20260915120000_mkt_leads_forwarded.sql
-- 15/9 (Thanh, kế hoạch "SDVICO sửa web"): trang Khách hàng làm lại thành MỘT luồng chặt
-- (Mới -> Đã liên hệ -> Đã mua / Không chốt). Nút "Chuyển NV" trước đây chỉ copy nội dung + mở
-- Zalo, không để lại dấu vết nên sếp không biết lead đã chuyển cho ai. Thêm 2 cột ghi lại.
alter table public.mkt_leads add column if not exists forwarded_to text;
alter table public.mkt_leads add column if not exists forwarded_at timestamptz;
