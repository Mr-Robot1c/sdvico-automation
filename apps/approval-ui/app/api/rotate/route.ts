import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// Lịch hàng ngày: sinh 1-2 bài từ ảnh/video trong kho theo VÒNG XOAY (mỗi tài sản dùng 1 lần
// mỗi vòng, hết thì sang vòng mới), đẩy vào approval_queue trạng thái pending.
// KHÔNG tự đăng — người bấm Duyệt mới đăng (điều cấm 1). Bảo vệ bằng CRON_SECRET.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PER_RUN = Number(process.env.ROTATE_PER_RUN) || 2;

function cleanName(s: string): string {
  return (s || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d{10,}[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: Request) {
  // Vercel Cron gửi Authorization: Bearer <CRON_SECRET>. Chặn gọi trái phép.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const client = getServerClient();

  // 1. Tài sản đủ điều kiện (ảnh + video), có tên, sắp theo thời gian tạo = số thứ tự.
  const { data: assetsRaw } = await client
    .from('brand_assets')
    .select('id, kind, title, created_at')
    .in('kind', ['image', 'video', 'logo', 'clip'])
    .order('created_at', { ascending: true });
  const pool = (assetsRaw || []).filter((a) => String((a as any).title || '').trim());
  if (!pool.length) return NextResponse.json({ ok: true, created: 0, note: 'kho rỗng' });

  // 2. Vòng hiện tại + tài sản đã dùng trong vòng (đọc từ mkt_content.brief đã gắn cờ rotation).
  const { data: contents } = await client
    .from('mkt_content')
    .select('brief')
    .order('created_at', { ascending: false })
    .limit(1000);
  let cycle = 1;
  const usedByCycle = new Map<number, Set<string>>();
  for (const c of contents || []) {
    const b = (c as any).brief || {};
    if (b.rotation && b.rotation_cycle && b.rotation_asset) {
      const cy = Number(b.rotation_cycle);
      cycle = Math.max(cycle, cy);
      if (!usedByCycle.has(cy)) usedByCycle.set(cy, new Set());
      usedByCycle.get(cy)!.add(String(b.rotation_asset));
    }
  }
  const usedThisCycle = usedByCycle.get(cycle) || new Set<string>();
  let unused = pool.filter((a) => !usedThisCycle.has((a as any).id));
  if (!unused.length) {
    cycle += 1; // hết vòng, bắt đầu vòng mới
    unused = [...pool];
  }

  // 3. Chọn ngẫu nhiên tối đa PER_RUN tài sản chưa dùng.
  const picked = [...unused].sort(() => Math.random() - 0.5).slice(0, PER_RUN);

  // @ts-ignore — module JS thuần
  const { generateContentAsync } = await import('../../../lib/gen/content.mjs');
  const results: any[] = [];
  for (const a of picked as any[]) {
    const keyword = cleanName(a.title);
    const isVideo = a.kind === 'video' || a.kind === 'clip';
    let draft = '';
    try {
      const gen = await generateContentAsync(
        { keyword, intent: 'giao_dich', landing_url: null },
        { assetHint: a.title, format: 'social' }
      );
      draft = (gen?.draft as string) || '';
    } catch {
      draft = '';
    }
    if (!draft.trim()) continue;

    const assets = isVideo ? { image: null, video: a.id } : { image: a.id, video: null };
    const { data: inserted, error: e1 } = await client
      .from('mkt_content')
      .insert({
        kind: 'social',
        title: keyword,
        brief: {
          keyword,
          intent: 'giao_dich',
          assets,
          generator: 'rotation',
          rotation: true,
          rotation_cycle: cycle,
          rotation_asset: a.id
        },
        draft,
        status: 'review'
      })
      .select('id')
      .single();
    if (e1 || !inserted) continue;
    const contentId = (inserted as { id: string }).id;
    await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `[Bài Facebook] ${keyword}`,
      payload: { content_id: contentId, format: 'social', keyword, intent: 'giao_dich', risk: 'amber', assets },
      status: 'pending'
    });
    results.push({ asset: a.title, contentId });
  }

  return NextResponse.json({ ok: true, cycle, created: results.length, results });
}
