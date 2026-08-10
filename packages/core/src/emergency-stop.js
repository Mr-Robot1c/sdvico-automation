// Công tắc dừng khẩn. Đọc từ bảng app_config, kiểm trước mỗi thao tác.
// Bật bằng cách đặt app_config.emergency_stop bằng true.

export async function isStopped(client) {
  const { data, error } = await client
    .from('app_config')
    .select('value')
    .eq('key', 'emergency_stop')
    .maybeSingle();
  if (error) throw new Error('Đọc app_config lỗi: ' + error.message);
  return Boolean(data && data.value === true);
}

export async function assertNotStopped(client) {
  if (await isStopped(client)) {
    throw new Error('Công tắc dừng khẩn đang bật. Dừng mọi tác vụ đăng bài và thao tác web.');
  }
}

// Tiện ích bật hoặc tắt công tắc, dùng cho script vận hành.
export async function setEmergencyStop(client, stopped) {
  const { error } = await client
    .from('app_config')
    .upsert({ key: 'emergency_stop', value: Boolean(stopped), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error('Đặt công tắc dừng khẩn lỗi: ' + error.message);
}
