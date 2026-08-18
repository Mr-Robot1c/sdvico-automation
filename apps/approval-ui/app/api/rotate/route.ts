import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { isEmergencyStopped } from '../../../lib/safety';
// @ts-ignore
import { guessGroup } from '../../../lib/gen/products.mjs';

// Lịch hàng ngày: chọn NGẪU NHIÊN 1 folder sản phẩm (product_group) theo VÒNG XOAY
// (mỗi folder dùng 1 lần mỗi vòng, hết cả folder mới sang vòng mới), rồi sinh bài chờ duyệt:
//   Facebook: 1 ảnh (kèm video nếu folder có) — TikTok: 1 video (nếu folder có).
// KHÔNG tự đăng — người bấm Duyệt mới đăng (điều cấm 1). Bảo vệ bằng CRON_SECRET.
//
// v2 (18/8/2026): Nếu Kế hoạch đã áp có content_suggestions[] (hướng đi tuần tới sinh
// từ tri thức nội bộ + public), rotate ƯU TIÊN chọn theo suggestion chưa dùng trong tuần:
// suggestion.product -> map ra folder qua guessGroup, suggestion.kind + why + title truyền
// vào generateSocialPost/generateContentPost để bài đăng bám đúng hướng đi tuần. Track
// used_at trong plan.data.content_suggestions[i]. Hết suggestion mới fallback random như cũ.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Số bài BÁN (theo folder sản phẩm) mỗi lần chạy. Mặc định 2. Ngoài ra mỗi lần còn sinh
// thêm 1 bài CONTENT (không bán, nuôi trang) -> tổng 2 bán + 1 content.
const FOLDERS_PER_RUN = Number(process.env.ROTATE_FOLDERS_PER_RUN) || 2;
// Bật/tắt bài content mỗi lần chạy.
const CONTENT_PER_RUN = process.env.ROTATE_CONTENT === '0' ? 0 : 1;
// Tự đóng logo SDVICO lên ảnh của bài (kiểm tra ảnh đã có logo chưa rồi mới đóng). Tắt: ROTATE_AUTO_LOGO=0.
const AUTO_LOGO = process.env.ROTATE_AUTO_LOGO !== '0';

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
  // Folder 'Content' KHÔNG phải sản phẩm, chỉ chứa tư liệu cho bài content — loại khỏi vòng
  // xoay sinh bài bán. Bài content sẽ dùng ảnh trong folder này ở bước dưới.
  const eligible = [...folders.keys()].filter((g) => {
    if (g === 'Content') return false;
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
  const { data: appliedPlanRaw } = await client
    .from('mkt_plans')
    .select('id, data')
    .eq('applied', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const appliedPlan = appliedPlanRaw as { id: string; data: any } | null;
  const weights = ((appliedPlan?.data?.weights) || {}) as Record<string, number>;
  const hasWeights = Object.keys(weights).length > 0;

  // v2: đọc content_suggestions chưa dùng từ plan đã áp. Suggestion nào có `used_at` là đã
  // dùng, bỏ qua để không lặp bài. Map suggestion.product -> folder qua guessGroup (dedup).
  type Suggestion = {
    title: string; why: string; product: string; kind: string;
    sources?: string[]; needs_gov_review?: boolean; used_at?: string;
  };
  const allSuggestions: Suggestion[] = Array.isArray(appliedPlan?.data?.content_suggestions)
    ? appliedPlan!.data.content_suggestions
    : [];
  const unusedSuggestions = allSuggestions.filter((s) => !s.used_at);

  // Với mỗi suggestion chưa dùng, tìm folder khớp qua guessGroup. Suggestion không map được
  // (product không có folder ảnh) -> bỏ qua, dùng random cho slot còn lại.
  type PickedFolder = { group: string; suggestion?: Suggestion; suggestionIdx?: number };
  const pickedFolders: PickedFolder[] = [];
  const usedInThisRun = new Set<string>();
  for (const s of unusedSuggestions) {
    if (pickedFolders.length >= FOLDERS_PER_RUN) break;
    const guessed = (guessGroup as (t: string) => string | null)(s.product);
    // guessGroup trả về nhãn không có STT; đối chiếu với folder thật (có STT).
    const matchedFolder = guessed
      ? unused.find((g) => productName(g).toLowerCase() === guessed.toLowerCase() && !usedInThisRun.has(g))
      : null;
    if (!matchedFolder) continue;
    usedInThisRun.add(matchedFolder);
    const idx = allSuggestions.findIndex((x) => x === s);
    pickedFolders.push({ group: matchedFolder, suggestion: s, suggestionIdx: idx });
  }
  // Lấp chỗ còn lại bằng vòng xoay/weights như cũ.
  if (pickedFolders.length < FOLDERS_PER_RUN) {
    const remaining = unused.filter((g) => !usedInThisRun.has(g));
    const need = FOLDERS_PER_RUN - pickedFolders.length;
    const extra = hasWeights
      ? weightedSample(remaining, (g) => weights[productName(g)] ?? 1, need)
      : shuffle(remaining).slice(0, need);
    for (const g of extra) pickedFolders.push({ group: g });
  }

  // @ts-ignore — module JS thuần
  const { generateSocialPost, generateContentPost } = await import('../../../lib/gen/social.mjs');
  // @ts-ignore — module JS thuần
  const { ensureLogoForPost } = await import('../../../lib/gen/ensure-logo.mjs');

  const results: any[] = [];
  const skipped: any[] = [];
  const logoActions: any[] = []; // nhật ký auto-logo cho mỗi ảnh (stamped/kept/already/skip)

  // Track suggestions vừa dùng trong run này, cuối vòng update lại plan.data một lần.
  const suggestionsUsedThisRun: number[] = [];

  for (const pf of pickedFolders) {
    const group = pf.group;
    const f = folders.get(group)!;
    const name = productName(group);
    const sug = pf.suggestion;

    const img = f.images.length ? pickRandom(f.images) : null;
    if (!img) {
      skipped.push({ group, reason: 'folder chua co anh - can upload it nhat 1 anh de rotate' });
      continue;
    }
    if (AUTO_LOGO) {
      try { logoActions.push({ group, ...(await ensureLogoForPost(client, img.id)) }); }
      catch (e) { logoActions.push({ group, action: 'error', reason: String((e as any)?.message || e) }); }
    }
    const channels = ['facebook'];
    const assets = { image: img.id, video: null };

    // Nếu có suggestion cho slot này, truyền angleOverride (why) và preferredHeadline (title)
    // vào generateSocialPost để bài bám hướng đi tuần thay vì góc random.
    let gen: any;
    try {
      gen = await (generateSocialPost as any)({
        productGroup: group,
        productName: name,
        channel: 'facebook',
        hasVideo: false,
        angleOverride: sug?.why ?? null,
        preferredHeadline: sug?.title ?? null,
      });
    } catch (e) {
      skipped.push({ group, reason: 'gen loi: ' + (e as any)?.message });
      continue;
    }
    const risk = gen.assessment?.risk || 'none';
    // Nếu suggestion có needs_gov_review, ép cờ cho bài luôn (rule R3 trong ba-spec).
    const forcedGov = !!sug?.needs_gov_review;
    const needsGov = risk === 'red' || forcedGov;
    const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : (sug?.title || name);
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
          video_requested: true,
          // v2: gắn suggestion đã dùng để truy được bài này đến từ hướng đi nào
          ...(sug ? {
            plan_id: appliedPlan?.id,
            suggestion_index: pf.suggestionIdx,
            suggestion_title: sug.title,
            suggestion_sources: sug.sources,
          } : {}),
        },
        draft: gen.text,
        status: 'review',
        needs_gov_review: needsGov,
      })
      .select('id')
      .single();
    if (e1 || !inserted) {
      skipped.push({ group, reason: 'insert content loi: ' + (e1 as any)?.message });
      continue;
    }
    const contentId = (inserted as { id: string }).id;
    // Nhãn có prefix 🎯 khi bài bám hướng đi kế hoạch, để người duyệt biết ngay.
    const prefix = sug ? '🎯 ' : '';
    const label = channels.length > 1 ? '[FB + TikTok]' : '[Facebook]';
    const govBadge = forcedGov ? ' ⚠️' : '';
    await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `${prefix}${label}${govBadge} ${displayTitle}`,
      payload: {
        content_id: contentId, format: 'social', keyword: name, intent: 'giao_dich',
        risk, assets, channels, authored: 'ai',
        ...(sug ? { from_plan_direction: true, suggestion_sources: sug.sources } : {}),
      },
      status: 'pending',
    });
    results.push({ group, channels, contentId, risk, from_suggestion: !!sug });
    if (sug && typeof pf.suggestionIdx === 'number') suggestionsUsedThisRun.push(pf.suggestionIdx);
  }

  // Bài CONTENT (không bán): 1 bài mỗi lần chạy. Ưu tiên ảnh trong folder 'Content'
  // (ảnh biển, cảnh làng chài, đời sống ngư dân); trống thì fallback ảnh bất kỳ.
  for (let i = 0; i < CONTENT_PER_RUN; i++) {
    const contentFolder = folders.get('Content');
    const contentImgs = contentFolder?.images || [];
    const fallbackImgs = [...folders.values()].flatMap((f) => f.images);
    const poolImgs = contentImgs.length ? contentImgs : fallbackImgs;
    const media = poolImgs.length ? pickRandom(poolImgs) : null;
    if (!media) { skipped.push({ group: 'Bài content', reason: 'khong co anh' }); break; }
    // Auto-logo cho ảnh bài content (in-place, giữ nguyên id).
    if (AUTO_LOGO && media) {
      try { logoActions.push({ group: 'Bài content', ...(await ensureLogoForPost(client, media.id)) }); }
      catch (e) { logoActions.push({ group: 'Bài content', action: 'error', reason: String((e as any)?.message || e) }); }
    }
    // Chọn CỤM CONTENT theo tỷ lệ đề xuất Phòng KD (tuần 5 bài content):
    //   qa=2, checklist=2, glossary=1, tip=1, engage=1, portrait=1, news=1 -> tổng 9 lượt/vòng.
    //   Weight cao = chọn dày. news/portrait vẫn xuất hiện nhưng ít hơn vì cần chuẩn bị thật.
    // @ts-ignore — module JS thuần
    const { CONTENT_TOPICS } = await import('../../../lib/gen/products.mjs');
    // portrait=0, news=0: TẮT hai cụm này khỏi rotate. Portrait cần người thật + xin phép,
    // news dễ chạm quy định. Cả hai CHỈ được viết tay khi có tư liệu thật (điều cấm 5, dieu cam 3).
    const KIND_WEIGHT: Record<string, number> = { qa: 2, checklist: 2, glossary: 1, tip: 1, engage: 1, portrait: 0, news: 0 };
    const kindTotal = Object.values(KIND_WEIGHT).reduce((a, b) => a + b, 0);
    let r = Math.random() * kindTotal;
    let chosenKind = 'qa';
    for (const [k, w] of Object.entries(KIND_WEIGHT)) { r -= w; if (r <= 0) { chosenKind = k; break; } }
    const topicsOfKind = (CONTENT_TOPICS as any[]).filter((t) => t.type === chosenKind);
    const chosenTopic = topicsOfKind.length ? pickRandom(topicsOfKind) : undefined;

    let gen: any;
    try {
      // @ts-ignore — generateContentPost là module JS thuần, TS không biết param topic.
      gen = await generateContentPost({ topic: chosenTopic });
    } catch (e) {
      skipped.push({ group: 'Bài content', reason: 'gen loi: ' + (e as any)?.message });
      break;
    }
    const kind = gen.contentType || chosenKind;
    const risk = gen.assessment?.risk || 'none';
    // news + portrait CẦN người duyệt tay (news chạm quy định điều cấm 3; portrait cần điền tên thật).
    const needsGov = risk === 'red' || kind === 'news' || kind === 'portrait';
    // Nhãn queue theo loại cho người duyệt biết ngay đây là bài gì.
    const KIND_LABEL: Record<string, string> = {
      qa: '❓ Hỏi-Đáp', checklist: '📋 Checklist', glossary: '📖 Thuật ngữ', tip: '💡 Mẹo',
      engage: '💬 Hỏi bà con', portrait: '👤 Chân dung (điền tay)', news: '⚠️ Thời sự (chờ duyệt QL)',
    };
    const kindTag = KIND_LABEL[kind] || '📰';
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
          content_type: kind,
        },
        draft: gen.text,
        status: 'review',
        needs_gov_review: needsGov,
      })
      .select('id')
      .single();
    if (ce || !ins) { skipped.push({ group: 'Bài content', reason: 'insert loi' }); break; }
    await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `[Facebook] ${kindTag} ${displayTitle}`,
      payload: { content_id: (ins as { id: string }).id, format: 'social', keyword: 'Bài content', intent: 'thong_tin', risk, assets, channels, authored: 'ai', post_kind: 'content', content_type: kind, needs_manager_approval: needsGov },
      status: 'pending',
    });
    results.push({ group: 'Bài content', kind, channels, contentId: (ins as { id: string }).id, risk, needsGov });
  }

  // v2: đánh dấu suggestions vừa dùng để lần rotate sau không lặp. Cập nhật 1 lần cuối vòng.
  if (appliedPlan && suggestionsUsedThisRun.length) {
    const nowIso = new Date().toISOString();
    const updatedSuggestions = allSuggestions.map((s, i) =>
      suggestionsUsedThisRun.includes(i) ? { ...s, used_at: nowIso } : s
    );
    const newData = { ...appliedPlan.data, content_suggestions: updatedSuggestions };
    await client.from('mkt_plans').update({ data: newData }).eq('id', appliedPlan.id);
  }

  return NextResponse.json({
    ok: true, cycle,
    folders: pickedFolders.map((pf) => pf.group),
    created: results.length,
    used_suggestions: suggestionsUsedThisRun.length,
    results, skipped, logoActions
  });
}
