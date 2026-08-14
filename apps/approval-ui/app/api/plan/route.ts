import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { loadMeasurement, buildPlan, weekWindowVN } from '../../../lib/plan';

// Lịch thứ 4 và chủ nhật: đọc số liệu Đo lường rồi sinh 1 bản kế hoạch marketing tuần tới.
// Bot ĐỀ XUẤT, người quyết (điều cấm 1 và 2). Bản sinh ở đây applied = false, chưa tác động
// vòng xoay sinh bài cho tới khi người mở trang Kế hoạch bấm "Áp dụng trọng số".
// Bảo vệ bằng CRON_SECRET như /api/rotate.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function generate(client: ReturnType<typeof getServerClient>, generatedBy: 'cron' | 'manual') {
  const now = new Date();
  const measurement = await loadMeasurement(client);
  const plan = buildPlan(measurement, { generatedAt: now.toISOString() });
  const win = weekWindowVN(now);

  const { data, error } = await client
    .from('mkt_plans')
    .insert({
      period_start: win.start,
      period_end: win.end,
      generated_by: generatedBy,
      data: plan,
      applied: false
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as any)?.id as string, plan };
}

export async function GET(req: Request) {
  // Vercel Cron gửi Authorization: Bearer <CRON_SECRET>. Chặn gọi trái phép.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const client = getServerClient();
  try {
    const { id, plan } = await generate(client, 'cron');
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
