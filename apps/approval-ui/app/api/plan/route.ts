import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { generateAndStorePlan } from '../../../lib/plan';

// Sinh 1 bản kế hoạch marketing từ số liệu Đo lường. Gọi thủ công để chạy tay/test, hoặc bởi
// cron ngoài. Lịch tự động thứ 4 và chủ nhật được GỘP vào cron metrics-pull (Vercel Hobby chỉ
// cho 2 cron nên không thêm cron thứ 3). Bot ĐỀ XUẤT, người quyết (điều cấm 1 và 2): bản sinh ra
// applied = false, chưa tác động vòng xoay tới khi người bấm "Áp dụng trọng số" ở trang Kế hoạch.
// Bảo vệ bằng CRON_SECRET như /api/rotate.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const bearer = (req.headers.get('authorization') || '') === `Bearer ${secret}`;
    const query = url.searchParams.get('secret') === secret;
    if (!bearer && !query) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const client = getServerClient();
  try {
    const { id, plan } = await generateAndStorePlan(client, 'cron');
    return NextResponse.json({
      ok: true,
      id,
      ranked: plan.summary.ranked,
      insufficient: plan.summary.insufficient,
      topProduct: plan.summary.topProduct
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'loi sinh ke hoach' }, { status: 500 });
  }
}
