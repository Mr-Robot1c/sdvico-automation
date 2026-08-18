// Vercel Cron: đăng câu trả lời bình luận ĐÃ DUYỆT lên Facebook qua Graph API.
// Chỉ đăng mục approval_queue kind='fb_comment_reply' status='approved' (điều cấm 1).
// Bản song song của packages/hr/src/post/publish-comment-reply.mjs (chạy qua GitHub Actions).

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

function verifyAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!verifyAuth(req)) return new Response('Unauthorized', { status: 401 });

  const client = getServerClient();
  const published: string[] = [];
  let firstError: string | null = null;

  try {
    const { data: approved, error: e1 } = await client
      .from('approval_queue')
      .select('id, payload')
      .eq('kind', 'fb_comment_reply')
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    if (e1) throw new Error('Đọc approval_queue: ' + e1.message);

    const items = (approved || [])
      .map((a: { id: string; payload: Record<string, unknown> }) => ({
        approvalId: a.id,
        commentId: a.payload?.comment_id as string | undefined,
        fbCommentId: a.payload?.fb_comment_id as string | undefined,
        replyText: (a.payload?.reply_text as string | undefined) || (a.payload?.goi_y_tra_loi as string | undefined),
      }))
      .filter((i) => i.commentId && i.fbCommentId && i.replyText);

    if (items.length === 0) {
      try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'ok', detail: { published: 0, reason: 'no_approved' } }); } catch {}
      return NextResponse.json({ published: 0 });
    }

    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!token) throw new Error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN.');

    for (const item of items) {
      try {
        const url = `https://graph.facebook.com/${VERSION}/${item.fbCommentId}/comments`;
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ message: item.replyText as string, access_token: token }), cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);

        await client.from('hr_fb_comments')
          .update({ trang_thai: 'replied', reply_text: item.replyText, replied_at: new Date().toISOString() })
          .eq('id', item.commentId as string);
        published.push(item.commentId as string);
        try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'ok', detail: { commentId: item.commentId } }); } catch {}
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError = firstError || msg;
        try { await client.from('hr_fb_comments').update({ trang_thai: 'failed' }).eq('id', item.commentId as string); } catch {}
        try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'error', detail: { commentId: item.commentId, error: msg } }); } catch {}
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ published: published.length, error: firstError });
}
