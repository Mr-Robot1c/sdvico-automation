// Bộ đếm hạn mức ngày, lưu trong cơ sở dữ liệu. Hạn mức tự đặt thấp hơn hạn mức của sàn.
// 29/8 (audit mục 12): khi có trần, kiểm + tăng đi qua hàm DB nguyên tử reserve_daily_quota
// (migration 20260829180000) — CÙNG hàm với apps/approval-ui/lib/safety.ts nên điểm thực thi
// hạn mức chỉ còn một chỗ (audit mục 14). Bản cũ đọc rồi ghi bị race khi hai tiến trình chạy
// cùng lúc; còn giữ làm fallback khi hàm chưa được dán vào database.

export function todayVN() {
  // Ngày theo giờ Việt Nam, dạng YYYY-MM-DD. Việt Nam lệch UTC bảy giờ.
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

export async function getCounter(client, { account, kind, day = todayVN() }) {
  const { data, error } = await client
    .from('daily_counters')
    .select('count')
    .eq('account', account)
    .eq('kind', kind)
    .eq('day', day)
    .maybeSingle();
  if (error) throw new Error('Đọc daily_counters lỗi: ' + error.message);
  return data ? data.count : 0;
}

// Tăng bộ đếm nếu chưa chạm trần. Trả về allowed để nơi gọi biết có được chạy tiếp không.
export async function incrementDailyCounter(client, { account, kind, day = todayVN(), limit }) {
  // Có trần -> hàm DB nguyên tử. Không trần (limit không phải số) -> chỉ đếm, đi lối cũ.
  if (typeof limit === 'number') {
    const { data, error } = await client.rpc('reserve_daily_quota', {
      p_account: account, p_kind: kind, p_day: day, p_limit: limit,
    });
    if (!error && Array.isArray(data) && data.length) {
      return { count: Number(data[0].new_count) || 0, allowed: Boolean(data[0].allowed) };
    }
    console.warn('[quota] reserve_daily_quota chưa gọi được (chưa dán migration?):', error?.message);
  }
  const current = await getCounter(client, { account, kind, day });
  if (typeof limit === 'number' && current >= limit) {
    return { count: current, allowed: false };
  }
  const next = current + 1;
  const { error } = await client
    .from('daily_counters')
    .upsert({ account, kind, day, count: next }, { onConflict: 'account,kind,day' });
  if (error) throw new Error('Cập nhật daily_counters lỗi: ' + error.message);
  return { count: next, allowed: true };
}
