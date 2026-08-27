import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// Clear video_requested=true trên các bài trend đang mắc kẹt trong Watcher local. User 27/8:
// bấm Sinh trend -> Watcher đòi brand_assets folder "Bài trend" -> fail exit 1 liên tục.
// Route này reset 1 lần, sau đó build-video.mjs 27/8 đã có skip cho bài trend nên không lặp lại.
//
// /api/clear-trend-video?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = getServerClient();
  const { data: trends } = await client
    .from('mkt_content')
    .select('id, brief, title')
    .eq('brief->>generator', 'trend')
    .eq('brief->>video_requested', 'true');
  const list = (trends || []) as any[];
  if (!list.length) return NextResponse.json({ ok: true, cleared: 0, msg: 'Không có bài trend nào đang chờ Watcher.' });

  const results: any[] = [];
  for (const c of list) {
    const newBrief = { ...(c.brief || {}), video_requested: false, video_note: 'Bài trend dùng tay bằng CapCut với URL Pexels trong video_scenes' };
    const { error } = await client.from('mkt_content').update({ brief: newBrief }).eq('id', c.id);
    results.push({ id: c.id, title: (c.title || '').slice(0, 60), ok: !error, error: error?.message });
  }

  return NextResponse.json({
    ok: true,
    cleared: results.filter((r) => r.ok).length,
    total: list.length,
    results,
    msg: `Đã clear ${results.filter((r) => r.ok).length}/${list.length} bài trend. Watcher local sẽ tự bỏ qua chúng.`,
  });
}
