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
  const startedAt = Date.now();
  const forced = new URL(req.url).searchParams.get('force') === '1';
  // Ghi run_log mỗi lần chạy (19/8: route này im lặng suốt, cron Vercel trượt 1 ngày mà không ai
  // biết vì không có nhật ký — y hệt bẫy metrics đã vá). Có log rồi thì trang Dữ liệu/BOT thấy được.
  const logRotate = async (status: 'ok' | 'skipped' | 'error', detail: any) => {
    try { await client.from('run_log').insert({ task: 'mkt.rotate', actor: 'cron', status, detail: { ...detail, ms: Date.now() - startedAt } }); } catch { /* bỏ qua */ }
  };

  // Dừng khẩn: không sinh bài mới khi công tắc bật (cổng an toàn Phần 5.4).
  if (await isEmergencyStopped(client)) {
    await logRotate('skipped', { reason: 'emergency_stop' });
    return NextResponse.json({ ok: true, created: 0, note: 'emergency_stop' });
  }

  // NHIP 2 DOT/NGAY (user 20/8): 8h sang = 2 bai BAN; 13h chieu = 1 bai ban + 1 content. Guard theo
  // SLOT (mỗi slot chỉ chạy 1 lần trong ngày VN). ?slot=sang|chieu de ep slot (Vercel cron truyen).
  // Khong co ?slot: giu hanh vi cu (guard 1 lan/ngay). ?force=1 bỏ mọi guard.
  const slotParam = (new URL(req.url).searchParams.get('slot') || '').toLowerCase();
  const slot: 'sang' | 'chieu' | null = slotParam === 'sang' ? 'sang' : slotParam === 'chieu' ? 'chieu' : null;
  const vn = new Date(Date.now() + 7 * 3600 * 1000);
  const dayStartIso = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600 * 1000).toISOString();
  if (!forced) {
    if (slot) {
      // Slot: dem bai tao trong slot nay hom nay (rotation_slot = slot).
      const { count: madeSlot } = await client
        .from('mkt_content')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', dayStartIso)
        .eq('brief->>generator', 'rotation')
        .eq('brief->>rotation_slot', slot);
      if (madeSlot && madeSlot > 0) {
        await logRotate('skipped', { reason: `da sinh slot ${slot} hom nay`, madeSlot, slot });
        return NextResponse.json({ ok: true, created: 0, note: `da sinh ${madeSlot} bai slot ${slot} hom nay` });
      }
    } else {
      // Khong truyen slot: dem tong bai hom nay (guard cu, cho cac tinh huong thu cong).
      const { count: madeToday } = await client
        .from('mkt_content')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', dayStartIso)
        .eq('brief->>generator', 'rotation');
      if (madeToday && madeToday > 0) {
        await logRotate('skipped', { reason: 'da sinh hom nay', madeToday });
        return NextResponse.json({ ok: true, created: 0, note: `da sinh ${madeToday} bai hom nay (guard 1 lan/ngay; ?force=1 de ep)` });
      }
    }
  }
  // So bai ban + co content theo slot. Slot sang: 2 ban, 0 content. Slot chieu: 1 ban + 1 content.
  const salesCount = slot === 'chieu' ? 1 : slot === 'sang' ? 2 : FOLDERS_PER_RUN;
  const contentCount = slot === 'sang' ? 0 : CONTENT_PER_RUN;

  // 1. Gom tư liệu đã gán folder theo product_group.
  //    videos = CLIP GỐC do người upload (loại video-pipeline đã dựng ra) — dùng để quyết
  //    có yêu cầu dựng video AI cho bài không: folder có clip thì dựng, chỉ ảnh thì thôi
  //    (user chốt 18/8: "folder sản phẩm có video thì ghép video AI, không thì thôi").
  const { data: assetsRaw } = await client
    .from('brand_assets')
    .select('id, kind, title, product_group, source')
    .not('product_group', 'is', null);
  type A = { id: string; kind: string; title: string; product_group: string; source?: string | null };
  const folders = new Map<string, { images: A[]; videos: A[] }>();
  for (const a of (assetsRaw || []) as A[]) {
    if (!folders.has(a.product_group)) folders.set(a.product_group, { images: [], videos: [] });
    const f = folders.get(a.product_group)!;
    if (a.kind === 'image') f.images.push(a);
    else if ((a.kind === 'video' || a.kind === 'clip') && a.source !== 'video-pipeline') f.videos.push(a);
  }
  // Folder 'Content' KHÔNG phải sản phẩm, chỉ chứa tư liệu cho bài content — loại khỏi vòng
  // xoay sinh bài bán. Bài content sẽ dùng ảnh trong folder này ở bước dưới.
  let eligible = [...folders.keys()].filter((g) => {
    if (g === 'Content') return false;
    const f = folders.get(g)!;
    return f.images.length || f.videos.length;
  });
  if (!eligible.length) {
    await logRotate('skipped', { reason: 'chua folder nao co tu lieu' });
    return NextResponse.json({ ok: true, created: 0, note: 'chưa folder nào có tư liệu (product_group)' });
  }

  // TẬP TRUNG SẢN PHẨM TUẦN (user 19/8: "tuần này up lọc dầu với lọc nước"). app_config key
  // 'mkt_focus' = { groups: [từ khoá/tên sản phẩm...], until: ISO, note }. Còn hạn -> vòng xoay
  // CHỈ lấy các folder khớp (khớp theo tên sản phẩm không STT, hoặc chứa từ khoá); hướng đi
  // kế hoạch không thuộc nhóm này cũng bỏ qua trong tuần. Không khớp folder nào -> bỏ qua focus,
  // ghi chú vào run_log để biết. Hết hạn -> tự trở lại vòng xoay đủ sản phẩm, không phải gỡ tay.
  const { data: focusRow } = await client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle();
  const focusVal = ((focusRow as any)?.value || {}) as { groups?: string[]; until?: string; note?: string };
  const focusKeys = (Array.isArray(focusVal.groups) ? focusVal.groups : []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const focusActive = focusKeys.length > 0 && (!focusVal.until || new Date(focusVal.until).getTime() > Date.now());
  let focusNote: string | null = null;
  if (focusActive) {
    const matched = eligible.filter((g) => {
      const name = productName(g).toLowerCase();
      return focusKeys.some((k) => name === k || name.includes(k) || g.toLowerCase().includes(k));
    });
    if (matched.length) { eligible = matched; focusNote = `focus: ${matched.map(productName).join(' + ')}`; }
    else focusNote = `focus KHONG khop folder nao (${focusKeys.join(', ')}) -> dung du san pham`;
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
  // Tuần TẬP TRUNG: lấy đủ MỌI sản phẩm trong focus mỗi lượt (user chốt đăng các sản phẩm đó
  // hằng ngày), không áp "đã dùng trong vòng" — trước đây mỗi lượt chỉ ra 1 sản phẩm, phải kích
  // 3 lần mới đủ (user 19/8: "tạo bài lâu quá").
  let unused = focusActive && focusNote?.startsWith('focus:') ? [...eligible] : eligible.filter((g) => !usedThisCycle.has(g));
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
  // dùng, bỏ qua để không lặp bài. Map suggestion.product -> folder qua guessGroup.
  // v3 (Creator A/B): mỗi lần chạy chỉ lấy MỘT suggestion, nhưng sinh CẶP 2 bài A/B cho nó
  // (A = góc từ tri thức, B = góc đối chứng). 2 bài bán + 1 bài content = đúng hạn mức 3/ngày.
  // Không có suggestion nào map được folder -> fallback vòng xoay cũ (2 folder, mỗi folder 1 bài).
  // v3.1 (18/8, user: "2 bài trùng nhau cùng 1 sản phẩm"): cặp A/B TÁCH 2 NGÀY. Mỗi lần chạy
  // chỉ sinh MỘT bản: hôm nay bản A (ghi pending_variant='B', chưa used_at), hôm sau ưu tiên
  // hướng đang chờ B -> sinh B rồi mới used_at. Trang không lặp sản phẩm trong ngày, Evaluator
  // vẫn so được cặp (cùng ab_pair_id). Bài bán từ kế hoạch: 1/ngày + 1 bài content.
  type Suggestion = {
    title: string; why: string; product: string; kind: string;
    sources?: string[]; needs_gov_review?: boolean; used_at?: string; pending_variant?: 'B'; a_at?: string;
    // Playbook 26/8: BOSS chốt sẵn chữ cảm xúc + dạng bài + hook nghịch lý cho mỗi hướng.
    emotion?: string; role?: string; hook?: string;
  };
  const allSuggestions: Suggestion[] = Array.isArray(appliedPlan?.data?.content_suggestions)
    ? appliedPlan!.data.content_suggestions
    : [];
  // User chốt 21/8 đêm: cặp A/B chạy TRONG CÙNG NGÀY — bản A slot SÁNG, bản B slot CHIỀU
  // (đổi lại quyết định tách 2 ngày 18/8; Evaluator có kết luận nhanh hơn, so cùng điều
  // kiện ngày). Slot sáng: ưu tiên B mồ côi (hôm trước lỡ nhịp), rồi mở hướng mới.
  //
  // 24/8 (user): slot CHIỀU trước đây CẤM mở hướng mới (chỉ pendingBs) — nhưng khi user áp
  // plan mới giữa buổi (plan cũ hết pendingB), chiều rỗng candidates → fallback random →
  // sinh sản phẩm NGOÀI plan (bug Ắc quy 24/8). Nới: chiều cũng có thể mở fresh khi hết
  // pendingB, để 100% bám plan; nhịp trôi thành "A chiều T2, B sáng T3" chấp nhận được vì
  // sáng mai pendingBs.filter đưa bản B đó lên đầu tiên → cặp vẫn đủ trong 24h.
  const pendingBs = allSuggestions.filter((s) => !s.used_at && s.pending_variant === 'B');
  const freshSugs = allSuggestions.filter((s) => !s.used_at && !s.pending_variant);
  // BOSS truyền cho Creator (user 21/8): hướng của sản phẩm trọng số cao (đang thắng) được
  // rút TRƯỚC — trước đây thứ tự hướng theo Gemini sinh, trọng số chỉ ảnh hưởng fallback
  // vòng xoay nên "đẩy mạnh SEA-40" mà toàn chạy hướng lọc dầu. Sort ổn định.
  const weightOfSug = (s: Suggestion) => {
    const g = (guessGroup as (t: string) => string | null)(s.product);
    return weights[productName(g || s.product)] ?? 1;
  };
  const freshSorted = [...freshSugs].sort((a, b) => weightOfSug(b) - weightOfSug(a));
  const candidateSuggestions = [...pendingBs, ...freshSorted];

  type PickedFolder = { group: string; suggestion?: Suggestion; suggestionIdx?: number; variant?: 'A' | 'B' };
  const pickedFolders: PickedFolder[] = [];
  const usedInThisRun = new Set<string>();
  // Khai bao skipped/results/logoActions SOM (24/8): fallback random block (~line 270) can
  // day skip reason "bo qua bai ban de bam plan" vao skipped[], nhung truoc kia const nay
  // khai bao sau day → build fail "used before its declaration". Dat cung 1 cho ngay day.
  const results: any[] = [];
  const skipped: any[] = [];
  const logoActions: any[] = []; // nhat ky auto-logo cho moi anh (stamped/kept/already/skip)
  for (const s of candidateSuggestions) {
    if (pickedFolders.length) break; // 1 hướng đi/run
    const guessed = (guessGroup as (t: string) => string | null)(s.product);
    // guessGroup trả NHÃN FOLDER đầy đủ KÈM STT ("6. Thiết bị lọc dầu SF-50") — phải strip
    // STT CẢ HAI vế mới khớp (bug bắt được khi chạy thật 18/8).
    //
    // 24/8 (user "vi sao plan noi SEA-40 ma sinh S-Tracking?"): TRUOC dung
    // `pool = pending_variant==='B' ? eligible : unused`. `unused` = folder chua dung
    // vong xoay -> bai SEA-40 sang som dung folder SEA-40 roi -> khi force chieu xu
    // suggestion "Nuoc ngot tren tau" (SEA-40, weight top) -> matchedFolder=undefined
    // -> nhay sang S-Tracking. Co che usedThisCycle thiet ke cho flow CU (random) de
    // dam bao da dang SP trong vong; flow plan-driven 2 suggestion cung SP van hop le.
    // Dung eligible cho ca A va B; usedInThisRun van chan pick trung folder trong 1 run.
    const pool = eligible;
    const matchedFolder = guessed
      ? pool.find((g) => productName(g).toLowerCase() === productName(guessed).toLowerCase() && !usedInThisRun.has(g))
      : null;
    if (!matchedFolder) continue;
    usedInThisRun.add(matchedFolder);
    const idx = allSuggestions.findIndex((x) => x === s);
    pickedFolders.push({ group: matchedFolder, suggestion: s, suggestionIdx: idx, variant: s.pending_variant === 'B' ? 'B' : 'A' });
  }
  // Không có suggestion -> vòng xoay/weights như cũ, mỗi folder 1 bài đơn.
  // 24/8 (user "100% theo kế hoạch tuần, không xàm xàm"): NẾU plan đã áp có weights
  // (BOSS đã chốt sản phẩm), fallback CHỈ pick từ folder có tên TRONG weights — chặn
  // hoàn toàn sản phẩm ngoài plan (bug Ắc quy 24/8: plan chỉ có SF-50 + SEA-40 nhưng
  // fallback random pick Ắc quy vì weights map dùng default 1). Nếu mọi folder trong
  // plan đã dùng vòng này → không sinh bài bán (chỉ log skip); thà thiếu 1 bài bán
  // còn hơn đăng bài ngoài kế hoạch.
  if (!pickedFolders.length) {
    let remaining = unused.filter((g) => !usedInThisRun.has(g));
    if (hasWeights) {
      const inPlan = remaining.filter((g) => weights[productName(g)] != null);
      if (!inPlan.length) {
        skipped.push({ reason: 'moi folder trong plan da dung vong nay — bo qua bai ban de bam plan', remaining: remaining.map((g) => productName(g)) });
      }
      remaining = inPlan;
    }
    const extra = hasWeights
      ? weightedSample(remaining, (g) => weights[productName(g)] ?? 1, salesCount)
      : shuffle(remaining).slice(0, salesCount);
    for (const g of extra) pickedFolders.push({ group: g });
  }

  // User 20/8: MOI DOT phai co it nhat 1 bai ban tu folder co CLIP NGUON (video AI dung duoc).
  // Neu pickedFolders khong co folder nao co clip, THAY 1 folder bang folder khac co clip (con trong
  // vong / trong eligible neu vong het). Giu ke hoach neu suggestion.product khop folder co clip.
  const hasClipFolder = (g: string) => (folders.get(g)?.videos.length || 0) > 0;
  if (pickedFolders.length && !pickedFolders.some((pf) => hasClipFolder(pf.group))) {
    const pool = (unused.length ? unused : eligible).filter((g) => hasClipFolder(g) && !usedInThisRun.has(g));
    if (pool.length) {
      const replacement = pickRandom(pool);
      // Uu tien thay folder khong-clip khong bam suggestion (bai fallback), giu bai bam ke hoach.
      const idx = pickedFolders.findIndex((pf) => !pf.suggestion) ;
      const swapAt = idx >= 0 ? idx : pickedFolders.length - 1;
      const old = pickedFolders[swapAt];
      pickedFolders[swapAt] = { group: replacement };
      usedInThisRun.delete(old.group); usedInThisRun.add(replacement);
    }
  }

  // @ts-ignore — module JS thuần
  const { generateSocialPost, generateContentPost } = await import('../../../lib/gen/social.mjs');
  // @ts-ignore — module JS thuần
  const { pickInsights } = await import('../../../lib/gen/insights.mjs');
  // Insight/painpoint đã dùng gần đây theo nhóm sản phẩm (30 bài gần nhất) -> chọn insight MỚI
  // cho mỗi bài, chống lặp thông điệp; bản B của cặp tự khác bản A vì A vừa lưu insight_id.
  const usedInsights = new Map<string, Set<string>>();
  try {
    const { data: recent } = await client
      .from('mkt_content').select('brief').eq('kind', 'social')
      .order('created_at', { ascending: false }).limit(30);
    for (const r of (recent || []) as any[]) {
      const g = r.brief?.rotation_group; const iid = r.brief?.insight_id;
      if (!g || !iid) continue;
      if (!usedInsights.has(g)) usedInsights.set(g, new Set());
      usedInsights.get(g)!.add(iid);
    }
  } catch { /* thiếu thì coi như chưa dùng insight nào */ }
  // @ts-ignore — module JS thuần
  const { ensureLogoForPost } = await import('../../../lib/gen/ensure-logo.mjs');

  // Track thay đổi suggestion trong run này (idx -> 'A' vừa sinh | 'B' vừa sinh), cuối vòng
  // update plan.data một lần: sinh A -> pending_variant='B'; sinh B -> used_at.
  const suggestionsTouched: Array<{ idx: number; variant: 'A' | 'B'; imgId: string }> = [];

  // Góc ĐỐI CHỨNG cho bản B của cặp A/B — cố ý khác hướng bản A (góc từ tri thức) để
  // Evaluator so được cách viết nào ăn khách hơn (flowchart v3: Creator viết 2 kịch bản A/B).
  const CONTRAST_ANGLES = [
    'nhấn tiết kiệm chi phí cụ thể cho mỗi chuyến biển rồi mời bà con liên hệ',
    'nhấn ra khơi an toàn, gia đình ở nhà yên tâm, rồi mời lắp đặt',
    'kể một tình huống thật ngoài khơi rồi dẫn vào sản phẩm, kết bằng mời gọi',
  ];

  for (const pf of pickedFolders) {
    const group = pf.group;
    const f = folders.get(group)!;
    const name = productName(group);
    const sug = pf.suggestion;
    // Có suggestion: đúng 1 biến thể (A hôm nay hoặc B hôm sau). Fallback vòng xoay cũ: bài đơn.
    const variants: Array<'A' | 'B' | null> = sug ? [pf.variant || 'A'] : [null];
    const pairId = sug && appliedPlan ? `${appliedPlan.id.slice(0, 8)}-s${pf.suggestionIdx}` : null;
    // Ảnh bản A đã dùng (lưu trong suggestion.a_image_id) để bản B lấy ảnh khác nếu folder có >1.
    const firstImgId: string | null = (sug as any)?.a_image_id || null;
    // Folder có CLIP GỐC mới yêu cầu dựng video AI; chỉ ảnh thì đăng bài ảnh, không dựng.
    const wantVideo = f.videos.length > 0;

    for (const variant of variants) {
      // Bản B ưu tiên ảnh KHÁC bản A (nếu folder có từ 2 ảnh) để cặp thử khác nhau cả hình.
      const pool: A[] = variant === 'B' && firstImgId && f.images.length > 1
        ? f.images.filter((i) => i.id !== firstImgId)
        : f.images;
      const img: A | null = pool.length ? pickRandom(pool) : null;
      if (!img) {
        skipped.push({ group, variant, reason: 'folder chua co anh - can upload it nhat 1 anh de rotate' });
        continue;
      }
      if (AUTO_LOGO) {
        try { logoActions.push({ group, ...(await ensureLogoForPost(client, img.id)) }); }
        catch (e) { logoActions.push({ group, action: 'error', reason: String((e as any)?.message || e) }); }
      }
      // YouTube: bat khi da cau hinh YOUTUBE_REFRESH_TOKEN (xem runbook YouTube). Chi them
      // vao channels khi folder co CLIP (video AI se dung ban doc video_v). Bai chi anh -> bo qua.
      const channels = ['facebook'];
      if (wantVideo && process.env.YOUTUBE_REFRESH_TOKEN) channels.push('youtube');
      const assets = { image: img.id, video: null };

      // A bám góc tri thức (sug.why + tiêu đề gợi ý). B dùng góc đối chứng, tự do tiêu đề.
      const angleOverride = sug
        ? (variant === 'A' ? sug.why : pickRandom(CONTRAST_ANGLES))
        : null;
      const preferredHeadline = sug && variant === 'A' ? sug.title : null;
      // Playbook 26/8: emotion + hook nghịch lý mất mát BOSS chốt sẵn cho ngày đó (theo lịch
      // tuần 2-2-1-1-1). Cả A và B đều dùng ĐÚNG chữ cảm xúc (chữ ngày nào ngày ấy), chỉ khác
      // nhau ở góc kể (why). Hook nghịch lý chỉ BOSS ra khi hướng thuộc dạng viral/seeding.
      const emotionOverride = sug?.emotion || null;
      const preferredHook = sug?.hook || null;
      // Chọn insight/painpoint MỚI cho nhóm này (né các insight đã dùng gần đây + đã dùng trong
      // chính run này) — mỗi bài xoáy vào một nỗi thật khác nhau (user 21/8: content phải có ý
      // nghĩa, không lặp). Nhóm chưa có insight trong thư viện -> null, bài viết như cũ.
      const usedSet = usedInsights.get(group) || new Set<string>();
      const chosenInsight = pickInsights(group, 1, [...usedSet])[0] || null;
      if (chosenInsight) { usedSet.add(chosenInsight.id); usedInsights.set(group, usedSet); }

      let gen: any;
      try {
        gen = await (generateSocialPost as any)({
          productGroup: group,
          productName: name,
          channel: 'facebook',
          hasVideo: false,
          angleOverride,
          preferredHeadline,
          emotionOverride,
          preferredHook,
          insight: chosenInsight,
          client,
        });
      } catch (e) {
        skipped.push({ group, variant, reason: 'gen loi: ' + (e as any)?.message });
        continue;
      }
      const risk = gen.assessment?.risk || 'none';
      // Nếu suggestion có needs_gov_review, ép cờ cho CẢ cặp (rule R3 trong ba-spec).
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
            rotation: true, rotation_slot: slot || null,
            rotation_cycle: cycle,
            rotation_group: group,
            // Insight/painpoint bài này xoáy vào (STMI) — để chống lặp + hiện cho người duyệt.
            ...(chosenInsight ? { insight_id: chosenInsight.id, insight_situation: chosenInsight.situation, insight_line: chosenInsight.insight } : {}),
            // Chỉ yêu cầu dựng video AI khi folder có clip gốc (SEA-40, SF-50, Ắc quy...).
            // Folder chỉ ảnh (S-Tracking, Thuraya, XT-Pro...) -> bài ảnh, không dựng.
            video_requested: wantVideo,
            // v2/v3: gắn suggestion + cặp A/B để Evaluator truy được và so sánh
            ...(sug ? {
              plan_id: appliedPlan?.id,
              suggestion_index: pf.suggestionIdx,
              suggestion_title: sug.title,
              suggestion_sources: sug.sources,
              ab_pair_id: pairId,
              ab_variant: variant,
            } : {}),
          },
          draft: gen.text,
          status: 'review',
          needs_gov_review: needsGov,
        })
        .select('id')
        .single();
      if (e1 || !inserted) {
        skipped.push({ group, variant, reason: 'insert content loi: ' + (e1 as any)?.message });
        continue;
      }
      const contentId = (inserted as { id: string }).id;
      // Không nhét A/B vào tiêu đề (user: "để title A/B kì lắm") — thông tin cặp nằm ở
      // payload.ab_variant, trang Hàng đợi hiện badge "🧪 Thử A/B" kín đáo.
      // Tiêu đề queue = tiêu đề bài, KHÔNG kèm tag ngoặc/kênh (user 18/8: sợ lỡ đăng kèm).
      // Kênh đăng đã có badge riêng trên card. Chỉ giữ ⚠️ khi cần duyệt cấp quản lý.
      const govBadge = forcedGov ? '⚠️ ' : '';
      await client.from('approval_queue').insert({
        kind: 'mkt_publish_content',
        title: `${govBadge}${displayTitle}`,
        payload: {
          content_id: contentId, format: 'social', keyword: name, intent: 'giao_dich',
          risk, assets, channels, authored: 'ai',
          ...(sug ? { from_plan_direction: true, suggestion_sources: sug.sources, ab_pair_id: pairId, ab_variant: variant } : {}),
        },
        status: 'pending',
      });
      results.push({ group, channels, contentId, risk, from_suggestion: !!sug, variant, video_requested: wantVideo });
      if (sug && typeof pf.suggestionIdx === 'number' && (variant === 'A' || variant === 'B')) {
        suggestionsTouched.push({ idx: pf.suggestionIdx, variant, imgId: img.id });
      }
    }
  }

  // Bài CONTENT (không bán): 1 bài mỗi lần chạy. Ảnh chọn SAU khi có chủ đề + tiêu đề, KHỚP
  // chủ đề (lib/gen/pick-image.mjs: folder sản phẩm được nhắc tới -> Unsplash theo từ khóa ->
  // mới tới folder 'Content'). User 18/8: "hỏi đáp thiết bị giám sát hành trình mà lấy ảnh
  // tàu cá chung chung".
  // @ts-ignore — module JS thuần
  const { pickImageForContent } = await import('../../../lib/gen/pick-image.mjs');
  // Ảnh đã dùng trong 14 NGÀY (mọi bài, kể cả bài bán) -> bài content né trùng (user 22/8:
  // "ảnh content không được trùng nhau trong 14 ngày"). Map id -> lần dùng gần nhất để khi
  // folder cạn ảnh mới thì lấy ảnh dùng lâu nhất.
  const recentlyUsedImages = new Map<string, string>();
  try {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data: recentRows } = await client
      .from('mkt_content').select('brief, created_at').gte('created_at', since)
      .order('created_at', { ascending: false }).limit(200);
    for (const r of (recentRows || []) as any[]) {
      const a = r.brief?.assets || {};
      const ids = [a.image, ...(Array.isArray(a.images) ? a.images : [])].filter((x) => typeof x === 'string');
      for (const id of ids) if (!recentlyUsedImages.has(id)) recentlyUsedImages.set(id, String(r.created_at || ''));
    }
  } catch { /* thiếu thì không né, vẫn chọn như cũ */ }
  for (let i = 0; i < contentCount; i++) {
    // Chọn CỤM CONTENT theo tỷ lệ đề xuất Phòng KD (tuần 5 bài content):
    //   qa=2, checklist=2, glossary=1, tip=1, engage=1, portrait=1, news=1 -> tổng 9 lượt/vòng.
    //   Weight cao = chọn dày. news/portrait vẫn xuất hiện nhưng ít hơn vì cần chuẩn bị thật.
    // @ts-ignore — module JS thuần
    const { CONTENT_TOPICS } = await import('../../../lib/gen/products.mjs');
    // portrait=1 (sếp chốt 19/8 qua user): bài chân dung viết HOÀN CHỈNH với nhân vật ĐIỂN HÌNH
    // (tên gọi thân mật + tuổi + địa phương + câu nói, không họ tên đầy đủ, không số liệu cá nhân)
    // để đăng ngay, KHÔNG để ô trống cho người điền tay nữa. Prompt ở lib/gen/social.mjs.
    // Bài portrait không cần duyệt cấp quản lý (không chạm quy định nhà nước); người duyệt vẫn đọc
    // thật + gắn ảnh thật trước khi duyệt (điều cấm 5). news=0: giữ tắt, dễ chạm quy định
    // (điều cấm 3), chỉ viết tay khi có nguồn chính thống.
    // portrait: 0 (24/8, user: "chân dung chả có mục đích gì") — bỏ khỏi vòng random, prompt giữ cho bài cũ.
    const KIND_WEIGHT: Record<string, number> = { qa: 2, checklist: 2, glossary: 1, tip: 1, engage: 1, portrait: 0, news: 0 };
    const kindTotal = Object.values(KIND_WEIGHT).reduce((a, b) => a + b, 0);
    let r = Math.random() * kindTotal;
    let chosenKind = 'qa';
    for (const [k, w] of Object.entries(KIND_WEIGHT)) { r -= w; if (r <= 0) { chosenKind = k; break; } }
    // v6 (20/8, user: "ghi rõ content gì"): KẾ HOẠCH SỐNG đã định loại content cho từng ngày
    // (daily_schedule[hôm nay].contentKind) — máy làm ĐÚNG loại kế hoạch ghi, hết cảnh trang
    // Kế hoạch nói một đằng máy sinh một nẻo. Không có lịch hôm nay -> giữ random theo weight.
    // Playbook 26/8: đọc thêm contentEmotion để bài content chạm đúng 1 trong 4 chữ playbook.
    let contentEmotionOverride: string | null = null;
    try {
      const { data: liveRow } = await client
        .from('mkt_plans').select('data').eq('data->>origin', 'live')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const todayVNs = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const todaySched = (liveRow as any)?.data?.daily_schedule?.find((d: any) => d.date === todayVNs);
      if (todaySched?.contentKind && KIND_WEIGHT[todaySched.contentKind] !== undefined) {
        chosenKind = todaySched.contentKind;
      }
      if (todaySched?.contentEmotion) contentEmotionOverride = String(todaySched.contentEmotion);
    } catch { /* giữ random */ }
    const topicsOfKind = (CONTENT_TOPICS as any[]).filter((t) => t.type === chosenKind);
    const chosenTopic = topicsOfKind.length ? pickRandom(topicsOfKind) : undefined;

    let gen: any;
    try {
      // @ts-ignore — generateContentPost là module JS thuần, TS không biết param topic.
      gen = await generateContentPost({ topic: chosenTopic, client, emotionOverride: contentEmotionOverride });
    } catch (e) {
      skipped.push({ group: 'Bài content', reason: 'gen loi: ' + (e as any)?.message });
      break;
    }
    const kind = gen.contentType || chosenKind;
    const risk = gen.assessment?.risk || 'none';
    // news + portrait CẦN người duyệt tay (news chạm quy định điều cấm 3; portrait cần điền tên thật).
    const needsGov = risk === 'red' || kind === 'news';
    // Nhãn queue theo loại cho người duyệt biết ngay đây là bài gì.
    const KIND_LABEL: Record<string, string> = {
      qa: '❓ Hỏi-Đáp', checklist: '📋 Checklist', glossary: '📖 Thuật ngữ', tip: '💡 Mẹo',
      engage: '💬 Hỏi bà con', portrait: '👤 Chân dung', news: '⚠️ Thời sự (chờ duyệt QL)',
    };
    const kindTag = KIND_LABEL[kind] || '📰';
    const displayTitle = (gen.headline && gen.headline.length >= 4) ? gen.headline : 'Bài content';

    // Chọn ảnh KHỚP chủ đề (sau khi đã biết chủ đề + tiêu đề).
    // 26/8 (sếp: "ảnh không liên quan"): truyền cả BODY bài để Gemini sinh keyword bám sự việc
    // (kim phun tắc, muối ăn mòn mạch...), không chung chung như trước.
    const picked = await (pickImageForContent as any)(client, folders, `${gen.topic || ''} ${displayTitle}`, recentlyUsedImages, gen.body || '');
    if (!picked?.id) { skipped.push({ group: 'Bài content', reason: 'khong co anh' }); break; }
    const media = { id: picked.id as string };
    // Đánh dấu ngay để bài content thứ 2 trong cùng lượt (nếu có) cũng không trùng.
    recentlyUsedImages.set(media.id, new Date().toISOString());
    // Auto-logo cho ảnh bài content (in-place, giữ nguyên id). Ảnh Unsplash mới tải cũng đóng logo.
    if (AUTO_LOGO) {
      try { logoActions.push({ group: 'Bài content', via: picked.via, ...(await ensureLogoForPost(client, media.id)) }); }
      catch (e) { logoActions.push({ group: 'Bài content', action: 'error', reason: String((e as any)?.message || e) }); }
    }

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
          rotation: true, rotation_slot: slot || null,
          rotation_group: 'Bài content',
          post_kind: 'content',
          topic: gen.topic,
          content_type: kind,
          image_via: picked.via,
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
      title: `${kindTag} ${displayTitle}`,
      payload: { content_id: (ins as { id: string }).id, format: 'social', keyword: 'Bài content', intent: 'thong_tin', risk, assets, channels, authored: 'ai', post_kind: 'content', content_type: kind, needs_manager_approval: needsGov },
      status: 'pending',
    });
    results.push({ group: 'Bài content', kind, channels, contentId: (ins as { id: string }).id, risk, needsGov });
  }

  // v3.1: cập nhật trạng thái hướng đi. Sinh A -> pending_variant='B' + a_image_id (để B lấy
  // ảnh khác); sinh B -> used_at (hướng này xong cả cặp). Cập nhật 1 lần cuối vòng.
  if (appliedPlan && suggestionsTouched.length) {
    const nowIso = new Date().toISOString();
    const updatedSuggestions = allSuggestions.map((s, i) => {
      const t = suggestionsTouched.find((x) => x.idx === i);
      if (!t) return s;
      if (t.variant === 'A') return { ...s, pending_variant: 'B' as const, a_image_id: t.imgId, a_at: nowIso };
      const { pending_variant: _pv, ...rest } = s as any;
      return { ...rest, used_at: nowIso };
    });
    const newData = { ...appliedPlan.data, content_suggestions: updatedSuggestions };
    await client.from('mkt_plans').update({ data: newData }).eq('id', appliedPlan.id);
  }

  // KÍCH DỰNG VIDEO NGAY khi có bài cần video (user 21/8: "bài lâu quá") — không chờ cron
  // GitHub 10 phút quét. Dispatch workflow video-build.yml trực tiếp; thiếu env/lỗi thì bỏ
  // qua, cron 10 phút vẫn là lưới an toàn.
  let videoTriggered = false;
  let videoTriggerError: string | null = null;
  if (results.some((r) => r.video_requested)) {
    try {
      const repo = process.env.GITHUB_REPO;
      const ghToken = process.env.GITHUB_TOKEN;
      if (repo && ghToken) {
        const gh = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/video-build.yml/dispatches`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ ref: 'main', inputs: { limit: '3' } }),
        });
        videoTriggered = gh.status === 204;
        // 21/8 tung dinh: env sai -> 404 im lang, bai treo 39 phut. Ghi ro ly do de lan sau
        // nhin run_log la biet ngay, khong phai do tay.
        if (!videoTriggered) {
          const txt = await gh.text().catch(() => '');
          videoTriggerError = `GitHub API ${gh.status}: ${txt.slice(0, 160)}`;
        }
      } else {
        videoTriggerError = 'thieu env GITHUB_REPO / GITHUB_TOKEN';
      }
    } catch (e) { videoTriggerError = String(e).slice(0, 160); /* cron 10 phut van quet */ }
  }

  await logRotate(results.length > 0 ? 'ok' : 'skipped', {
    created: results.length,
    folders: pickedFolders.map((pf) => pf.group),
    fromPlan: suggestionsTouched.length,
    focus: focusNote,
    videoTriggered,
    ...(videoTriggerError ? { videoTriggerError } : {}),
  });
  return NextResponse.json({
    ok: true, cycle,
    folders: pickedFolders.map((pf) => pf.group),
    created: results.length,
    suggestions_touched: suggestionsTouched.map((t) => ({ idx: t.idx, variant: t.variant })),
    results, skipped, logoActions
  });
}
