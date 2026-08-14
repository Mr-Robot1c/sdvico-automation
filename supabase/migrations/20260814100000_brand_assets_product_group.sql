-- 20260814100000_brand_assets_product_group.sql
-- Thêm cột product_group cho brand_assets: nhóm tư liệu theo folder sản phẩm (đặt tên STT).
-- Vòng xoay đăng bài hằng ngày chọn 1 folder (sản phẩm), không lặp cho tới hết rồi quay vòng.
-- Nullable: tư liệu chưa gán vẫn hợp lệ (vòng xoay bỏ qua tư liệu chưa gán).
-- Bổ sung, không sửa dữ liệu cũ.

alter table public.brand_assets
  add column if not exists product_group text;

comment on column public.brand_assets.product_group is
  'Nhom folder san pham, vd "5. Dien thoai ve tinh XT-Pro". Null = chua gan.';

create index if not exists brand_assets_product_group_idx
  on public.brand_assets (product_group);
