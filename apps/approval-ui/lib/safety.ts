import { getServerClient } from './supabase-server';

// Cổng an toàn cho luồng đăng (Phần 5.4 + Nguyên lý 5 của kế hoạch): công tắc dừng khẩn +
// hạn mức đăng ngày. Dùng bảng app_config (emergency_stop) và daily_counters. Backend dùng
// service role nên bỏ qua RLS.
type Client = ReturnType<typeof getServerClient>;

// --- Công tắc dừng khẩn ---
export async function isEmergencyStopped(client: Client): Promise<boolean> {
  const { data } = await client.from('app_config').select('value').eq('key', 'emergency_stop').maybeSingle();
  return Boolean(data && (data as any).value === true);
}

export async function setEmergencyStop(client: Client, stopped: boolean): Promise<void> {
  await client
    .from('app_config')
    .upsert({ key: 'emergency_stop', value: stopped, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// --- Hạn mức đăng ngày (mỗi kênh) ---
// Ngày theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD.
export function todayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function getPostCount(client: Client, account: string, day: string = todayVN()): Promise<number> {
  const { data } = await client
    .from('daily_counters')
    .select('count')
    .eq('account', account)
    .eq('kind', 'post')
    .eq('day', day)
    .maybeSingle();
  return data ? ((data as any).count as number) : 0;
}

// Giữ chỗ 1 lượt đăng: tăng bộ đếm nếu chưa chạm trần. allowed=false nghĩa là đã hết hạn mức ngày.
export async function reservePostQuota(
  client: Client,
  account: string,
  limit: number
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const day = todayVN();
  const current = await getPostCount(client, account, day);
  if (current >= limit) return { allowed: false, count: current, limit };
  const next = current + 1;
  await client.from('daily_counters').upsert({ account, kind: 'post', day, count: next }, { onConflict: 'account,kind,day' });
  return { allowed: true, count: next, limit };
}
