import { NextResponse } from 'next/server';
import { DEMO_COOKIE } from '../../../lib/demo-mode';
import { safeNext } from '../../../lib/safe-next';

// Bật/tắt CHẾ ĐỘ DEMO (3/10, đóng gói chào bán): ?bat=1 bật, ?bat=0 tắt, rồi quay lại trang đang xem (?next=).
// Cookie chỉ làm trang CHE BỚT dữ liệu khách của chính trình duyệt đó, không mở thêm quyền gì, nên route nằm
// chung vùng /api/ được middleware cho qua cũng không sao. Hết hạn sau 12 giờ để không quên bật mãi.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const on = url.searchParams.get('bat') === '1';
  const res = NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), req.url), 303);
  if (on) {
    res.cookies.set(DEMO_COOKIE, '1', { path: '/', maxAge: 12 * 3600, sameSite: 'lax', secure: url.protocol === 'https:' });
  } else {
    res.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
  }
  return res;
}
