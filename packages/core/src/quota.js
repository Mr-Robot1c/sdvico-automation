// Bộ đếm hạn mức ngày, lưu trong cơ sở dữ liệu. Hạn mức tự đặt thấp hơn hạn mức của sàn.
// Ghi chú v1: đọc rồi ghi, chưa dùng khóa giao dịch. Đủ cho khối lượng nhỏ trong tuần đầu.

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
