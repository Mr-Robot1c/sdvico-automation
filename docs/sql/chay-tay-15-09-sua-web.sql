-- SQL CHẠY TAY ở Supabase SQL Editor (project lluuoygdlaadtjsbnxbk) — 15/9 sửa web. Dán cả file, bấm Run. Chạy lại không sao (if not exists).

-- 20260915120000_mkt_leads_forwarded.sql
-- 15/9 (Thanh, kế hoạch "SDVICO sửa web"): trang Khách hàng làm lại thành MỘT luồng chặt
-- (Mới -> Đã liên hệ -> Đã mua / Không chốt). Nút "Chuyển NV" trước đây chỉ copy nội dung + mở
-- Zalo, không để lại dấu vết nên sếp không biết lead đã chuyển cho ai. Thêm 2 cột ghi lại.
alter table public.mkt_leads add column if not exists forwarded_to text;
alter table public.mkt_leads add column if not exists forwarded_at timestamptz;

-- 20260915130000_brand_assets_description.sql
-- 15/9 (sếp, qua kế hoạch "SDVICO sửa web" của Thanh): "kịch bản nói máy hư hỏng, nước đục mà lại
-- lấy hình máy sản phẩm mới bóng thì sao mà bán? Kịch bản phải đi đôi với đúng video."
-- Gốc: brand_assets chỉ có `title` 8-12 chữ, model chọn cảnh mù. Thêm cột MÔ TẢ nội dung tư liệu
-- (AI viết lúc up kho hoặc script mo-ta-tu-lieu.mjs bổ sung): thấy gì, tình trạng mới/cũ/hư/bẩn,
-- bối cảnh, hợp cảnh nào (vấn đề / giải pháp / đời sống). Dây chuyền video đọc cột này để khớp cảnh.
alter table public.brand_assets add column if not exists description text;
alter table public.brand_assets add column if not exists described_at timestamptz;

comment on column public.brand_assets.description is
  'Mo ta noi dung tu lieu do AI/nguoi viet: canh gi, tinh trang, boi canh, hop canh nao. Day chuyen video dung de khop kich ban voi hinh.';
