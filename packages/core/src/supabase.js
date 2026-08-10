import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

// Client dùng khóa service role, chạy ở phía máy chủ và tác vụ theo lịch.
// service role tự bỏ qua RLS, nên tuyệt đối không dùng ở phía trình duyệt.
export function getServiceClient() {
  const { url, serviceKey } = getEnv();
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
