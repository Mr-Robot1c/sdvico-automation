-- 20260818120000_kho_tri_thuc.sql
-- Kho tri thức cho Kế hoạch AI v2: hai nguồn tri thức để bot sinh kế hoạch tuần.
-- Nguồn nội bộ: file người phụ trách thả vào bucket kho-tri-thuc-noi-bo (đã trích xuất từ Zalo).
-- Nguồn public: bot tự tìm mỗi Chủ nhật từ tri thức ngành cá/thủy sản trên web.
-- Cả hai bảng CHỈ là NGUYÊN LIỆU định hướng cho bot Kế hoạch. KHÔNG tự đăng bài, KHÔNG đẩy hàng chờ.
-- Chi tiết nghiệp vụ: docs/app-map/ke-hoach-ai-v2-ba-spec.md.

-- Tri thức nội bộ: sinh từ file trong bucket kho-tri-thuc-noi-bo.
-- source_path = đường dẫn tệp gốc trong bucket, dùng để idempotent (import lại không tạo bản trùng).
create table if not exists public.mkt_knowledge_internal (
  id             uuid primary key default gen_random_uuid(),
  source_path    text not null unique,
  title          text,
  summary        text,
  raw_excerpt    text,
  needs_gov_review boolean not null default false,
  imported_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists mkt_knowledge_internal_created_idx
  on public.mkt_knowledge_internal (created_at desc);

comment on table public.mkt_knowledge_internal is
  'Tri thuc noi bo: file da trich xuat tu Zalo (hoac nguon khac cua cong ty), tha vao bucket kho-tri-thuc-noi-bo, he thong doc va tom tat. Chi la nguyen lieu cho Ke hoach AI, khong tu tao bai.';

-- Tri thức public: bot Kế hoạch AI tự tìm mỗi Chủ nhật.
-- source_url = đường dẫn nguồn thật, bắt buộc khác rỗng (rule R2 trong ba-spec).
create table if not exists public.mkt_knowledge_public (
  id             uuid primary key default gen_random_uuid(),
  source_url     text not null,
  source_title   text,
  summary        text not null,
  needs_gov_review boolean not null default false,
  learned_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint mkt_knowledge_public_url_not_empty check (char_length(source_url) > 0)
);

create index if not exists mkt_knowledge_public_created_idx
  on public.mkt_knowledge_public (created_at desc);
create index if not exists mkt_knowledge_public_source_url_idx
  on public.mkt_knowledge_public (source_url);

comment on table public.mkt_knowledge_public is
  'Tri thuc public: bot Ke hoach AI tu tim moi CN tren web ve nganh ca/thuy san. Moi ban ghi co URL nguon that. Chi la nguyen lieu cho Ke hoach AI, khong tu tao bai.';

-- RLS: giống các bảng mkt khác. Backend dùng service role tự bỏ qua RLS.
alter table public.mkt_knowledge_internal enable row level security;
alter table public.mkt_knowledge_public   enable row level security;

do $$
begin
  drop policy if exists mkt_knowledge_internal_staff_all on public.mkt_knowledge_internal;
  create policy mkt_knowledge_internal_staff_all on public.mkt_knowledge_internal
    for all to authenticated using (true) with check (true);

  drop policy if exists mkt_knowledge_public_staff_all on public.mkt_knowledge_public;
  create policy mkt_knowledge_public_staff_all on public.mkt_knowledge_public
    for all to authenticated using (true) with check (true);
end $$;

-- Bucket Storage cho file tri thức nội bộ (Cowork xuất Zalo → người phụ trách thả vào đây).
-- Private (public=false) để không lộ nội dung nội bộ ra ngoài (điều cấm 6: dữ liệu công ty không ra ngoài hạ tầng).
-- RLS trên storage.objects: chỉ authenticated + service_role đọc/ghi bucket này.
insert into storage.buckets (id, name, public)
values ('kho-tri-thuc-noi-bo', 'kho-tri-thuc-noi-bo', false)
on conflict (id) do nothing;

do $$
begin
  drop policy if exists kho_tri_thuc_read on storage.objects;
  create policy kho_tri_thuc_read on storage.objects
    for select to authenticated
    using (bucket_id = 'kho-tri-thuc-noi-bo');

  drop policy if exists kho_tri_thuc_write on storage.objects;
  create policy kho_tri_thuc_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'kho-tri-thuc-noi-bo');

  drop policy if exists kho_tri_thuc_update on storage.objects;
  create policy kho_tri_thuc_update on storage.objects
    for update to authenticated
    using (bucket_id = 'kho-tri-thuc-noi-bo');

  drop policy if exists kho_tri_thuc_delete on storage.objects;
  create policy kho_tri_thuc_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'kho-tri-thuc-noi-bo');
end $$;
