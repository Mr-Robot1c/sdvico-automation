// Webhook nhận bình luận công khai từ Facebook (field 'feed'). CHỈ ghi thô vào hr_fb_comments,
// KHÔNG soạn, KHÔNG đăng gì ở đây (điều cấm 1 — worker riêng lo soạn, người bấm Duyệt mới đăng).
// Xem docs/facebook-test-setup.md để biết cách cấu hình App trên developers.facebook.com:
// bật webhook, đăng ký field 'feed', điền Callback URL + Verify Token, subscribe App vào Page.
// KHÔNG đăng ký field 'messages' (Messenger) — cần thêm quyền pages_messaging + App Review riêng,
// nằm ngoài phạm vi bản này.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerClient } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

// Meta gọi GET một lần để xác minh endpoint khi cấu hình webhook trên Developer Console.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type FbChange = {
  field: string;
  value: {
    item?: string;
    verb?: string;
    comment_id?: string;
    post_id?: string;
    message?: string;
    from?: { id?: string; name?: string };
  };
};
type FbEntry = { id: string; changes?: FbChange[] };
type FbPayload = { object?: string; entry?: FbEntry[] };

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: FbPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad payload', { status: 400 });
  }

  const client = getServerClient();
  const comments: { fbCommentId: string; fbPostId: string; fromName: string | null; message: string | null; raw: unknown }[] = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'feed') continue;
      const v = change.value || {};
      if (v.item !== 'comment' || v.verb !== 'add') continue;
      if (!v.comment_id || !v.post_id) continue;
      comments.push({
        fbCommentId: v.comment_id,
        fbPostId: v.post_id,
        fromName: v.from?.name || null,
        message: v.message || null,
        raw: change,
      });
    }
  }

  for (const c of comments) {
    // Tìm hr_job_posts theo fb_post_id để gắn ngữ cảnh (không bắt buộc — comment vẫn lưu nếu không khớp).
    const { data: post } = await client.from('hr_job_posts').select('id').eq('fb_post_id', c.fbPostId).maybeSingle();

    // upsert theo fb_comment_id để Meta gửi trùng (webhook có thể lặp) không tạo bản ghi đôi.
    await client.from('hr_fb_comments').upsert(
      {
        job_post_id: post?.id || null,
        fb_comment_id: c.fbCommentId,
        fb_post_id: c.fbPostId,
        from_name: c.fromName,
        message: c.message,
        raw_payload: c.raw,
        trang_thai: 'new',
      },
      { onConflict: 'fb_comment_id', ignoreDuplicates: true }
    );
  }

  try {
    await client.from('run_log').insert({ task: 'hr.fb_webhook', status: 'ok', detail: { received: comments.length } });
  } catch {
    // eo
  }

  // Meta chỉ cần 200 nhanh. Trả sớm, không xử lý nặng (soạn trả lời) ở đây.
  return new Response('EVENT_RECEIVED', { status: 200 });
}
