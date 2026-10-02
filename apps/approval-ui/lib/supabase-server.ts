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

// 2/10 (UI mượt): client cho trang CÔNG KHAI (blog) — KHÔNG ép cache: 'no-store'. getServerClient
// ở trên ép no-store cho hàng đợi duyệt, nhưng một fetch no-store trong trang sẽ biến trang thành
// dynamic và LÀM VÔ HIỆU `export const revalidate` (blog vẫn cold-start 12 giây dù đã khai báo
// revalidate). Client này để fetch theo cache mặc định của Next, nên trang blog được dựng sẵn
// (ISR) và làm mới theo `revalidate` của từng trang (5 đến 10 phút). Chỉ dùng cho dữ liệu đọc
// công khai, KHÔNG dùng cho hàng đợi duyệt hay dữ liệu ứng viên.
export function getPublicClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong môi trường máy chủ.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
