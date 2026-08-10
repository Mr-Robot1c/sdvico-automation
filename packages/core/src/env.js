import 'dotenv/config';

// Đọc biến môi trường. Không đọc lúc nạp module để tránh lỗi khi chỉ import hàm khác.
// Khóa và mật khẩu chỉ ở .env hoặc GitHub Secrets, không commit (điều cấm 7).
export function getEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Chép .env.example thành .env rồi điền giá trị thật.'
    );
  }
  return { url, serviceKey };
}
