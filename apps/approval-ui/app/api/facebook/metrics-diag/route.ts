import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';

// Route diag: xem 5 snapshot mkt_metrics Facebook gần nhất — kèm views/reactions/comments
// và insightErr (nếu có). User 27/8 test cột "Lượt xem" vẫn "—" du đã update metric v26 —
// endpoint này giup xem chinh xac Facebook tra gi cho tung bai.
//
// Kem run_log gan nhat cua task 'mkt.metrics_pull_manual' de xem errors da collect.
//
// Dùng: /api/facebook/metrics-diag?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = getServerClient();

  const { data: metrics } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at, metric_date')
    .eq('source', 'facebook')
    .order('created_at', { ascending: false })
    .limit(5);

  const cids = [...new Set((metrics || []).map((m: any) => m.entity_ref).filter(Boolean))];
  const titleByCid = new Map<string, string>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', cids);
    for (const c of cs || []) titleByCid.set((c as any).id, (c as any).title || '(không tên)');
  }

  const { data: logs } = await client
    .from('run_log')
    .select('task, status, detail, created_at')
    .eq('task', 'mkt.metrics_pull_manual')
    .order('created_at', { ascending: false })
    .limit(3);

  const { data: metricsPullCron } = await client
    .from('run_log')
    .select('task, status, detail, created_at')
    .eq('task', 'mkt.metrics_pull')
    .order('created_at', { ascending: false })
    .limit(3);

  return NextResponse.json({
    ok: true,
    note: 'Xem xem cot metrics.views co gia tri chua. Neu views=undefined nghia la Facebook Insights v26 chua cap so hoac metric name van sai.',
    facebook_snapshots: (metrics || []).map((m: any) => ({
      title: titleByCid.get(m.entity_ref) || '(khong ro)',
      created_at: m.created_at,
      metric_date: m.metric_date,
      metrics: m.metrics,
      views_value: m.metrics?.views ?? null,
      views_is_null: m.metrics?.views == null,
    })),
    recent_manual_pulls: logs || [],
    recent_cron_pulls: metricsPullCron || [],
  });
}
