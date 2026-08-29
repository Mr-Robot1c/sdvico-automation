-- Audit bảo mật 29/8, mục 12: guard đếm không nguyên tử.
-- reservePostQuota (apps/approval-ui/lib/safety.ts) và incrementDailyCounter
-- (packages/core/src/quota.js) đều đọc count rồi ghi count+1: hai tiến trình chạy cùng lúc
-- cùng đọc số cũ nên cùng lọt qua trần — đăng vượt hạn mức ngày, rotate sinh bài trùng.
-- Hàm này gộp kiểm trần + tăng vào MỘT câu lệnh (upsert có điều kiện, Postgres khóa hàng
-- khi update) — cả hai phía gọi chung, điểm thực thi hạn mức chỉ còn một chỗ (audit mục 14).
--
-- Cách dán: Supabase Dashboard -> SQL Editor -> dán nguyên file -> Run.
-- Code có fallback lối cũ khi hàm chưa tồn tại nên dán trễ không làm đứt luồng đăng,
-- nhưng race chỉ hết khi hàm đã nằm trong database.

create or replace function public.reserve_daily_quota(
  p_account text,
  p_kind    text,
  p_day     date,
  p_limit   int
) returns table(allowed boolean, new_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Trần 0 hoặc âm nghĩa là không được giữ chỗ nào hết.
  if p_limit is null or p_limit <= 0 then
    select dc.count into v_count from public.daily_counters dc
     where dc.account = p_account and dc.kind = p_kind and dc.day = p_day;
    return query select false, coalesce(v_count, 0);
    return;
  end if;

  insert into public.daily_counters as dc (account, kind, day, count)
  values (p_account, p_kind, p_day, 1)
  on conflict (account, kind, day) do update
    set count = dc.count + 1
    where dc.count < p_limit
  returning dc.count into v_count;

  -- v_count null = hàng đã tồn tại nhưng WHERE chặn (đã chạm trần) -> không tăng, trả false.
  if v_count is null then
    select dc.count into v_count from public.daily_counters dc
     where dc.account = p_account and dc.kind = p_kind and dc.day = p_day;
    return query select false, coalesce(v_count, 0);
    return;
  end if;

  return query select true, v_count;
end;
$$;

-- Chỉ backend (service role) được gọi. Không mở cho anon/authenticated qua PostgREST:
-- người ngoài gọi được là bơm đầy bộ đếm, chặn oan lượt đăng thật.
revoke execute on function public.reserve_daily_quota(text, text, date, int) from public;
revoke execute on function public.reserve_daily_quota(text, text, date, int) from anon;
revoke execute on function public.reserve_daily_quota(text, text, date, int) from authenticated;
grant execute on function public.reserve_daily_quota(text, text, date, int) to service_role;
