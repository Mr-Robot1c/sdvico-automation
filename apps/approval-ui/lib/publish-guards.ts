// Cổng chung cho các route cron đăng bài (P1-7, P1-8):
//   - checkAndIncrementDailyQuota: đọc + tăng bộ đếm ngày, chặn khi chạm trần.
//   - createDeadLetterAlert: đẩy 1 mục vào approval_queue (kind='alert') khi một bản ghi
//     đã fail đủ MAX_ATTEMPTS lần — người vận hành thấy trong UI để xử lý tay.
//   - pauseBetweenPosts: giãn cách giữa các lần POST (giảm risk bị Facebook/LinkedIn gắn spam).

import type { getServerClient } from './supabase-server';

type DbClient = ReturnType<typeof getServerClient>;

export const PAUSE_BETWEEN_POSTS_MS = Number(process.env.HR_PAUSE_BETWEEN_POSTS_MS) || 3000;

export function pauseBetweenPosts(): Promise<void> {
  return new Promise((r) => setTimeout(r, PAUSE_BETWEEN_POSTS_MS));
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Đọc + tăng bộ đếm trong daily_counters. Trả allowed=false khi đã chạm trần cho ngày đó.
// Chưa dùng khóa nguyên tử (v1 giống packages/core/src/quota.js); risk trùng đếm rất nhỏ với
// cadence 15 phút và 1 process cron. P2 sẽ nâng thành select ... for update.
export async function checkAndIncrementDailyQuota(
  client: DbClient,
  { account, kind, limit }: { account: string; kind: string; limit: number }
): Promise<{ allowed: boolean; count: number }> {
  const day = todayVN();
  const { data } = await client
    .from('daily_counters')
    .select('count')
    .eq('account', account)
    .eq('kind', kind)
    .eq('day', day)
    .maybeSingle();
  const current = data?.count ?? 0;
  if (current >= limit) return { allowed: false, count: current };
  const next = current + 1;
  await client
    .from('daily_counters')
    .upsert({ account, kind, day, count: next }, { onConflict: 'account,kind,day' });
  return { allowed: true, count: next };
}

// Đẩy dead-letter alert vào approval_queue. Idempotent theo ref_table+ref_id: chỉ tạo 1 alert
// cho mỗi bản ghi, tránh spam khi cron cứ 15 phút lại chạy.
export async function createDeadLetterAlert(
  client: DbClient,
  args: { refTable: string; refId: string; task: string; attempts: number; error: string; extra?: Record<string, unknown> }
): Promise<void> {
  const { data: existing } = await client
    .from('approval_queue')
    .select('id')
    .eq('kind', 'alert')
    .eq('ref_table', args.refTable)
    .eq('ref_id', args.refId)
    .maybeSingle();
  if (existing) return;
  await client.from('approval_queue').insert({
    kind: 'alert',
    title: `Thất bại ${args.attempts} lần: ${args.task}`,
    payload: {
      task: args.task,
      attempts: args.attempts,
      error: args.error.slice(0, 500),
      ...(args.extra || {}),
    },
    ref_table: args.refTable,
    ref_id: args.refId,
    status: 'pending',
  });
}
