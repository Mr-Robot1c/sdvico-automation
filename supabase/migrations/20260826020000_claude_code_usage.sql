-- claude_code_usage: log token đã dùng khi user chat với Claude Code (Anthropic Max) — sếp
-- SDVICO muốn thấy "quy đổi ra tiền" so với nếu trả API pricing.
-- Nguồn dữ liệu: script upload-claude-usage.mjs đọc file jsonl ở ~/.claude/projects/*SDVICO*
-- và upsert vào bảng này (dedupe theo message_id). Cron Windows Task 1h/lần.
create table if not exists public.claude_code_usage (
  id                    uuid primary key default gen_random_uuid(),
  message_id            text unique not null,
  session_id            text,
  project               text,
  model                 text not null,
  ts                    timestamptz not null,
  input_tokens          integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens     integer not null default 0,
  output_tokens         integer not null default 0,
  estimated_cost_usd    numeric(12, 6) not null default 0,
  estimated_cost_vnd    integer not null default 0,
  created_at            timestamptz not null default now()
);

create index if not exists claude_code_usage_ts_idx on public.claude_code_usage (ts desc);
create index if not exists claude_code_usage_model_idx on public.claude_code_usage (model);

alter table public.claude_code_usage enable row level security;
drop policy if exists claude_code_usage_staff_all on public.claude_code_usage;
create policy claude_code_usage_staff_all on public.claude_code_usage
  for all to authenticated using (true) with check (true);

comment on table public.claude_code_usage is 'Token đã dùng khi chat với Claude Code (Anthropic Max). Bổ sung run_log mkt.token_usage (Gemini) để sếp thấy CẢ 2 nguồn.';

notify pgrst, 'reload schema';
