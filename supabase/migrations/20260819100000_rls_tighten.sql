-- 20260819100000_rls_tighten.sql
-- Siết RLS trên các bảng có dữ liệu cá nhân và bảng vận hành.
-- Trước đây policy dùng `to authenticated using (true) with check (true)`:
-- bất kỳ ai lấy được một phiên authenticated (tự đăng ký OTP nếu Supabase mở public
-- signup) đều có thể gọi thẳng PostgREST đọc hr_candidates.
-- Nay chỉ email nằm trong hr_users (chưa disabled) mới được thao tác qua tầng RLS.
-- service_role vẫn tự bỏ qua RLS (backend, GitHub Actions, script).

create or replace function public.is_hr_user() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.hr_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and disabled_at is null
  );
$$;

-- Cho phép mọi role gọi hàm này để đọc điều kiện.
grant execute on function public.is_hr_user() to authenticated, anon;

-- Danh sách bảng cần siết. hr_users tự có chính sách riêng (không đưa vào đây).
do $$
declare
  t text;
  tables text[] := array[
    'approval_queue','run_log','brand_assets','hr_jobs','hr_candidates',
    'hr_applications','mkt_keywords','mkt_content','mkt_posts','mkt_metrics'
  ];
begin
  foreach t in array tables loop
    -- Bỏ policy cũ `using(true)`.
    execute format('drop policy if exists %I on public.%I;', t || '_staff_all', t);
    -- Thay bằng policy chỉ cho phép người nằm trong hr_users.
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_hr_user()) with check (public.is_hr_user());',
      t || '_staff_all', t
    );
  end loop;
end $$;
