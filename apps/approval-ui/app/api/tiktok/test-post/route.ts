import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { postVideoToTikTok } from '../../../../lib/tiktok';

// Đăng THỬ 1 video lên TikTok để kiểm tra luồng Direct Post. Chưa audit nên video ra chế độ
// riêng tư (SELF_ONLY). Bảo vệ bằng CRON_SECRET. Dùng:
//   /api/tiktok/test-post?secret=<CRON_SECRET>&asset=<assetId tùy chọn>&caption=<tùy chọn>
// Không có asset thì lấy video mới nhất trong brand_assets.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  if (secret && url.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const client = getServerClient();
  const assetId = url.searchParams.get('asset');

  let asset: any = null;
  if (assetId) {
    const { data } = await client
      .from('brand_assets')
      .select('id, kind, title, storage_path')
      .eq('id', assetId)
      .maybeSingle();
    asset = data;
  } else {
    const { data } = await client
      .from('brand_assets')
      .select('id, kind, title, storage_path')
      .in('kind', ['video', 'clip'])
      .order('created_at', { ascending: false })
      .limit(1);
    asset = (data && data[0]) || null;
  }
  if (!asset) return NextResponse.json({ error: 'không tìm thấy video trong kho' }, { status: 404 });

  const videoUrl = client.storage.from('brand-assets').getPublicUrl(asset.storage_path).data.publicUrl;
  const caption = url.searchParams.get('caption') || `${asset.title || 'Video SDVICO'} — SDVICO nghề cá thịnh vượng`;

  const result = await postVideoToTikTok(client, { videoUrl, caption });

  // Ghi nhật ký để soi lại.
  try {
    await client.from('run_log').insert({
      task: 'mkt.tiktok_test_post',
      actor: 'test-post',
      status: result.ok ? 'ok' : 'error',
      detail: { assetId: asset.id, assetTitle: asset.title, caption, ...result }
    });
  } catch {
    /* bỏ qua lỗi ghi log */
  }

  return NextResponse.json({ asset: { id: asset.id, title: asset.title }, ...result });
}
