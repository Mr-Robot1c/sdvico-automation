// Vercel Cron: đăng câu trả lời bình luận ĐÃ DUYỆT lên Facebook qua Graph API.
// Chỉ đăng mục approval_queue kind='fb_comment_reply' status='approved' (điều cấm 1).
// Bản song song của packages/hr/src/post/publish-comment-reply.mjs (chạy qua GitHub Actions).

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { assertNotStopped } from '../../../../lib/emergency-stop';
import { verifyCronAuth } from '../../../../lib/cron-auth';
import { checkAndIncrementDailyQuota, pauseBetweenPosts, createDeadLetterAlert } from '../../../../lib/publish-guards';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const MAX_ATTEMPTS = 3;
const DAILY_LIMIT = Number(process.env.HR_FB_COMMENT_REPLY_MAX_PER_DAY) || 30;

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const client = getServerClient();
  const published: string[] = [];
  let firstError: string | null = null;

  try {
    // P0-2: dừng khẩn phủ đường đăng bình luận (nguy cơ spam cao nếu chạy quá tay).
    await assertNotStopped(client);

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

    // P0-3: chống spam. Trước khi post, tra hr_fb_comments để bỏ qua các mục ĐÃ trả lời
    // hoặc đã fail đủ MAX_ATTEMPTS. Không có bước này, cron tick sau đọc lại approval_queue
    // 'approved' và đăng lại trả lời mỗi 15 phút.
    const commentIds = items.map((i) => i.commentId as string);
    const { data: commentRows } = await client
      .from('hr_fb_comments')
      .select('id, trang_thai, attempts')
      .in('id', commentIds);
    const stateById = new Map(
      (commentRows || []).map((r: { id: string; trang_thai: string; attempts: number | null }) => [r.id, r])
    );

    let postedThisRun = 0;

    for (const item of items) {
      const st = stateById.get(item.commentId as string) as { id: string; trang_thai: string; attempts: number | null } | undefined;
      if (st?.trang_thai === 'replied') {
        // Đã trả lời rồi → đóng approval_queue để lần sau không đọc lại.
        try { await client.from('approval_queue').update({ status: 'posted' }).eq('id', item.approvalId); } catch {}
        continue;
      }
      if (st?.trang_thai === 'failed' && (st.attempts ?? 0) >= MAX_ATTEMPTS) continue;

      // P1-7: trần trả lời bình luận mỗi ngày.
      const quota = await checkAndIncrementDailyQuota(client, {
        account: 'fb_comment_reply', kind: 'hr_fb_comment_reply', limit: DAILY_LIMIT,
      });
      if (!quota.allowed) {
        try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'ok', detail: { published: postedThisRun, reason: 'daily_limit', limit: DAILY_LIMIT } }); } catch {}
        break;
      }

      // P0-3: atomic claim. Chuyển 'new'|'failed' → 'replying'. Nếu 0 dòng thì có tay khác claim rồi.
      const { data: claimed, error: claimErr } = await client
        .from('hr_fb_comments')
        .update({ trang_thai: 'replying' })
        .eq('id', item.commentId as string)
        .in('trang_thai', ['new', 'draft', 'failed'])
        .select('id');
      if (claimErr) { firstError = firstError || claimErr.message; continue; }
      if (!claimed || claimed.length === 0) continue;

      if (postedThisRun > 0) await pauseBetweenPosts();

      try {
        const url = `https://graph.facebook.com/${VERSION}/${item.fbCommentId}/comments`;
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ message: item.replyText as string, access_token: token }), cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);

        await client.from('hr_fb_comments')
          .update({ trang_thai: 'replied', reply_text: item.replyText, replied_at: new Date().toISOString() })
          .eq('id', item.commentId as string);
        // P0-3: đóng approval_queue sau khi đăng thành công.
        try { await client.from('approval_queue').update({ status: 'posted' }).eq('id', item.approvalId); } catch {}
        published.push(item.commentId as string);
        postedThisRun += 1;
        try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'ok', detail: { commentId: item.commentId } }); } catch {}
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError = firstError || msg;
        const nextAttempts = (st?.attempts ?? 0) + 1;
        try {
          await client.from('hr_fb_comments')
            .update({ trang_thai: 'failed', attempts: nextAttempts })
            .eq('id', item.commentId as string);
        } catch {}
        try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'error', detail: { commentId: item.commentId, error: msg, attempts: nextAttempts } }); } catch {}
        if (nextAttempts >= MAX_ATTEMPTS) {
          try { await createDeadLetterAlert(client, { refTable: 'hr_fb_comments', refId: item.commentId as string, task: 'hr.publish_comment_reply', attempts: nextAttempts, error: msg }); } catch {}
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.publish_comment_reply', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ published: published.length, error: firstError });
}
