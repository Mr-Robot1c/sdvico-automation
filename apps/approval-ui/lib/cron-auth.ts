// Kiểm xác thực cho các route /api/cron/*.
// P1-12:
//   - So sánh hằng thời gian bằng crypto.timingSafeEqual (chống rò bit qua thời gian).
//   - Thiếu CRON_SECRET → 503 KỂ CẢ non-production (trước đây chỉ chặn ở production; nếu
//     self-host quên đặt secret, endpoint sẽ mở toang — tự động hóa đăng bài không có cổng).

import { timingSafeEqual } from 'crypto';

export type CronAuthResult =
  | { ok: true }
  | { ok: false; response: Response };

export function verifyCronAuth(req: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: new Response(
        'Thiếu CRON_SECRET. Đặt biến này trên Vercel (Settings → Environment Variables) rồi redeploy.',
        { status: 503 }
      ),
    };
  }
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual yêu cầu 2 buffer đúng độ dài. Padding một chiều để so sánh vẫn hằng thời gian.
  const maxLen = Math.max(a.length, b.length);
  const aPad = Buffer.alloc(maxLen);
  const bPad = Buffer.alloc(maxLen);
  a.copy(aPad);
  b.copy(bPad);
  const equal = a.length === b.length && timingSafeEqual(aPad, bPad);
  if (!equal) {
    return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  }
  return { ok: true };
}
