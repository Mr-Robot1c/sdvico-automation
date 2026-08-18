-- Cổng cấu hình "tìm CV chủ động" (TopCV và tương tự). TẮT MẶC ĐỊNH.
--
-- CHƯA XÁC ĐỊNH các trang này có official API cho nhà tuyển dụng hay không — không tự bịa,
-- không viết scraper vượt rào. Toàn bộ tính năng chỉ tự động hóa thao tác trong phạm vi tài
-- khoản trả phí đã có của công ty, qua UI chính thức, dùng runBrowserFlow/BarrierError đã có
-- (packages/core/src/browser-runner.js) — gặp rào (CAPTCHA, giới hạn xem...) thì dừng.
--
-- Cột xac_nhan_phap_ly_boi/xac_nhan_luc bắt buộc có giá trị trước khi code cho phép bat=true
-- (kiểm ở packages/hr/src/sourcing-cv/run.mjs và app/actions.ts toggleCvSource, không phải ở
-- DB) — cần Phòng Nhân sự xác nhận công ty có gói dịch vụ hợp lệ và đã rà điều khoản sử dụng
-- trước khi bật, và cần đối chiếu Nghị định 13/2023 vì đây là dữ liệu của người chưa chủ động
-- nộp cho SDVICO.

alter table public.hr_platforms drop constraint if exists hr_platforms_loai_check;
alter table public.hr_platforms add constraint hr_platforms_loai_check
  check (loai in ('job_board','social','other','cv_source'));

create table if not exists public.hr_cv_sources (
  id                     uuid primary key default gen_random_uuid(),
  platform_id            uuid not null references public.hr_platforms(id) on delete cascade,
  gioi_han_ngay          int,           -- số CV tối đa lấy mỗi ngày, tự đặt thấp
  xac_nhan_phap_ly_boi   text,          -- email người xác nhận công ty có quyền dùng nguồn này
  xac_nhan_luc           timestamptz,
  bat                    boolean not null default false,
  created_at             timestamptz not null default now()
);

create unique index if not exists hr_cv_sources_platform_idx on public.hr_cv_sources(platform_id);

alter table public.hr_cv_sources enable row level security;

drop policy if exists hr_cv_sources_staff_all on public.hr_cv_sources;
create policy hr_cv_sources_staff_all on public.hr_cv_sources for all to authenticated using (true) with check (true);
