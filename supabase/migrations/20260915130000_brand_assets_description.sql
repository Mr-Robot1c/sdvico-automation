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
