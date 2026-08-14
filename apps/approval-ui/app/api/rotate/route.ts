import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { isEmergencyStopped } from '../../../lib/safety';

// Lịch hàng ngày: chọn NGẪU NHIÊN 1 folder sản phẩm (product_group) theo VÒNG XOAY
// (mỗi folder dùng 1 lần mỗi vòng, hết cả folder mới sang vòng mới), rồi sinh bài chờ duyệt:
//   Facebook: 1 ảnh (kèm video nếu folder có) — TikTok: 1 video (nếu folder có).
// KHÔNG tự đăng — người bấm Duyệt mới đăng (điều cấm 1). Bảo vệ bằng CRON_SECRET.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Số bài BÁN (theo folder sản phẩm) mỗi lần chạy. Mặc định 2. Ngoài ra mỗi lần còn sinh
// thêm 1 bài CONTENT (không bán, nuôi trang) -> tổng 2 bán + 1 content.
const FOLDERS_PER_RUN = Number(process.env.ROTATE_FOLDERS_PER_RUN) || 2;
// Bật/tắt bài content mỗi lần chạy.
const CONTENT_PER_RUN = process.env.ROTATE_CONTENT === '0' ? 0 : 1;

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

// Rút ngẫu nhiên có TRỌNG SỐ, không lặp lại. Folder trọng số cao dễ được chọn hơn.
// Dùng khi có kế hoạch đã áp: sản phẩm đang thắng được ưu tiên sinh bài (điều cấm 2: người bấm mới áp).
function weightedSample<T>(items: T[], weightOf: (x: T) => number, n: number): T[] {
  const pool = items.map((x) => ({ x, w: Math.max(0.0001, weightOf(x)) }));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    let total = 0;
    for (const p of pool) total += p.w;
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) { idx = i; break; }
    }
    out.push(pool[idx].x);
    pool.splice(idx, 1);
  }
  return out;
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

  // 3. Chọn FOLDERS_PER_RUN folder chưa dùng. Nếu có kế hoạch đã áp (trang Kế hoạch bấm
  //    "Áp dụng trọng số"), ưu tiên folder theo trọng số sản phẩm. Chưa áp thì chọn đều như cũ.
  const { data: appliedPlan } = await client
    .from('mkt_plans')
    .select('data')
    .eq('applied', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const weights = (((appliedPlan as any)?.data?.weights) || {}) as Record<string, number>;
  const hasWeights = Object.keys(weights).length > 0;
  const pickedFolders = hasWeights
    ? weightedSample(unused, (g) => weights[productName(g)] ?? 1, FOLDERS_PER_RUN)
    : shuffle(unused).slice(0, FOLDERS_PER_RUN);

  // @ts-ignore — module JS thuần
  const { generateSocialPost, generateContentPost } = await import('../../../lib/gen/social.mjs');

  const results: any[] = [];
  const skipped: any[] = [];

  for (const group of pickedFolders) {
    const f = folders.get(group)!;
    const name = productName(group);

    // MỘT bài mỗi folder, đăng CẢ HAI nền tảng: Facebook (ảnh, kèm video nếu có) + TikTok (video).
    // Folder không có video thì chỉ Facebook (TikTok bắt buộc video).
    const img = f.images.length ? pickRandom(f.images) : null;
    const vid = f.videos.length ? pickRandom(f.videos) : null;
    if (!img && !vid) {
      skipped.push({ group, reason: 'folder rong' });
      continue;
    }
    const channels = vid ? ['facebook', 'tiktok'] : ['facebook'];
    const assets = { image: img?.id || null, video: vid?.id || null };

    let gen: any;
    try {
      // Một text dùng cho cả hai kênh (kiểu Facebook, hợp cả TikTok).
      gen = await generateSocialPost({ productGroup: group, productName: name, channel: 'facebook', hasVideo: !!vid });
    } catch (e) {
      skipped.push({ group, reason: 'gen loi: ' + (e as any)?.message });
      continue;
    }
    const risk = gen.assessment?.risk || 'none';
    const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : name;
    const { data: inserted, error: e1 } = await client
      .from('mkt_content')
      .insert({
        kind: 'social',
        title: displayTitle,
        brief: {
          keyword: name,
          intent: 'giao_dich',
          assets,
          channels,
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
      skipped.push({ group, reason: 'insert content loi: ' + (e1 as any)?.message });
      continue;
    }
    const contentId = (inserted as { id: string }).id;
    const label = channels.length > 1 ? '[FB + TikTok]' : '[Facebook]';
    await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `${label} ${displayTitle}`,
      payload: { content_id: contentId, format: 'social', keyword: name, intent: 'giao_dich', risk, assets, channels, authored: 'ai' },
      status: 'pending',
    });
    results.push({ group, channels, contentId, risk });
  }

  // Bài CONTENT (không bán): 1 bài mỗi lần chạy, dùng 1 ảnh bất kỳ trong kho.
  for (let i = 0; i < CONTENT_PER_RUN; i++) {
    const allImgs = [...folders.values()].flatMap((f) => f.images);
    const media = allImgs.length ? pickRandom(allImgs) : null;
    if (!media) { skipped.push({ group: 'Bài content', reason: 'khong co anh' }); break; }
    let gen: any;
    try {
      gen = await generateContentPost({});
    } catch (e) {
      skipped.push({ group: 'Bài content', reason: 'gen loi: ' + (e as any)?.message });
      break;
    }
    const risk = gen.assessment?.risk || 'none';
    const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : 'Bài content';
    const assets = { image: media.id, video: null };
    const channels = ['facebook'];
    const { data: ins, error: ce } = await client
      .from('mkt_content')
      .insert({
        kind: 'social',
        title: displayTitle,
        brief: {
          keyword: 'Bài content',
          intent: 'thong_tin',
          assets,
          channels,
          generator: 'rotation',
          rotation: true,
          rotation_group: 'Bài content',
          post_kind: 'content',
          topic: gen.topic,
          content_type: 'tips',
        },
        draft: gen.text,
        status: 'review',
        needs_gov_review: risk === 'red',
      })
      .select('id')
      .single();
    if (ce || !ins) { skipped.push({ group: 'Bài content', reason: 'insert loi' }); break; }
    await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `[Facebook] 📰 ${displayTitle}`,
      payload: { content_id: (ins as { id: string }).id, format: 'social', keyword: 'Bài content', intent: 'thong_tin', risk, assets, channels, authored: 'ai', post_kind: 'content' },
      status: 'pending',
    });
    results.push({ group: 'Bài content', channels, contentId: (ins as { id: string }).id, risk });
  }

  return NextResponse.json({ ok: true, cycle, folders: pickedFolders, created: results.length, results, skipped });
}
