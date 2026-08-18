-- Trạng thái bảo hiểm (BHXH) của nhân viên: đang đóng, chưa đóng, hoặc đã ngừng.
-- Mặc định 'chua_dong' cho cả nhân viên đã có. Nhạy cảm như các trường khác trong hr_employees
-- (RLS chặn hết, chỉ service role + admin qua Server Action).

alter table public.hr_employees
  add column if not exists bao_hiem text not null default 'chua_dong'
  check (bao_hiem in ('dang_dong', 'chua_dong', 'da_ngung'));

comment on column public.hr_employees.bao_hiem is 'Trạng thái BHXH: dang_dong (đang đóng), chua_dong (chưa đóng), da_ngung (đã ngừng).';
