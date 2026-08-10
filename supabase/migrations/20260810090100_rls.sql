-- 20260810090100_rls.sql
-- Bật Row Level Security. Điều cấm 6: dữ liệu ứng viên nằm trong hạ tầng công ty.
--
-- Mô hình v1, thô nhưng an toàn:
--   service_role (backend, GitHub Actions, script) tự bỏ qua RLS, không cần chính sách.
--   authenticated (nhân sự đăng nhập ứng dụng duyệt) được thao tác qua chính sách bên dưới.
--   anon (khách chưa đăng nhập) không có chính sách nên không truy cập được, kể cả bảng ứng viên.
-- Ngày làm cứng sẽ siết theo vai trò, ví dụ nhân sự chỉ thấy hr_*, marketing chỉ thấy mkt_*.

-- Bật RLS toàn bộ bảng public. Trọng tâm là hai bảng có dữ liệu cá nhân.
alter table public.approval_queue  enable row level security;
alter table public.run_log         enable row level security;
alter table public.brand_assets    enable row level security;
alter table public.hr_jobs         enable row level security;
alter table public.hr_candidates   enable row level security;   -- DỮ LIỆU CÁ NHÂN
alter table public.hr_applications enable row level security;   -- DỮ LIỆU CÁ NHÂN
alter table public.mkt_keywords    enable row level security;
alter table public.mkt_content     enable row level security;
alter table public.mkt_posts       enable row level security;
alter table public.mkt_metrics     enable row level security;

-- Chính sách v1: chỉ người đăng nhập nội bộ mới đọc và ghi.
do $$
declare
  t text;
  tables text[] := array[
    'approval_queue','run_log','brand_assets','hr_jobs','hr_candidates',
    'hr_applications','mkt_keywords','mkt_content','mkt_posts','mkt_metrics'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I;', t || '_staff_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_staff_all', t
    );
  end loop;
end $$;
