-- 20260810090000_init.sql
-- Lược đồ khởi tạo hệ thống tự động hóa Tuyển dụng và Marketing của SDVICO.
-- Mười bảng tối thiểu theo kế hoạch. RLS đặt ở migration kế tiếp.

create extension if not exists pgcrypto;

-- approval_queue: hàng đợi duyệt. Điều cấm 1 và 2: máy soạn, người bấm.
create table if not exists public.approval_queue (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                        -- hr_email, mkt_post, mkt_publish, browser_action
  ref_table   text,
  ref_id      uuid,
  title       text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by  uuid,
  decided_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);

-- run_log: nhật ký mọi thao tác tự động, kèm ảnh chụp khi lỗi.
create table if not exists public.run_log (
  id              uuid primary key default gen_random_uuid(),
  task            text not null,
  actor           text,                             -- command hoặc skill nào chạy
  status          text not null default 'ok' check (status in ('ok','error','skipped')),
  detail          jsonb not null default '{}'::jsonb,
  screenshot_path text,                             -- đường dẫn Storage khi lỗi
  cost_vnd        numeric(12,0) not null default 0,
  created_at      timestamptz not null default now()
);

-- brand_assets: tư liệu. Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép.
create table if not exists public.brand_assets (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('image','video','clip','logo','audio','doc')),
  title        text not null,
  storage_path text not null,
  license      text not null default 'owned' check (license in ('owned','licensed')),
  license_note text,
  source       text,
  created_at   timestamptz not null default now()
);

-- hr_jobs: vị trí tuyển dụng.
create table if not exists public.hr_jobs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  department   text,
  location     text,
  short_desc   text,
  requirements text,
  jd_versions  jsonb not null default '{}'::jsonb,  -- bốn phiên bản theo kênh
  status       text not null default 'draft' check (status in ('draft','open','closed')),
  created_by   uuid,
  created_at   timestamptz not null default now()
);

-- hr_candidates: ứng viên. DỮ LIỆU CÁ NHÂN. Bật RLS.
create table if not exists public.hr_candidates (
  id               uuid primary key default gen_random_uuid(),
  full_name        text,
  email            text,
  phone            text,
  source           text,
  cv_storage_path  text,
  cv_json          jsonb,
  dedup_key        text,                            -- chuẩn hóa email và phone để khử trùng
  consent_at       timestamptz,                     -- Nghị định 13/2023
  retention_until  date,
  created_at       timestamptz not null default now()
);
create index if not exists hr_candidates_dedup_idx on public.hr_candidates (dedup_key);

-- hr_applications: hồ sơ ứng tuyển và kết quả chấm. DỮ LIỆU CÁ NHÂN qua liên kết. Bật RLS.
create table if not exists public.hr_applications (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.hr_candidates(id) on delete cascade,
  job_id         uuid references public.hr_jobs(id) on delete set null,
  stage          text not null default 'new' check (stage in ('new','screening','review','interview','offer','rejected','pool')),
  score_json     jsonb,                             -- điểm từng trục
  summary        text,
  strengths      jsonb,
  clarifications jsonb,
  screened_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists hr_applications_candidate_idx on public.hr_applications (candidate_id);
create index if not exists hr_applications_job_idx on public.hr_applications (job_id);

-- mkt_keywords: kho từ khóa.
create table if not exists public.mkt_keywords (
  id          uuid primary key default gen_random_uuid(),
  keyword     text not null,
  intent      text check (intent in ('thong_tin','thuong_mai','dieu_huong','giao_dich')),
  landing_url text,
  source      text,
  priority    int not null default 0,
  created_at  timestamptz not null default now()
);

-- mkt_content: nội dung. needs_gov_review cho nội dung chạm quy định nhà nước và IUU (điều cấm 3).
create table if not exists public.mkt_content (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('article','social','video')),
  title            text,
  brief            jsonb,
  draft            text,
  status           text not null default 'draft' check (status in ('draft','review','approved','published')),
  needs_gov_review boolean not null default false,
  approved_by      uuid,
  approved_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- mkt_posts: bài đăng và lịch đăng.
create table if not exists public.mkt_posts (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid references public.mkt_content(id) on delete set null,
  channel      text not null check (channel in ('website','facebook','youtube')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_url text,
  status       text not null default 'scheduled' check (status in ('scheduled','published','failed','held')),
  created_at   timestamptz not null default now()
);

-- mkt_metrics: số liệu đo lường kéo về từ các nguồn.
create table if not exists public.mkt_metrics (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('gsc','ga4','facebook','youtube')),
  entity_ref  text,
  metric_date date not null,
  metrics     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
