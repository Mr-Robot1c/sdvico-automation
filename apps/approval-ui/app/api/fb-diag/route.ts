import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// Soi lỗi đăng Facebook: trả về nhật ký thô (run_log) của các lần đăng, để xem VÌ SAO ảnh
// không vào được bình luận (phản hồi thô của Facebook nằm ở detail.commentDebug).
// Chỉ đọc, không đăng gì. Bảo vệ bằng CRON_SECRET giống route rotate.
// Dùng: /api/fb-diag?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const client = getServerClient();
  const { data, error } = await client
    .from('run_log')
    .select('task, status, detail, created_at')
    .in('task', ['mkt.publish_facebook_ui', 'mkt.publish_facebook'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: data?.length || 0, logs: data || [] });
}
