import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { pullFacebookInbox } from '../../../../lib/fb-inbox';

// Route pull tin nhắn Messenger từ Facebook Graph API (không scrape UI).
// Dùng token có scope pages_messaging (confirmed OK qua probe 27/8). Không phụ thuộc webhook
// Dev Mode restriction - server chủ động gọi API, lấy tin của mọi user.
//
// Chạy TAY: /api/facebook/inbox-pull?secret=<CRON_SECRET>
// Cron: gắn vào /api/mkt-metrics-pull (chạy 1h/lần) để tự động.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = getServerClient();
  const r = await pullFacebookInbox(client);

  try {
    await client.from('run_log').insert({
      task: 'mkt.fb_inbox_pull',
      actor: 'user',
      status: r.errors.length ? 'error' : 'ok',
      detail: { pulled: r.pulled, skipped: r.skipped, errors: r.errors.slice(0, 5) },
    });
  } catch { /* bo qua */ }

  return NextResponse.json({
    ok: r.errors.length === 0,
    pulled: r.pulled,
    skipped: r.skipped,
    errors: r.errors,
    msg: r.pulled ? `Đã pull ${r.pulled} tin nhắn mới (${r.skipped} tin đã có, bỏ qua).` : (r.errors.length ? `Lỗi: ${r.errors[0]}` : `Không có tin mới (${r.skipped} tin đã có từ trước).`),
  });
}
