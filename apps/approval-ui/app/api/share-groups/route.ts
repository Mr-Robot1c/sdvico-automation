import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// Danh sách NHÓM Facebook dùng chung một nguồn: app_config 'mkt_share_groups'
// (user 20/8: nhóm lưu ở popover Quản lý bài viết phải khớp với lịch chia sẻ ở Kế hoạch —
// trước đây popover lưu localStorage riêng nên hai nơi lệch nhau).
// GET: trả { groups: [{id,label,url}] }. POST: ghi đè danh sách + làm mới đề xuất sống.
// Route nằm sau basic-auth? /api/* được middleware miễn basic-auth — nhưng dữ liệu nhóm
// không nhạy cảm (tên + link group công khai), và POST chỉ đổi app_config danh sách nhóm.
export const dynamic = 'force-dynamic';
// POST còn làm mới đề xuất sống (nhiều query) — nới thời gian chạy để lưu tên nhóm không
// bị đứt giữa chừng trên Vercel.
export const maxDuration = 60;

type SavedGroup = { id: string; label: string; url: string };

function normalize(raw: any): SavedGroup[] {
  const arr = Array.isArray(raw?.groups) ? raw.groups : Array.isArray(raw) ? raw : [];
  const out: SavedGroup[] = [];
  for (const g of arr) {
    if (typeof g === 'string') {
      const id = g.trim();
      if (id) out.push({ id, label: id, url: `https://www.facebook.com/groups/${id}` });
    } else if (g && typeof g === 'object' && g.id) {
      out.push({
        id: String(g.id).slice(0, 120),
        label: String(g.label || g.id).slice(0, 120),
        url: String(g.url || `https://www.facebook.com/groups/${g.id}`).slice(0, 300),
      });
    }
  }
  return out.slice(0, 12);
}

export async function GET() {
  const client = getServerClient();
  const { data } = await client.from('app_config').select('value').eq('key', 'mkt_share_groups').maybeSingle();
  return NextResponse.json({ groups: normalize((data as any)?.value) });
}

export async function POST(req: Request) {
  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'body khong phai JSON' }, { status: 400 }); }
  const groups = normalize(body);
  const client = getServerClient();
  const { error } = await client.from('app_config').upsert({
    key: 'mkt_share_groups',
    value: { groups, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Cập nhật đề xuất sống ngay để lịch chia sẻ theo ngày dùng nhóm mới.
  try {
    const { refreshLiveProposal } = await import('../../../lib/plan-live');
    await refreshLiveProposal(client);
  } catch (e: any) {
    console.error('[share-groups] refresh live loi:', e?.message || e);
  }
  return NextResponse.json({ ok: true, groups });
}
