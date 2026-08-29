// Phiên đăng nhập v2 (29/8, audit bảo mật) — thay token cũ SHA-256(user:pass:salt).
//
// Token cũ là hàm băm THUẦN của mật khẩu: ai cầm được cookie có thể dò ngược mật khẩu
// offline (thử từ điển, không giới hạn tốc độ). Token v2 là HMAC có hạn dùng:
//   token = "v2.<exp>.<HMAC-SHA256(khóa, "v2.<exp>")>"
//   khóa  = AUTH_SECRET + "|" + user + "|" + pass
// Cầm cookie không dò được mật khẩu (thiếu AUTH_SECRET ngẫu nhiên 256 bit). Đổi mật khẩu
// HOẶC đổi AUTH_SECRET trên Vercel là mọi phiên cũ chết ngay (giữ tính chất bản cũ).
//
// File này được middleware (edge runtime) import nên CHỈ dùng Web Crypto (crypto.subtle),
// không được import node:crypto.

const TOKEN_VERSION = 'v2';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 ngày, khớp cookie cũ

function keyMaterial(): string | null {
  const secret = (process.env.AUTH_SECRET || '').trim();
  if (!secret) return null; // thiếu AUTH_SECRET thì không phát hành và không nhận token nào
  const user = (process.env.APPROVAL_UI_USER || 'sdvico').trim();
  const pass = (process.env.APPROVAL_UI_PASSWORD || '').trim();
  return `${secret}|${user}|${pass}`;
}

async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// So sánh hằng thời gian: băm hai bên trước để độ dài luôn bằng nhau rồi XOR từng byte.
export async function safeEqualStrings(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

// Trả null khi chưa cấu hình AUTH_SECRET — nơi gọi phải báo lỗi rõ, không im lặng.
export async function createSessionToken(): Promise<string | null> {
  const key = keyMaterial();
  if (!key) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${TOKEN_VERSION}.${exp}`;
  return `${payload}.${await hmacHex(key, payload)}`;
}

export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  const key = keyMaterial();
  if (!key || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false; // token v1 cũ rớt tại đây
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = await hmacHex(key, `${parts[0]}.${parts[1]}`);
  return safeEqualStrings(expected, parts[2]);
}

// Cổng chung cho API route cần khóa: người đã đăng nhập (cookie sdvico_auth) HOẶC máy nội
// bộ (Authorization: Bearer CRON_SECRET). Dev cục bộ bỏ khóa, khớp chính sách middleware.
// Fail-closed: thiếu CRON_SECRET thì nhánh Bearer từ chối luôn, không mở toang như rotate cũ.
export async function isAuthorizedApiRequest(req: Request): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;

  const cron = (process.env.CRON_SECRET || '').trim();
  const auth = req.headers.get('authorization') || '';
  if (cron && auth.startsWith('Bearer ') && await safeEqualStrings(auth.slice(7), cron)) {
    return true;
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const m = cookieHeader.match(/(?:^|;\s*)sdvico_auth=([^;]+)/);
  if (m) {
    let value = m[1];
    try { value = decodeURIComponent(value); } catch { /* cookie hỏng thì cứ so bản thô */ }
    if (await verifySessionToken(value)) return true;
  }
  return false;
}
