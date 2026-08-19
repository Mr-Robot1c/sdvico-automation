// Công tắc dừng khẩn dùng cho các route cron chạy trên Vercel.
// Đọc app_config.emergency_stop; bật bằng cách đặt value=true trong bảng đó
// hoặc qua trang Cài đặt. Ném lỗi để dừng route ngay, cron tick sau tự thử lại.
// Mirror lightweight của packages/core/src/emergency-stop.js (không import chéo
// package để tránh dựng bundle serverless nặng).

import type { getServerClient } from './supabase-server';

type DbClient = ReturnType<typeof getServerClient>;

export async function isStopped(client: DbClient): Promise<boolean> {
  const { data, error } = await client
    .from('app_config')
    .select('value')
    .eq('key', 'emergency_stop')
    .maybeSingle();
  if (error) throw new Error('Đọc app_config lỗi: ' + error.message);
  return Boolean(data && data.value === true);
}

export async function assertNotStopped(client: DbClient): Promise<void> {
  if (await isStopped(client)) {
    throw new Error('Công tắc dừng khẩn đang bật. Bỏ qua tác vụ đăng bài / gọi mô hình.');
  }
}
