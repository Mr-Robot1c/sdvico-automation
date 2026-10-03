// Chỉ nhận đường dẫn nội bộ cho tham số next sau đăng nhập, để không thành cửa chuyển hướng mở.
// 3/10 (kiểm thử A11): bản cũ chỉ chặn "//host" nên "/\host" lọt — trình duyệt và URL parser
// coi "\" như "/" nên ra host ngoài. Giờ chặn "\" và ký tự điều khiển, rồi phân giải thử trên
// một origin giả: origin đổi tức là đường dẫn trỏ ra ngoài.
const PROBE_ORIGIN = 'http://noi-bo.invalid';

export function safeNext(raw: string | null | undefined): string {
  const n = String(raw || '/');
  if (!n.startsWith('/') || n.startsWith('//')) return '/';
  if (/[\\\u0000-\u001f\u007f]/.test(n)) return '/';
  try {
    const u = new URL(n, PROBE_ORIGIN);
    if (u.origin !== PROBE_ORIGIN) return '/';
    const out = `${u.pathname}${u.search}${u.hash}`;
    // "/.//host" chuẩn hóa thành "//host": vẫn là URL ra ngoài khi trình duyệt đọc lại Location.
    return out.startsWith('//') ? '/' : out;
  } catch {
    return '/';
  }
}
