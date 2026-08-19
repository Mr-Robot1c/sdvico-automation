// Worker đăng bài LinkedIn (kenh='linkedin') đã duyệt, khi tới giờ.
// NGỦ khi chưa cấu hình LINKEDIN_ACCESS_TOKEN/ORG_URN.
// Chạy 15 phút một lần qua GitHub Actions (cron.yml), cùng job với worker Facebook.
// Máy soạn, người bấm Duyệt, máy đăng (điều cấm 1: cổng duyệt đã qua).

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { linkedinConfigured, postToLinkedIn } from '../../../../lib/linkedin';
import { assertNotStopped } from '../../../../lib/emergency-stop';
import { verifyCronAuth } from '../../../../lib/cron-auth';
import { checkAndIncrementDailyQuota, pauseBetweenPosts, createDeadLetterAlert } from '../../../../lib/publish-guards';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ATTEMPTS = 3;
const DAILY_LIMIT = Number(process.env.HR_LI_PUBLISH_MAX_PER_DAY) || 10;

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  if (!linkedinConfigured()) {
    return NextResponse.json({ published: 0, reason: 'linkedin_not_configured' });
  }

  const client = getServerClient();
  const published: string[] = [];
  let firstError: string | null = null;

  try {
    // P0-2: dừng khẩn phủ đường đăng thật.
    await assertNotStopped(client);

    const { data: approved, error: e1 } = await client
      .from('approval_queue')
      .select('id, title, payload')
      .eq('kind', 'hr_job_post').eq('status', 'approved')
      .order('created_at', { ascending: true });
    if (e1) throw new Error('Đọc approval_queue: ' + e1.message);

    const items = (approved || [])
      .map((a: { id: string; payload: Record<string, unknown> }) => ({
        approvalId: a.id,
        postId: a.payload?.post_id as string | undefined,
        kenh: a.payload?.kenh as string | undefined,
      }))
      .filter((j) => j.postId && j.kenh === 'linkedin');
    if (items.length === 0) return NextResponse.json({ published: 0 });

    const postIds = items.map((j) => j.postId as string);
    const { data: posts, error: e2 } = await client
      .from('hr_job_posts')
      .select('id, tieu_de, noi_dung, trang_thai, scheduled_at, fb_post_id, kenh, attempts')
      .in('id', postIds);
    if (e2) throw new Error('Đọc hr_job_posts: ' + e2.message);
    const byId = new Map((posts || []).map((p: { id: string }) => [p.id, p]));
    const now = new Date().toISOString();
    let postedThisRun = 0;

    for (const item of items) {
      const p = byId.get(item.postId as string) as {
        id: string; tieu_de: string; noi_dung: string; trang_thai: string; scheduled_at: string | null;
        kenh: string | null; attempts: number | null;
      } | undefined;
      if (!p || p.kenh !== 'linkedin') continue;
      if (p.trang_thai === 'posted' || p.trang_thai === 'cancelled') continue;
      // P0-3: chặn retry vô hạn khi thất bại bền vững (token hết hạn, org bị chặn).
      if (p.trang_thai === 'failed' && (p.attempts ?? 0) >= MAX_ATTEMPTS) continue;
      if (!p.noi_dung?.trim()) continue;
      if (p.scheduled_at && p.scheduled_at > now) continue;

      // P1-7: enforce trần ngày.
      const quota = await checkAndIncrementDailyQuota(client, {
        account: 'linkedin_publish', kind: 'hr_job_post', limit: DAILY_LIMIT,
      });
      if (!quota.allowed) {
        try { await client.from('run_log').insert({ task: 'hr.publish_linkedin', status: 'ok', detail: { published: postedThisRun, reason: 'daily_limit', limit: DAILY_LIMIT } }); } catch {}
        break;
      }

      // P0-3: atomic claim.
      const { data: claimed, error: claimErr } = await client
        .from('hr_job_posts')
        .update({ trang_thai: 'posting' })
        .eq('id', p.id)
        .in('trang_thai', ['draft', 'scheduled', 'failed'])
        .select('id');
      if (claimErr) { firstError = firstError || claimErr.message; continue; }
      if (!claimed || claimed.length === 0) continue;

      if (postedThisRun > 0) await pauseBetweenPosts();

      try {
        const urn = await postToLinkedIn(p.noi_dung);
        await client.from('hr_job_posts')
          .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), fb_post_id: urn, ghi_chu: null })
          .eq('id', p.id);
        try { await client.from('approval_queue').update({ status: 'posted' }).eq('id', item.approvalId); } catch {}
        published.push(p.tieu_de);
        postedThisRun += 1;
        try { await client.from('run_log').insert({ task: 'hr.publish_linkedin', status: 'ok', detail: { postId: p.id, urn } }); } catch {}
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError = firstError || msg;
        const nextAttempts = (p.attempts ?? 0) + 1;
        try {
          await client.from('hr_job_posts')
            .update({ trang_thai: 'failed', ghi_chu: msg, attempts: nextAttempts })
            .eq('id', p.id);
        } catch {}
        try { await client.from('run_log').insert({ task: 'hr.publish_linkedin', status: 'error', detail: { postId: p.id, error: msg, attempts: nextAttempts } }); } catch {}
        if (nextAttempts >= MAX_ATTEMPTS) {
          try { await createDeadLetterAlert(client, { refTable: 'hr_job_posts', refId: p.id, task: 'hr.publish_linkedin', attempts: nextAttempts, error: msg, extra: { tieu_de: p.tieu_de } }); } catch {}
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ published: published.length, items: published, error: firstError });
}
