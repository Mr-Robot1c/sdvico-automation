import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// User 27/8: "video rac o Xuong san xuat / Kho tu lieu chi giu 1 video cuoi cung".
// Sau khi fix build-video.mjs cleanup old asset moi lan rebuild, van con orphan asset
// tu cac lan build TRUOC (khong bi cleanup). Route nay chay 1 shot:
// 1. Load tat ca brand_assets kind='video' product_group='Bài trend'.
// 2. Load tat ca mkt_content brief.assets.video_v / brief.assets.video.
// 3. Cac video "Bài trend" KHONG duoc reference = orphan -> xoa Storage + brand_assets row.
// 4. Neu 1 bai co CA video_v va video khac nhau -> xoa video (giu video_v vertical).
//
// GET /api/cleanup-trend-videos?secret=<CRON_SECRET>&dry=1 (dry-run mac dinh, chi truyen
//     dry=0 de xoa that).
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dryRun = url.searchParams.get('dry') !== '0';

  const client = getServerClient();

  const [assetsRes, contentsRes] = await Promise.all([
    client
      .from('brand_assets')
      .select('id, title, storage_path, created_at')
      .eq('kind', 'video')
      .eq('product_group', 'Bài trend')
      .order('created_at', { ascending: false }),
    client
      .from('mkt_content')
      .select('id, title, brief')
      .not('brief', 'is', null)
      .limit(2000),
  ]);

  const trendAssets = (assetsRes.data || []) as Array<{ id: string; title: string; storage_path: string; created_at: string }>;
  const contents = (contentsRes.data || []) as Array<{ id: string; title: string; brief: any }>;

  // Set asset ID duoc reference tu mkt_content brief.assets.video_v / video.
  const referencedIds = new Set<string>();
  for (const c of contents) {
    const a = c.brief?.assets || {};
    if (typeof a.video_v === 'string') referencedIds.add(a.video_v);
    if (typeof a.video === 'string') referencedIds.add(a.video);
  }

  // Orphan = asset khong duoc reference.
  const orphans = trendAssets.filter((a) => !referencedIds.has(a.id));

  const removed: Array<{ id: string; storage_path: string; title: string }> = [];
  const errors: string[] = [];

  if (!dryRun) {
    for (const a of orphans) {
      try {
        if (a.storage_path) {
          const { error: remErr } = await client.storage.from('brand-assets').remove([a.storage_path]);
          if (remErr) errors.push(`storage ${a.storage_path}: ${remErr.message}`);
        }
        const { error: delErr } = await client.from('brand_assets').delete().eq('id', a.id);
        if (delErr) { errors.push(`delete ${a.id}: ${delErr.message}`); continue; }
        removed.push({ id: a.id, storage_path: a.storage_path, title: a.title });
      } catch (e: any) {
        errors.push(`asset ${a.id}: ${String(e?.message || e).slice(0, 200)}`);
      }
    }
    try {
      await client.from('run_log').insert({
        task: 'mkt.cleanup_trend_videos', actor: 'user', status: 'ok',
        detail: { total: trendAssets.length, referenced: trendAssets.length - orphans.length, removed: removed.length, errors: errors.length },
      });
    } catch { /* bo qua */ }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    stats: {
      total_trend_assets: trendAssets.length,
      referenced_by_content: trendAssets.length - orphans.length,
      orphans_found: orphans.length,
      removed_count: removed.length,
      error_count: errors.length,
    },
    orphans: orphans.slice(0, 50).map((a) => ({ id: a.id, title: a.title, storage_path: a.storage_path, created_at: a.created_at })),
    removed: removed.slice(0, 50),
    errors: errors.slice(0, 20),
    message: dryRun
      ? `Dry run: se xoa ${orphans.length} orphan video trend (them &dry=0 de xoa that).`
      : `Da xoa ${removed.length}/${orphans.length} orphan video trend.`,
  });
}
