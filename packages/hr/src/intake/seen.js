// Bộ đánh dấu thư đã xử lý, lưu trong cơ sở dữ liệu thay vì dựa cờ "đã đọc" của hộp thư.
//
// Vì sao: cờ "đã đọc" mong manh. Người mở thư trong hộp thư cũng làm nó thành đã đọc,
// khiến pipeline bỏ sót. Ở đây lưu message-id đã xử lý vào app_config, đọc thư theo ngày,
// nên trạng thái đọc của người không còn ảnh hưởng.
//
// Dùng bảng app_config có sẵn (khóa và giá trị jsonb), không cần migration mới.
// Giá trị là map { message_id: thời điểm xử lý }. Tự cắt bớt mục cũ để không phình mãi.

const KEY = 'hr_intake_processed';

export async function loadProcessed(client) {
  const { data, error } = await client
    .from('app_config')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();
  if (error) throw new Error('Đọc app_config lỗi: ' + error.message);
  const v = data && data.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// Lưu map đã xử lý, cắt bỏ mục cũ hơn keepDays ngày để giữ gọn.
export async function saveProcessed(client, map, { keepDays = 14 } = {}) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const [id, iso] of Object.entries(map)) {
    const t = Date.parse(iso);
    if (Number.isNaN(t) || t >= cutoff) pruned[id] = iso;
  }
  const { error } = await client
    .from('app_config')
    .upsert({ key: KEY, value: pruned, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error('Ghi app_config lỗi: ' + error.message);
  return pruned;
}
