import { createClient } from '@supabase/supabase-js';

// Chỉ dùng ở phía máy chủ. Khóa service role không bao giờ gửi xuống trình duyệt.
// Điều cấm 7: khóa nằm trong biến môi trường, không commit.
export function getServerClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong môi trường máy chủ.');
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    // Chặn cache fetch của Next.js. Hàng đợi duyệt phải luôn là dữ liệu mới,
    // nhất là khi trang tự làm mới mỗi 30 giây.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' })
    }
  });
}
