// Vercel Cron: đăng bài tuyển dụng đã duyệt lên Facebook khi đến giờ đặt lịch.
// Máy soạn, người bấm Duyệt, máy đăng khi đúng giờ (điều cấm 1: cổng duyệt đã qua).
// Chạy 15 phút một lần qua GitHub Actions (cron.yml), thay thế và bổ sung cho hr-post.yml.
// Vercel Hobby không cho đặt cron trong vercel.json nên file đó để rỗng.

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { assertNotStopped } from '../../../../lib/emergency-stop';
import { verifyCronAuth } from '../../../../lib/cron-auth';
import { checkAndIncrementDailyQuota, pauseBetweenPosts, createDeadLetterAlert } from '../../../../lib/publish-guards';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
// Sau 3 lần thất bại liên tiếp, KHÔNG thử đăng lại (bài giữ `failed` cho người xử lý tay
// qua trang Đăng tin). Tránh xoay vòng vô hạn khi token hết hạn hoặc bài bị chặn.
const MAX_ATTEMPTS = 3;
// Trần bài đăng Facebook mỗi ngày. Có thể ghi đè bằng biến môi trường.
const DAILY_LIMIT = Number(process.env.HR_FB_PUBLISH_MAX_PER_DAY) || 20;

async function postToFacebook(post: {
  tieu_de: string; noi_dung: string; image_url: string | null;
}): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) throw new Error('Thiếu FACEBOOK_PAGE_ID hoặc FACEBOOK_PAGE_ACCESS_TOKEN.');

  const message = [post.tieu_de, '', post.noi_dung].join('\n').trim();

  if (post.image_url) {
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${pageId}/photos`, {
      method: 'POST',
      body: new URLSearchParams({ url: post.image_url, caption: message, access_token: token }),
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
    return json.post_id || json.id;
  } else {
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${pageId}/feed`, {
      method: 'POST',
      body: new URLSearchParams({ message, access_token: token }),
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
    return json.id;
  }
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const client = getServerClient();
  const published: string[] = [];
  let firstError: string | null = null;

  try {
    // P0-2: dừng khẩn phủ đường đăng thật. Cờ bật → thoát ngay, tick sau tự thử lại.
    await assertNotStopped(client);
    // Bài đã duyệt.
    const { data: approved, error: e1 } = await client
      .from('approval_queue')
      .select('id, title, payload')
      .eq('kind', 'hr_job_post')
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    if (e1) throw new Error('Đọc approval_queue: ' + e1.message);

    const items = (approved || []).map((a: { id: string; title: string; payload: Record<string, unknown> }) => ({
      approvalId: a.id,
      title: a.title,
      postId: a.payload?.post_id as string | undefined,
    })).filter((j) => j.postId);

    if (items.length === 0) {
      try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'ok', detail: { published: 0, reason: 'no_approved' } }); } catch {}
      return NextResponse.json({ published: 0 });
    }

    const postIds = items.map((j) => j.postId as string);
    const { data: posts, error: e2 } = await client
      .from('hr_job_posts')
      .select('id, tieu_de, noi_dung, trang_thai, image_url, scheduled_at, fb_post_id, kenh, attempts')
      .in('id', postIds);
    if (e2) throw new Error('Đọc hr_job_posts: ' + e2.message);

    const byId = new Map((posts || []).map((p: { id: string }) => [p.id, p]));
    const now = new Date().toISOString();
    let postedThisRun = 0;

    for (const item of items) {
      const p = byId.get(item.postId as string) as {
        id: string; tieu_de: string; noi_dung: string; trang_thai: string;
        image_url: string | null; scheduled_at: string | null; fb_post_id: string | null; kenh: string | null;
        attempts: number | null;
      } | undefined;
      if (!p) continue;
      // Worker này chỉ đăng Facebook. Bài LinkedIn do worker linkedin-publish lo.
      if (p.kenh && p.kenh !== 'facebook') continue;
      if (p.trang_thai === 'posted' || p.trang_thai === 'cancelled') continue;
      // P0-3: failed cũng bỏ qua nếu đã thử đủ MAX_ATTEMPTS lần → chặn retry vô hạn.
      if (p.trang_thai === 'failed' && (p.attempts ?? 0) >= MAX_ATTEMPTS) continue;
      if (!p.noi_dung?.trim()) continue;
      // Đã có fb_post_id + scheduled = đã hẹn giờ qua Facebook API, FB tự đăng — bỏ qua.
      if (p.fb_post_id && p.trang_thai === 'scheduled') continue;
      // Chưa đến giờ thì bỏ qua, chờ lần tiếp theo.
      if (p.scheduled_at && p.scheduled_at > now) continue;

      // P1-7: enforce trần bài đăng ngày TRƯỚC claim, để không đốt claim khi đã full.
      const quota = await checkAndIncrementDailyQuota(client, {
        account: 'fb_page_publish', kind: 'hr_job_post', limit: DAILY_LIMIT,
      });
      if (!quota.allowed) {
        try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'ok', detail: { published: postedThisRun, reason: 'daily_limit', limit: DAILY_LIMIT } }); } catch {}
        break;
      }

      // P0-3: atomic claim. Chỉ tiếp tục nếu chuyển được sang 'posting'.
      // Nếu bài đã bị process khác (UI "Duyệt và đăng", cron song song) claim rồi thì
      // .select() trả 0 dòng → bỏ qua, không đăng trùng.
      const { data: claimed, error: claimErr } = await client
        .from('hr_job_posts')
        .update({ trang_thai: 'posting' })
        .eq('id', p.id)
        .in('trang_thai', ['draft', 'scheduled', 'failed'])
        .select('id');
      if (claimErr) { firstError = firstError || claimErr.message; continue; }
      if (!claimed || claimed.length === 0) continue;

      // P1-7: giãn cách giữa các lần POST để Facebook không cờ spam.
      if (postedThisRun > 0) await pauseBetweenPosts();

      try {
        const fbPostId = await postToFacebook(p);
        const externalUrl = `https://www.facebook.com/${fbPostId}`;
        const { error: updateErr } = await client.from('hr_job_posts')
          .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), url: externalUrl, fb_post_id: fbPostId, ghi_chu: null })
          .eq('id', p.id);
        if (updateErr) throw new Error('Lưu DB: ' + updateErr.message);
        // P0-3: chuyển approval_queue sang 'posted' để cron tick sau không đọc lại.
        try { await client.from('approval_queue').update({ status: 'posted' }).eq('id', item.approvalId); } catch {}
        published.push(p.tieu_de);
        postedThisRun += 1;
        try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'ok', detail: { postId: p.id, fbPostId, externalUrl } }); } catch {}
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError = firstError || msg;
        // P0-3: đếm attempts để chặn retry vô hạn ở lần chạy sau.
        const nextAttempts = (p.attempts ?? 0) + 1;
        try {
          await client.from('hr_job_posts')
            .update({ trang_thai: 'failed', ghi_chu: msg, attempts: nextAttempts })
            .eq('id', p.id);
        } catch {}
        try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'error', detail: { postId: p.id, error: msg, attempts: nextAttempts } }); } catch {}
        // P1-8: chạm trần retry → đẩy dead-letter alert cho người vận hành.
        if (nextAttempts >= MAX_ATTEMPTS) {
          try { await createDeadLetterAlert(client, { refTable: 'hr_job_posts', refId: p.id, task: 'hr.publish_facebook', attempts: nextAttempts, error: msg, extra: { tieu_de: p.tieu_de } }); } catch {}
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ published: published.length, items: published, error: firstError });
}
