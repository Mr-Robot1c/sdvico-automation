-- product_facts: nguồn sự thật về thông số sản phẩm cho nội dung Marketing.
-- Phòng Kinh doanh nhập số thật ở đây (verified=true). Nội dung chỉ được nêu thông số
-- có trong bảng này; dòng verified=false là dữ liệu test, bài dùng sẽ bị gắn cảnh báo.
create table if not exists public.product_facts (
  id           uuid primary key default gen_random_uuid(),
  category     text,                          -- nhóm thiết bị, ví dụ giam_sat_hanh_trinh
  brand        text,                          -- hãng
  model        text,                          -- model chính xác
  attribute    text not null,                 -- tên thông số, ví dụ khang_nuoc, cong_suat
  value        text not null,                 -- giá trị, ví dụ IP67, 40 L/h
  source       text,                          -- nguồn tài liệu
  confirmed_by text,                          -- người xác nhận ở Phòng Kinh doanh
  confirmed_at date,                          -- ngày xác nhận
  verified     boolean not null default false,-- true là số thật đã xác nhận
  created_at   timestamptz not null default now()
);
create index if not exists idx_product_facts_verified on public.product_facts (verified);
