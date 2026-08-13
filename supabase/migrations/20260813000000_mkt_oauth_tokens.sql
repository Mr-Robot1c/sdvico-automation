-- 20260813000000_mkt_oauth_tokens.sql
-- Lưu token OAuth cho các nền tảng cần refresh (TikTok...). Token TikTok hết hạn sau 24h nên
-- KHÔNG để trong biến môi trường như token Facebook được, phải lưu DB để tự làm mới.
-- Bổ sung, không sửa bảng cũ. Điều cấm 7: token là bí mật.

create table if not exists public.mkt_oauth_tokens (
  provider           text primary key,          -- 'tiktok'
  access_token       text,
  refresh_token      text,
  open_id            text,                       -- id tài khoản TikTok đã cấp quyền
  scope              text,
  expires_at         timestamptz,               -- access_token hết hạn (thường +24h)
  refresh_expires_at timestamptz,               -- refresh_token hết hạn (thường +365 ngày)
  meta               jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

-- Bật RLS và KHÔNG tạo policy nào: chỉ service_role (backend) đọc/ghi được (service_role tự bỏ
-- qua RLS). Token không bao giờ lộ ra giao diện hay vai trò authenticated.
alter table public.mkt_oauth_tokens enable row level security;
