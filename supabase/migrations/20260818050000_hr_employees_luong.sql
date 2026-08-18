-- Thêm lương cho nhân viên: số tiền (VND) kèm một ô chú thích tự do.
-- luong lưu số nguyên đồng để sắp xếp và xuất Excel tính toán được; luong_ghi_chu cho các
-- trường hợp cần ghi thêm (chưa gồm hoa hồng, thỏa thuận thêm, xét lại sau thử việc...).
-- Nhạy cảm như BHXH/CCCD — vẫn nằm trong hr_employees (RLS chặn hết, chỉ service role + admin).

alter table public.hr_employees
  add column if not exists luong bigint,
  add column if not exists luong_ghi_chu text;

comment on column public.hr_employees.luong is 'Lương theo tháng, đơn vị đồng (VND). Null nếu chưa nhập.';
comment on column public.hr_employees.luong_ghi_chu is 'Chú thích cho lương, ví dụ: chưa gồm hoa hồng, thỏa thuận thêm.';
