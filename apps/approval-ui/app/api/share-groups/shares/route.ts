import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { isAuthorizedApiRequest } from '../../../../lib/session-auth';
import { computeShareLot, todayVNDate } from '../../../../lib/share-lot';

// Lượt người chia bài vào group (Thanh 11/9). Máy KHÔNG đăng gì lên Facebook (điều cấm 1, Groups API
// đã đóng); route này chỉ ghi/đọc sổ mkt_group_shares và tính "lô hôm nay".
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contentId = (url.searchParams.get('content_id') || '').trim() || null;
  const client = getServerClient();
  const lot = await computeShareLot(client, { contentId });
  return NextResponse.json(lot);
}

export async function POST(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) return NextResponse.json({ error: 'can dang nhap' }, { status: 401 });
  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'body khong phai JSON' }, { status: 400 }); }
  const groupId = String(body?.group_id || '').trim().slice(0, 120);
  const contentId = String(body?.content_id || '').trim() || null;
  const postUrl = String(body?.post_url || '').trim().slice(0, 300) || null;
  const groupLabel = String(body?.group_label || '').trim().slice(0, 120) || null;
  if (!groupId) return NextResponse.json({ error: 'thieu group_id' }, { status: 400 });
  const client = getServerClient();
  const date = todayVNDate();
  const dayStartIso = new Date(date + 'T00:00:00+07:00').toISOString();
  // Chặn trùng: cùng bài + cùng group trong ngày thì trả dòng cũ.
  let dup = client.from('mkt_group_shares').select('id, content_id, group_id, group_label, post_url, shared_at').eq('group_id', groupId).gte('shared_at', dayStartIso).limit(1);
  dup = contentId ? dup.eq('content_id', contentId) : dup.is('content_id', null);
  const { data: old } = await dup.maybeSingle();
  if (old) return NextResponse.json({ ok: true, row: old, duplicate: true });
  const { data: row, error } = await client
    .from('mkt_group_shares')
    .insert({ content_id: contentId, group_id: groupId, group_label: groupLabel, post_url: postUrl, shared_by: 'nguoi-bam', source: 'popover' })
    .select('id, content_id, group_id, group_label, post_url, shared_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { await client.from('run_log').insert({ task: 'mkt.group_share', actor: 'nguoi-bam', status: 'ok', detail: { content_id: contentId, group_id: groupId, group_label: groupLabel } }); } catch { /* bỏ qua */ }
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) return NextResponse.json({ error: 'can dang nhap' }, { status: 401 });
  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'body khong phai JSON' }, { status: 400 }); }
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'thieu id' }, { status: 400 });
  const client = getServerClient();
  const { error } = await client.from('mkt_group_shares').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { await client.from('run_log').insert({ task: 'mkt.group_share', actor: 'nguoi-bam', status: 'ok', detail: { undo: id } }); } catch { /* bỏ qua */ }
  return NextResponse.json({ ok: true });
}
