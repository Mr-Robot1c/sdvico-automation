import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { pullFacebookMetrics } from '../../../lib/fb-metrics';
import { isPlanDayVN, generateAndStorePlan } from '../../../lib/plan';

// Kéo số liệu tương tác Facebook về mkt_metrics. Gọi bởi Vercel Cron (Authorization: Bearer
// CRON_SECRET) hoặc thủ công (?secret=CRON_SECRET).
// Thứ 4 và chủ nhật: sau khi kéo số liệu mới, sinh luôn 1 bản kế hoạch (con bot định hướng).
// Gộp ở đây vì Vercel Hobby chỉ cho 2 cron, và kế hoạch nên bám số liệu vừa cập nhật.
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
  const res = await pullFacebookMetrics(client);

  // Sinh kế hoạch vào thứ 4 và chủ nhật. Lỗi sinh kế hoạch không được đánh hỏng việc kéo số liệu.
  let plan: { id: string | null; ranked: number } | null = null;
  if (isPlanDayVN(new Date())) {
    try {
      const { id, plan: p } = await generateAndStorePlan(client, 'cron');
      plan = { id, ranked: p.summary.ranked };
    } catch (e: any) {
      console.error('[plan] sinh ke hoach that bai:', e?.message || e);
    }
  }

  return NextResponse.json({ ok: true, ...res, plan });
}
