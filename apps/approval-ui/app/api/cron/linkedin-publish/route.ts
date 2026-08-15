// Worker đăng bài LinkedIn (kenh='linkedin') đã duyệt, khi tới giờ.
// NGỦ khi chưa cấu hình LINKEDIN_ACCESS_TOKEN/ORG_URN.
// Chạy 15 phút một lần qua GitHub Actions (cron.yml), cùng job với worker Facebook.
// Máy soạn, người bấm Duyệt, máy đăng (điều cấm 1: cổng duyệt đã qua).

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { linkedinConfigured, postToLinkedIn } from '../../../../lib/linkedin';

export const runtime = 'nodejs';
export const maxDuration = 60;

function verifyAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!verifyAuth(req)) return new Response('Unauthorized', { status: 401 });
  if (!linkedinConfigured()) {
    return NextResponse.json({ published: 0, reason: 'linkedin_not_configured' });
  }

  const client = getServerClient();
  const published: string[] = [];
  let firstError: string | null = null;

  try {
    const { data: approved, error: e1 } = await client
      .from('approval_queue')
      .select('id, title, payload')
      .eq('kind', 'hr_job_post').eq('status', 'approved')
      .order('created_at', { ascending: true });
    if (e1) throw new Error('Đọc approval_queue: ' + e1.message);

    const items = (approved || [])
      .map((a: { payload: Record<string, unknown> }) => ({
        postId: a.payload?.post_id as string | undefined,
        kenh: a.payload?.kenh as string | undefined,
      }))
      .filter((j) => j.postId && j.kenh === 'linkedin');
    if (items.length === 0) return NextResponse.json({ published: 0 });

    const postIds = items.map((j) => j.postId as string);
    const { data: posts, error: e2 } = await client
      .from('hr_job_posts')
      .select('id, tieu_de, noi_dung, trang_thai, scheduled_at, fb_post_id, kenh')
      .in('id', postIds);
    if (e2) throw new Error('Đọc hr_job_posts: ' + e2.message);
    const byId = new Map((posts || []).map((p: { id: string }) => [p.id, p]));
    const now = new Date().toISOString();

    for (const item of items) {
      const p = byId.get(item.postId as string) as {
        id: string; tieu_de: string; noi_dung: string; trang_thai: string; scheduled_at: string | null; kenh: string | null;
      } | undefined;
      if (!p || p.kenh !== 'linkedin') continue;
      if (p.trang_thai === 'posted' || p.trang_thai === 'cancelled') continue;
      if (!p.noi_dung?.trim()) continue;
      if (p.scheduled_at && p.scheduled_at > now) continue;

      try {
        const urn = await postToLinkedIn(p.noi_dung);
        await client.from('hr_job_posts')
          .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), fb_post_id: urn, ghi_chu: null })
          .eq('id', p.id);
        published.push(p.tieu_de);
        try { await client.from('run_log').insert({ task: 'hr.publish_linkedin', status: 'ok', detail: { postId: p.id, urn } }); } catch {}
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError = firstError || msg;
        try { await client.from('hr_job_posts').update({ trang_thai: 'failed', ghi_chu: msg }).eq('id', p.id); } catch {}
        try { await client.from('run_log').insert({ task: 'hr.publish_linkedin', status: 'error', detail: { postId: p.id, error: msg } }); } catch {}
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ published: published.length, items: published, error: firstError });
}
