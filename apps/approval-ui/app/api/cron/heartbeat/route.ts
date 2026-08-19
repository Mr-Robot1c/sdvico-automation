// Vercel Cron: dead-man switch cho các worker chạy nền.
// P1-10: nếu một tác vụ trong `run_log` không có bản ghi nào trong ngưỡng thời gian
// (mặc định 3 giờ với publish, 6 giờ với retention_purge chạy 1 lần/ngày), đẩy 1 alert vào
// approval_queue để người vận hành thấy trong UI. Idempotent theo task+day → mỗi ngày
// chỉ đẩy 1 alert cho một task im lặng, không spam.
//
// Gọi bằng cron-job.org mỗi 30-60 phút. Bảo vệ bằng CRON_SECRET.

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { verifyCronAuth } from '../../../../lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Ngưỡng "im lặng quá lâu" theo phút cho từng task.
// - publish/compose chạy mỗi 15 phút → im lặng > 3h là bất thường.
// - retention_purge chạy 1 lần/ngày → im lặng > 30h là bất thường.
const WATCH: Array<{ task: string; maxMinutes: number }> = [
  { task: 'hr.publish_facebook',      maxMinutes: 180 },
  { task: 'hr.publish_linkedin',      maxMinutes: 180 },
  { task: 'hr.publish_comment_reply', maxMinutes: 180 },
  { task: 'hr.queue_facebook',        maxMinutes: 180 },
  { task: 'hr.queue_comment_replies', maxMinutes: 180 },
  { task: 'hr.retention_purge',       maxMinutes: 30 * 60 },
  { task: 'hr.reinvite_scan',         maxMinutes: 26 * 60 }, // cron 1 lần/ngày, gia hạn 2h
];

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const client = getServerClient();
  const now = Date.now();
  const day = todayVN();
  const alerts: Array<{ task: string; last: string | null; silentMinutes: number }> = [];

  try {
    for (const w of WATCH) {
      const { data } = await client
        .from('run_log')
        .select('created_at')
        .eq('task', w.task)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastIso = data && data.length ? (data[0] as { created_at: string }).created_at : null;
      const lastMs = lastIso ? new Date(lastIso).getTime() : 0;
      const silentMinutes = lastMs ? Math.floor((now - lastMs) / 60000) : Number.MAX_SAFE_INTEGER;
      if (silentMinutes < w.maxMinutes) continue;

      // Idempotent: 1 alert / task / ngày. Tra theo title chứa mã task + ngày.
      const alertTitle = `Worker im lặng: ${w.task}`;
      const { data: existing } = await client
        .from('approval_queue')
        .select('id')
        .eq('kind', 'alert')
        .eq('title', alertTitle)
        .gte('created_at', `${day}T00:00:00Z`)
        .maybeSingle();
      if (existing) continue;

      await client.from('approval_queue').insert({
        kind: 'alert',
        title: alertTitle,
        payload: {
          task: w.task,
          last_run_at: lastIso,
          silent_minutes: silentMinutes,
          threshold_minutes: w.maxMinutes,
          hint: 'Kiểm cron-job.org xem entry có bị pause / khóa tài khoản không; và Vercel logs xem route có 500 im lặng không.',
        },
        status: 'pending',
      });
      alerts.push({ task: w.task, last: lastIso, silentMinutes });
    }

    try { await client.from('run_log').insert({ task: 'hr.heartbeat', status: 'ok', detail: { alerts: alerts.length, items: alerts } }); } catch {}
    return NextResponse.json({ checked: WATCH.length, alerts: alerts.length, items: alerts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.heartbeat', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
