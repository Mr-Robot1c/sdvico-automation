import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { isEmergencyStopped } from '../../../lib/safety';

// Lịch hàng ngày: chọn NGẪU NHIÊN 1 folder sản phẩm (product_group) theo VÒNG XOAY
// (mỗi folder dùng 1 lần mỗi vòng, hết cả folder mới sang vòng mới), rồi sinh bài chờ duyệt:
//   Facebook: 1 ảnh (kèm video nếu folder có) — TikTok: 1 video (nếu folder có).
// KHÔNG tự đăng — người bấm Duyệt mới đăng (điều cấm 1). Bảo vệ bằng CRON_SECRET.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Số folder mỗi lần chạy. Mặc định 3: sinh sẵn 3 sản phẩm/ngày để đăng ở 3 khung giờ
// (sáng/trưa/tối) bằng cách bấm Duyệt lúc đó (điều cấm 1: máy soạn, người bấm).
const FOLDERS_PER_RUN = Number(process.env.ROTATE_FOLDERS_PER_RUN) || 3;

// Bỏ tiền tố STT "5. " khỏi nhãn folder để lấy tên sản phẩm.
function productName(group: string): string {
  return (group || '').replace(/^\s*\d+\.\s*/, '').trim();
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export async function GET(req: Request) {
  // Vercel Cron gửi Authorization: Bearer <CRON_SECRET>. Chặn gọi trái phép.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const client = getServerClient();

  // Dừng khẩn: không sinh bài mới khi công tắc bật (cổng an toàn Phần 5.4).
  if (await isEmergencyStopped(client)) {
    return NextResponse.json({ ok: true, created: 0, note: 'emergency_stop' });
  }

  // 1. Gom tư liệu đã gán folder theo product_group.
  const { data: assetsRaw } = await client
    .from('brand_assets')
    .select('id, kind, title, product_group')
    .not('product_group', 'is', null);
  type A = { id: string; kind: string; title: string; product_group: string };
  const folders = new Map<string, { images: A[]; videos: A[] }>();
  for (const a of (assetsRaw || []) as A[]) {
    if (!folders.has(a.product_group)) folders.set(a.product_group, { images: [], videos: [] });
    const f = folders.get(a.product_group)!;
    if (a.kind === 'image') f.images.push(a);
    else if (a.kind === 'video' || a.kind === 'clip') f.videos.push(a);
  }
  const eligible = [...folders.keys()].filter((g) => {
    const f = folders.get(g)!;
    return f.images.length || f.videos.length;
  });
  if (!eligible.length) {
    return NextResponse.json({ ok: true, created: 0, note: 'chưa folder nào có tư liệu (product_group)' });
  }

  // 2. Vòng hiện tại + folder đã dùng trong vòng (đọc từ mkt_content.brief).
  const { data: contents } = await client
    .from('mkt_content')
    .select('brief')
    .order('created_at', { ascending: false })
    .limit(2000);
  let cycle = 1;
  const usedByCycle = new Map<number, Set<string>>();
  for (const c of contents || []) {
    const b = (c as any).brief || {};
    if (b.rotation && b.rotation_cycle && b.rotation_group) {
      const cy = Number(b.rotation_cycle);
      cycle = Math.max(cycle, cy);
      if (!usedByCycle.has(cy)) usedByCycle.set(cy, new Set());
      usedByCycle.get(cy)!.add(String(b.rotation_group));
    }
  }
  const usedThisCycle = usedByCycle.get(cycle) || new Set<string>();
  let unused = eligible.filter((g) => !usedThisCycle.has(g));
  if (!unused.length) {
    cycle += 1; // hết vòng, sang vòng mới
    unused = [...eligible];
  }

  // 3. Chọn ngẫu nhiên FOLDERS_PER_RUN folder chưa dùng.
  const pickedFolders = shuffle(unused).slice(0, FOLDERS_PER_RUN);

  // @ts-ignore — module JS thuần
  const { generateSocialPost } = await import('../../../lib/gen/social.mjs');

  const results: any[] = [];
  const skipped: any[] = [];

  for (const group of pickedFolders) {
    const f = folders.get(group)!;
    const name = productName(group);

    // Bài cho từng kênh: Facebook (ảnh, kèm video nếu có) và TikTok (video).
    const plan: { channel: string; assets: { image: string | null; video: string | null }; hasVideo: boolean }[] = [];
    const img = f.images.length ? pickRandom(f.images) : null;
    const vid = f.videos.length ? pickRandom(f.videos) : null;

    if (img || vid) {
      // Facebook: ưu tiên ảnh + video; không có ảnh thì dùng video.
      plan.push({ channel: 'facebook', assets: { image: img?.id || null, video: vid?.id || null }, hasVideo: !!vid });
    }
    if (vid) {
      // TikTok: chỉ cần video (chọn riêng để đa dạng nếu folder nhiều video).
      const tvid = pickRandom(f.videos);
      plan.push({ channel: 'tiktok', assets: { image: null, video: tvid.id }, hasVideo: true });
    } else {
      skipped.push({ group, reason: 'folder khong co video cho TikTok' });
    }

    for (const p of plan) {
      let gen: any;
      try {
        gen = await generateSocialPost({ productGroup: group, productName: name, channel: p.channel, hasVideo: p.hasVideo });
      } catch (e) {
        skipped.push({ group, channel: p.channel, reason: 'gen loi: ' + (e as any)?.message });
        continue;
      }
      const risk = gen.assessment?.risk || 'none';
      const { data: inserted, error: e1 } = await client
        .from('mkt_content')
        .insert({
          kind: 'social',
          title: name,
          brief: {
            keyword: name,
            intent: 'giao_dich',
            assets: p.assets,
            channels: [p.channel],
            generator: 'rotation',
            rotation: true,
            rotation_cycle: cycle,
            rotation_group: group,
          },
          draft: gen.text,
          status: 'review',
          needs_gov_review: risk === 'red',
        })
        .select('id')
        .single();
      if (e1 || !inserted) {
        skipped.push({ group, channel: p.channel, reason: 'insert content loi: ' + (e1 as any)?.message });
        continue;
      }
      const contentId = (inserted as { id: string }).id;
      const label = p.channel === 'tiktok' ? '[Bài TikTok]' : '[Bài Facebook]';
      await client.from('approval_queue').insert({
        kind: 'mkt_publish_content',
        title: `${label} ${name}`,
        payload: {
          content_id: contentId,
          format: 'social',
          keyword: name,
          intent: 'giao_dich',
          risk,
          assets: p.assets,
          channels: [p.channel],
        },
        status: 'pending',
      });
      results.push({ group, channel: p.channel, contentId, risk });
    }
  }

  return NextResponse.json({ ok: true, cycle, folders: pickedFolders, created: results.length, results, skipped });
}
