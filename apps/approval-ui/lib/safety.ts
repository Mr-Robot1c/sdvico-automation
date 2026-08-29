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

// --- Bỏ hạn mức (tắt trần đăng ngày, dùng khi cần test) ---
export async function isQuotaDisabled(client: Client): Promise<boolean> {
  const { data } = await client.from('app_config').select('value').eq('key', 'quota_disabled').maybeSingle();
  return Boolean(data && (data as any).value === true);
}

export async function setQuotaDisabled(client: Client, disabled: boolean): Promise<void> {
  await client
    .from('app_config')
    .upsert({ key: 'quota_disabled', value: disabled, updated_at: new Date().toISOString() }, { onConflict: 'key' });
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
// 29/8 (audit mục 12): kiểm + tăng phải là MỘT câu lệnh trong database (reserve_daily_quota,
// migration 20260829180000) — bản cũ đọc rồi ghi, hai lượt duyệt bấm cùng lúc cùng đọc số cũ
// nên cùng lọt qua trần. Hàm DB chưa được dán (migration chờ) thì rơi về lối cũ để không đứt
// luồng đăng — lối cũ vẫn race, dán migration là hết.
export async function reservePostQuota(
  client: Client,
  account: string,
  limit: number
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const day = todayVN();
  const { data, error } = await client.rpc('reserve_daily_quota', {
    p_account: account, p_kind: 'post', p_day: day, p_limit: limit,
  });
  if (!error && Array.isArray(data) && data.length) {
    const row = data[0] as { allowed: boolean; new_count: number };
    return { allowed: Boolean(row.allowed), count: Number(row.new_count) || 0, limit };
  }
  console.warn('[safety] reserve_daily_quota chưa gọi được (chưa dán migration?):', error?.message);
  const current = await getPostCount(client, account, day);
  if (current >= limit) return { allowed: false, count: current, limit };
  const next = current + 1;
  await client.from('daily_counters').upsert({ account, kind: 'post', day, count: next }, { onConflict: 'account,kind,day' });
  return { allowed: true, count: next, limit };
}
