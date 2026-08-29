-- 20260829150000_rls_tighten_hr.sql
-- Audit bảo mật 29/8, mục 8: 20260810090100_rls.sql tạo policy
-- "for all to authenticated using (true)" cho MỌI bảng, gồm cả hai bảng dữ liệu cá nhân
-- hr_candidates và hr_applications. Hệ thống hiện KHÔNG dùng Supabase Auth (mọi truy cập
-- đi bằng service_role, vốn tự bỏ qua RLS) nên policy này không ai xài — nhưng ngày nào
-- bật Auth cho role authenticated là mọi người đăng nhập đọc được hồ sơ ứng viên,
-- thủng điều cấm 6. Bỏ policy ở hai bảng hồ sơ: chỉ service_role đụng được như thiết kế.
-- Các bảng còn lại giữ nguyên (dữ liệu marketing, không phải dữ liệu cá nhân).

drop policy if exists hr_candidates_staff_all on public.hr_candidates;
drop policy if exists hr_applications_staff_all on public.hr_applications;
