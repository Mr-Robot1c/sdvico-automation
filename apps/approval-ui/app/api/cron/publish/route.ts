// Vercel Cron: đăng bài tuyển dụng đã duyệt lên Facebook khi đến giờ đặt lịch.
// Máy soạn, người bấm Duyệt, máy đăng khi đúng giờ (điều cấm 1: cổng duyệt đã qua).
// Chạy mỗi 5 phút qua vercel.json, thay thế và bổ sung cho hr-post.yml.

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

function verifyAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Production bắt buộc có CRON_SECRET (route này đã đi vòng qua cổng Basic Auth).
  // Thiếu secret ở production thì chặn, tránh mở endpoint ra ngoài.
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

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
  if (!verifyAuth(req)) return new Response('Unauthorized', { status: 401 });

  const client = getServerClient();
  const published: string[] = [];
  let firstError: string | null = null;

  try {
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
      .select('id, tieu_de, noi_dung, trang_thai, image_url, scheduled_at, fb_post_id, kenh')
      .in('id', postIds);
    if (e2) throw new Error('Đọc hr_job_posts: ' + e2.message);

    const byId = new Map((posts || []).map((p: { id: string }) => [p.id, p]));
    const now = new Date().toISOString();

    for (const item of items) {
      const p = byId.get(item.postId as string) as {
        id: string; tieu_de: string; noi_dung: string; trang_thai: string;
        image_url: string | null; scheduled_at: string | null; fb_post_id: string | null; kenh: string | null;
      } | undefined;
      if (!p) continue;
      // Worker này chỉ đăng Facebook. Bài LinkedIn do worker linkedin-publish lo.
      if (p.kenh && p.kenh !== 'facebook') continue;
      if (p.trang_thai === 'posted' || p.trang_thai === 'cancelled') continue;
      if (!p.noi_dung?.trim()) continue;
      // Đã có fb_post_id + scheduled = đã hẹn giờ qua Facebook API, FB tự đăng — bỏ qua.
      if (p.fb_post_id && p.trang_thai === 'scheduled') continue;
      // Chưa đến giờ thì bỏ qua, chờ lần tiếp theo.
      if (p.scheduled_at && p.scheduled_at > now) continue;

      try {
        const fbPostId = await postToFacebook(p);
        const externalUrl = `https://www.facebook.com/${fbPostId}`;
        const { error: updateErr } = await client.from('hr_job_posts')
          .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), url: externalUrl, fb_post_id: fbPostId, ghi_chu: null })
          .eq('id', p.id);
        if (updateErr) throw new Error('Lưu DB: ' + updateErr.message);
        published.push(p.tieu_de);
        try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'ok', detail: { postId: p.id, fbPostId, externalUrl } }); } catch {}
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError = firstError || msg;
        try { await client.from('hr_job_posts').update({ trang_thai: 'failed', ghi_chu: msg }).eq('id', p.id); } catch {}
        try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'error', detail: { postId: p.id, error: msg } }); } catch {}
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.publish_facebook', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ published: published.length, items: published, error: firstError });
}
