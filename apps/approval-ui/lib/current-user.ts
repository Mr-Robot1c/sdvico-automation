import { cookies, headers } from 'next/headers';
import { verifySessionToken, safeEqualStrings } from './session-auth';

// Ai đang bấm trong giao diện duyệt? (3/10: phiếu duyệt xong mà decided_by vẫn null —
// decideForm chưa ghi người quyết.)
//
// Hệ đăng nhập nội bộ hiện là MỘT tài khoản chung đặt ở biến môi trường
// (APPROVAL_UI_USER, xem middleware.ts): cookie phiên sdvico_auth chỉ chứng minh
// "đã đăng nhập", không mang tên người. Vì vậy tên trả về là tên tài khoản đó —
// đủ để phân biệt "người bấm qua form" với script máy, và là MỘT CHỖ DUY NHẤT
// cần nâng khi có phân quyền nhiều tài khoản (S01, chờ sếp chốt).
//
// Thứ tự nhận diện khớp middleware: cookie phiên -> Basic auth (curl/script cũ,
// lấy đúng username trong header) -> dev cục bộ không ép đăng nhập thì ghi
// 'dev-local' cho khỏi nhận vơ tài khoản thật.
export async function getCurrentApprover(): Promise<string | null> {
  const envUser = (process.env.APPROVAL_UI_USER || 'sdvico').trim();

  try {
    const tok = cookies().get('sdvico_auth')?.value;
    if (tok && await verifySessionToken(tok)) return envUser;
  } catch { /* gọi ngoài ngữ cảnh request thì thôi, rơi xuống dưới */ }

  try {
    const auth = headers().get('authorization');
    if (auth) {
      const [scheme, encoded] = auth.split(' ');
      if (scheme === 'Basic' && encoded) {
        let decoded = '';
        try { decoded = atob(encoded); } catch { /* base64 hỏng thì coi như không có */ }
        const idx = decoded.indexOf(':');
        if (idx >= 0) {
          const u = decoded.slice(0, idx);
          const p = decoded.slice(idx + 1);
          const pass = (process.env.APPROVAL_UI_PASSWORD || '').trim();
          if (pass && await safeEqualStrings(u, envUser) && await safeEqualStrings(p, pass)) {
            return envUser;
          }
        }
      }
    }
  } catch { /* như trên */ }

  // Dev cục bộ middleware không ép đăng nhập (NODE_ENV !== production).
  if (process.env.NODE_ENV !== 'production') return 'dev-local';
  return null;
}
