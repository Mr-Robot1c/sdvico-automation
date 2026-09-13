-- 13/9/2026: trang /agent doc lan chay cuoi cua tung AI bang truy van run_log theo task + created_at;
-- run_log ~8.000 dong khong co index nen truy van lanh mat 5-6 giay, bi cat -> UI bao 'chua chay' oan.
create index if not exists run_log_task_created_idx on public.run_log (task, created_at desc);
