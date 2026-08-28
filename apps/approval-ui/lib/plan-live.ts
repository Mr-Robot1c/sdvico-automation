// lib/plan-live.ts — ĐỀ XUẤT SỐNG của AI Planner (BOSS), user chốt 20/8.
//
// Nhịp mới (user chốt): BOSS "tự cập nhật đề xuất rồi mỗi tối áp dụng, cuối tuần báo cáo".
//   - MỖI 30 PHÚT (cron mkt-metrics-pull): refreshLiveProposal đọc số liệu mới nhất, tính
//     trọng số + số bài mỗi sản phẩm + lịch theo NGÀY (sản phẩm nào mấy bài, chia sẻ nhóm nào),
//     lưu vào MỘT bản đề xuất 'live' (origin='live', applied=false, cập nhật tại chỗ, không
//     đầy lịch sử). KHÔNG gọi Gemini (rẻ, chạy dày được).
//   - MỖI TỐI (>=19h VN, 1 lần/ngày): applyLiveEvening GỘP trọng số + lịch + nhóm của bản 'live'
//     VÀO bản đang áp (giữ nguyên content_suggestions/hướng đi A/B của BOSS — không phá luồng
//     sinh bài). Hôm sau vòng xoay dùng trọng số mới.
//   - CUỐI TUẦN: báo cáo tuần ở /do-luong/tuan (item 1a) + đề xuất Chủ nhật (learn-weekly).
//
// Lịch theo ngày + nhóm chia sẻ CHỈ để hiển thị cho người làm; rotate không đọc (rotate vẫn
// chạy theo slot + focus + weights). Nhóm chia sẻ lấy từ app_config 'mkt_share_groups'.

import type { getServerClient } from './supabase-server';
import { buildWeekReport } from './week-report';
import type { Plan, PlanProduct, Tier, DailyPlan } from './plan';
import { vnInt, weekWindowVN } from './plan';
// @ts-ignore — module JS thuần
import { guessGroup } from './gen/products.mjs';
// @ts-ignore — module JS thuần (test được bằng node)
import { dampWeights, describeChanges, DEFAULT_STEP } from './plan-damp.mjs';

type Client = ReturnType<typeof getServerClient>;

const WEIGHT_BY_TIER: Record<Tier, number> = { winner: 3, watch: 2, weak: 1, insufficient: 1 };
const MIN_POSTS = 2;              // ngưỡng bài để xếp thắng/thua
const WEEKLY_SALES_BUDGET = 14;   // tổng bài bán/tuần để chia theo trọng số
const CONTENT_PER_DAY = 1;        // 1 bài content nuôi trang mỗi ngày
const GROUPS_PER_DAY = 2;         // mỗi ngày gợi ý chia sẻ vào 2 nhóm (xoay vòng)

const DOW_VN = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

// Playbook SDVICO 26/8 (user chốt "lịch tuần 2-2-1-1-1"): 7 bài content nuôi trang/tuần chia
// đúng 2 giáo dục + 2 viral + 1 cá nhân + 1 seeding + 1 tương tác. Bám PHẦN 9 playbook:
//   T2 GIÁO DỤC 1 (checklist)  — chữ RỦI RO — mẹo kỹ thuật áp dụng ngay
//   T3 VIRAL 1    (viral)      — chữ RỦI RO — cảnh báo hậu quả thật, kích tranh luận
//   T4 GIÁO DỤC 2 (tip)        — chữ TIỀN  — mẹo tiết kiệm/tránh mua hớ, có con số
//   T5 TƯƠNG TÁC  (engage)     — chữ NGHỀ  — poll/câu hỏi chia phe
//   T6 VIRAL 2    (viral)      — chữ TỰ HÀO — khoảnh khắc "lộc biển", payoff giây đầu
//   T7 CÁ NHÂN    (portrait)   — chữ TỰ HÀO — câu chuyện thật, kết nối cảm xúc
//   CN SEEDING    (seeding)    — chữ TIỀN  — checklist tuần → dẫn tự nhiên về sản phẩm
// Quy tắc playbook: chỉ 2/7 bài trực tiếp bán (T4 nhắc nhẹ + CN seeding), 5 bài còn lại xây
// niềm tin. Cả tuần phủ đủ 4 chữ.
const CONTENT_KIND_BY_DOW: Record<number, { kind: string; label: string }> = {
  1: { kind: 'checklist', label: 'Giáo dục · Rủi ro' },  // Thứ 2
  2: { kind: 'viral', label: 'Viral · Rủi ro' },         // Thứ 3
  3: { kind: 'tip', label: 'Giáo dục · Tiền' },          // Thứ 4
  4: { kind: 'engage', label: 'Tương tác · Nghề' },      // Thứ 5
  5: { kind: 'viral', label: 'Viral · Tự hào' },         // Thứ 6
  6: { kind: 'portrait', label: 'Cá nhân · Tự hào' },    // Thứ 7
  0: { kind: 'seeding', label: 'Seeding · Tiền' },       // Chủ nhật
};

// 4 chữ cảm xúc theo playbook — mỗi ngày mặc một chữ, để BOSS/Creator biết bài này chạm chữ
// nào (NGHỀ/TIỀN/RỦI RO/TỰ HÀO). Cả tuần phủ đủ 4 chữ, không được cả 7 bài cùng một chữ.
const CONTENT_EMOTION_BY_DOW: Record<number, string> = {
  1: 'RỦI RO',   // T2 — giáo dục kỹ thuật, sợ mất chuyến/tiền/an toàn
  2: 'RỦI RO',   // T3 — cảnh báo hậu quả
  3: 'TIỀN',     // T4 — mẹo tiết kiệm
  4: 'NGHỀ',     // T5 — tương tác về nghề
  5: 'TỰ HÀO',   // T6 — khoảnh khắc lộc biển
  6: 'TỰ HÀO',   // T7 — câu chuyện thật
  0: 'TIỀN',     // CN — seeding sản phẩm
};

// MỤC ĐÍCH từng loại content (user 24/8: "content phải có mục đích của nó") — hiện trong lịch
// tuần + khối Hôm nay để người đọc biết bài này ĐỂ LÀM GÌ cho bà con, không đăng cho có.
// Playbook 26/8 (PHẦN 4): mỗi chữ cảm xúc ép người xem LÀM một việc riêng —
//   RỦI RO -> cảnh báo nhau (comment); TIỀN -> hỏi giá (inbox);
//   TỰ HÀO -> khoe (share);           NGHỀ  -> kể chuyện của họ.
const CONTENT_PURPOSE: Record<string, string> = {
  qa: 'bà con có thêm kiến thức dùng thiết bị, đi biển',
  checklist: 'GIÁO DỤC (rủi ro) — bà con tự kiểm tra tàu/thiết bị trước chuyến, comment cảnh báo nhau',
  tip: 'GIÁO DỤC (tiền) — mẹo tiết kiệm, tránh mua hớ, có con số cụ thể để bà con tự tính vào túi',
  glossary: 'hiểu đúng thuật ngữ, thông số khi chọn mua thiết bị',
  engage: 'TƯƠNG TÁC (nghề) — poll/câu hỏi chia phe, bà con tự kể chuyện của mình',
  news: 'bà con nắm quy định mới, tránh bị phạt',
  viral: 'VIRAL — hook nghịch lý mất mát <15 chữ, chạm TIẾC/UẤT, bà con tag bạn thuyền',
  seeding: 'SEEDING (tiền) — checklist tuần dẫn tự nhiên về vùng nhu cầu sản phẩm, mở đường Zalo',
  portrait: 'CÁ NHÂN (tự hào) — chân dung ngư dân điển hình, kể chuyện thật, bà con share vì bản sắc dân biển',
};

// Cấu trúc 1 dòng của từng loại content — hiển thị trong lịch để người đọc biết bài sẽ
// trông ra sao (bám CONTENT_TYPE_INSTRUCTION trong lib/gen/social.mjs).
// Playbook 26/8 (PHẦN 6 — khung viral 6 nhịp): HOOK nghịch lý (≤15 chữ) → ĐỒNG CẢM bạn thuyền
// (TIẾC+UẤT) → LỐI THOÁT nói bằng LỢI ÍCH (không thông số) → PHẦN THƯỞNG cụ thể → TIN CẬY 1
// câu → CTA MỞ CHUYỆN (câu hỏi + từ khóa nhắn Page). CTA KHÔNG đòi gọi tổng đài với tệp lạ.
const CONTENT_STRUCTURE: Record<string, string> = {
  qa: '❓ 1 câu hỏi bà con hay gặp → 💡 đáp gọn 3-5 câu',
  checklist: '📋 mở 1 câu → 4-6 gạch ✅ việc kiểm tra trước chuyến → CTA nhắn Page',
  tip: '⚠️ 2-3 thói quen sai → ✅ 2-3 cách xử đúng, kèm CON SỐ tiết kiệm cụ thể',
  engage: '💬 2-3 câu gợi chuyện → CÂU HỎI CHIA PHE (A hay B) → bà con tự kể',
  portrait: '👤 nhân vật + tuổi + quê → khoảnh khắc thật → câu nói ruột gan → lời chúc',
  glossary: '📖 1 thuật ngữ nghề → giải thích dễ hiểu + ví dụ',
  viral: '🔥 HOOK nghịch lý ≤15 chữ (thành quả lớn bị phá bởi 1 nguyên nhân nhỏ) → 3-5 câu ĐỒNG CẢM giọng bạn thuyền chạm TIẾC+UẤT → câu hỏi mời tag bạn thuyền',
  seeding: '😥 nỗi lo cụ thể → 2-3 câu bàn giọng bạn thuyền → checklist gọn → gợi mở nhu cầu sản phẩm cuối bài (không chốt trực tiếp)',
};

// Cấu trúc bài BÁN (chung cho mọi hướng — bám prompt generateSocialPost).
export const SALES_STRUCTURE = 'mở bằng nỗi lo thật của bà con → 1-2 lợi ích đúng sản phẩm → mời nhắn Page hoặc gọi 1900 23 23 49';

function joinAnd(items: string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' và ' + items[items.length - 1];
}

// Ngày thứ i kể từ hôm nay (giờ VN). Trả { date, dow, dowIdx }.
function vnDayInfo(now: Date, offsetDays: number): { date: string; dow: string; dowIdx: number } {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  const date = vn.toISOString().slice(0, 10);
  return { date, dow: DOW_VN[vn.getUTCDay()], dowIdx: vn.getUTCDay() };
}

// Xếp bậc sản phẩm theo điểm trung bình tuần rồi gán trọng số 1..3.
function rankProducts(byProduct: Array<{ product: string; count: number; avgScore: number; avgEng: number; conversions: number }>): PlanProduct[] {
  // "Khác" (không nhận diện được sản phẩm) và "Bài content" không phải sản phẩm bán — loại
  // khỏi xếp hạng/trọng số (cùng luật với buildPlan, tránh "Dẫn đầu là Khác").
  const NOT_PRODUCT = new Set(['Khác', 'Bài content']);
  const pool = byProduct.filter((p) => !NOT_PRODUCT.has(p.product));
  const eligible = pool.filter((p) => p.count >= MIN_POSTS);
  const sorted = [...eligible].sort((a, b) => b.avgScore - a.avgScore);
  const n = sorted.length;
  const topCut = n ? Math.max(1, Math.round(n / 3)) : 0;
  const botStart = n - Math.max(1, Math.round(n / 3));
  const ranked: PlanProduct[] = sorted.map((p, idx) => {
    let tier: Tier;
    if (idx < topCut) tier = 'winner';
    else if (idx >= botStart && p.conversions === 0) tier = 'weak';
    else tier = 'watch';
    return { product: p.product, count: p.count, engagement: 0, conversions: p.conversions, avgEng: p.avgEng, avgConv: 0, tier, weight: WEIGHT_BY_TIER[tier], postsPerWeek: 0, note: '' };
  });
  const insufficient: PlanProduct[] = pool
    .filter((p) => p.count < MIN_POSTS)
    .map((p) => ({ product: p.product, count: p.count, engagement: 0, conversions: p.conversions, avgEng: p.avgEng, avgConv: 0, tier: 'insufficient' as Tier, weight: WEIGHT_BY_TIER.insufficient, postsPerWeek: 0, note: '' }));
  return [...ranked, ...insufficient];
}

// Dự kiến HƯỚNG ĐI cho từng ngày tới, mô phỏng đúng thứ tự vòng xoay sẽ rút.
// v8 (user chốt 21/8 đêm): cặp A/B chạy TRONG CÙNG NGÀY — A slot sáng, B slot chiều, nên
// mỗi hướng chưa dùng chiếm MỘT ngày (variant 'AB'). Hướng đang treo bản B (hôm trước lỡ
// nhịp) chiếm ngày đầu chỉ với bản B.
type DayDirection = { title: string; product: string; variant: 'A' | 'B' | 'AB'; done?: boolean };
// Tên sản phẩm chuẩn (bỏ số thứ tự folder) để tra trọng số — suggestion.product ghi theo
// danh mục prompt, weights ghi theo tên folder, phải quy về một mối qua guessGroup.
function productNameOf(raw: string): string {
  const g = (guessGroup as (t: string) => string | null)(String(raw || ''));
  return String(g || raw || '').replace(/^\s*\d+\.\s*/, '').trim();
}
function buildDirectionQueue(suggestions: any[], weights: Record<string, number> = {}): DayDirection[] {
  const out: DayDirection[] = [];
  const pendingB = suggestions.filter((s) => !s.used_at && s.pending_variant === 'B');
  const fresh = suggestions.filter((s) => !s.used_at && !s.pending_variant);
  // BOSS truyền cho Creator (user 21/8: "BOSS có học và truyền cho Creator không?"): hướng
  // của sản phẩm đang được đánh trọng số cao (đang thắng) kéo lên đầu hàng — không chạy
  // lần lượt theo thứ tự Gemini sinh nữa. Sort ổn định: cùng trọng số giữ thứ tự cũ.
  const wOf = (s: any) => weights[productNameOf(s.product)] ?? 1;
  const freshSorted = [...fresh].sort((a, b) => wOf(b) - wOf(a));
  for (const s of pendingB) out.push({ title: String(s.title || ''), product: String(s.product || ''), variant: 'B' });
  for (const s of freshSorted) out.push({ title: String(s.title || ''), product: String(s.product || ''), variant: 'AB' });
  return out.slice(0, 7);
}

// Chia lịch 7 ngày tới: mỗi sản phẩm bán rải đều số bài/tuần ra các ngày; content 1 bài/ngày;
// nhóm chia sẻ xoay vòng GROUPS_PER_DAY nhóm/ngày; hướng đi dự kiến theo hàng đợi vòng xoay.
function buildDailySchedule(now: Date, salesProducts: PlanProduct[], groups: string[], dirQueue: DayDirection[] = []): DailyPlan[] {
  const remaining = new Map<string, number>(salesProducts.map((p) => [p.product, p.postsPerWeek]));
  const out: DailyPlan[] = [];
  for (let i = 0; i < 7; i++) {
    const { date, dow, dowIdx } = vnDayInfo(now, i);
    const daysLeft = 7 - i;
    // Ngày CÓ hướng đi: bài bán trong ngày chính là cặp A/B của hướng đó (2 bài, hoặc 1 nếu
    // chỉ còn bản B mồ côi) — hiển thị đúng cái máy sẽ làm (user 21/8: "lịch bảo 2 bài SEA-40
    // + 1 lọc dầu mà sáng nay chỉ tạo 1 bản lọc dầu"). Không hướng mới rơi về chia trọng số.
    const dir = dirQueue[i] || null;
    const sales: Array<{ product: string; count: number }> = [];
    if (dir) {
      const name = productNameOf(dir.product);
      const cnt = dir.variant === 'AB' ? 2 : 1;
      sales.push({ product: name, count: cnt });
      const rem = remaining.get(name);
      if (rem != null) remaining.set(name, Math.max(0, rem - cnt));
    } else {
      for (const p of salesProducts) {
        const rem = remaining.get(p.product) || 0;
        if (rem <= 0) continue;
        const todayCount = Math.max(0, Math.round(rem / daysLeft));
        if (todayCount > 0) { sales.push({ product: p.product, count: todayCount }); remaining.set(p.product, rem - todayCount); }
      }
    }
    let dayGroups: string[] = [];
    if (groups.length) {
      const picked = new Set<string>();
      for (let k = 0; k < GROUPS_PER_DAY; k++) picked.add(groups[(i * GROUPS_PER_DAY + k) % groups.length]);
      dayGroups = [...picked];
    }
    const ck = CONTENT_KIND_BY_DOW[dowIdx];
    out.push({
      date, dow, sales,
      contentCount: CONTENT_PER_DAY,
      contentKind: ck?.kind, contentKindLabel: ck?.label, contentPurpose: ck ? CONTENT_PURPOSE[ck.kind] : undefined,
      contentStructure: ck ? CONTENT_STRUCTURE[ck.kind] : undefined,
      contentEmotion: CONTENT_EMOTION_BY_DOW[dowIdx],
      direction: dirQueue[i] || null,
      groups: dayGroups,
    });
  }
  return out;
}

function buildLiveNarrative(salesProducts: PlanProduct[], groups: string[], totals: { posts: number; engagement: number; views: number }, focusActive: boolean): string[] {
  const paras: string[] = [];
  const active = salesProducts.filter((p) => p.postsPerWeek > 0);
  if (!active.length) {
    paras.push('Chưa đủ số liệu hoặc chưa chọn sản phẩm tập trung. Vào ô "Tuần này chỉ đăng sản phẩm" để BOSS bám đúng sản phẩm cần đẩy.');
    return paras;
  }
  paras.push(
    `Tuần này đăng ${vnInt(totals.posts)} bài, gom ${vnInt(totals.engagement)} tương tác và ${vnInt(totals.views)} lượt xem. BOSS chia bài theo sức của từng sản phẩm.`
  );
  paras.push(
    'Số bài bán mỗi sản phẩm trong tuần: ' + joinAnd(active.map((p) => `${p.product} ${vnInt(p.postsPerWeek)} bài`)) + '.'
  );
  if (focusActive) paras.push('Đang tập trung theo ô "Tuần này chỉ đăng sản phẩm", nên chỉ chia bài cho các sản phẩm đó.');
  if (groups.length) {
    paras.push(`Mỗi ngày gợi ý chia sẻ bài vào ${Math.min(GROUPS_PER_DAY, groups.length)} nhóm (xoay vòng ${vnInt(groups.length)} nhóm đã lưu). Xem bảng lịch theo ngày bên dưới.`);
  } else {
    paras.push('Chưa nhập nhóm chia sẻ. Điền tên các nhóm Facebook bạn đang ở vào ô "Nhóm chia sẻ" để BOSS xếp lịch chia sẻ theo ngày.');
  }
  paras.push('Đề xuất này tự cập nhật mỗi 30 phút theo số liệu mới. Mỗi tối BOSS tự áp dụng trọng số cho vòng xoay hôm sau.');
  return paras;
}

// Đọc danh sách nhóm chia sẻ từ app_config. Từ 20/8 nguồn chung với popover Quản lý bài viết
// (/api/share-groups) nên phần tử có thể là object {id,label,url} — lấy label làm tên hiển thị.
async function loadShareGroups(client: Client): Promise<string[]> {
  const { data } = await client.from('app_config').select('value').eq('key', 'mkt_share_groups').maybeSingle();
  const v = (data as any)?.value;
  const arr = Array.isArray(v?.groups) ? v.groups : Array.isArray(v) ? v : [];
  return arr
    .map((x: any) => typeof x === 'string' ? x.trim() : String(x?.label || x?.id || '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

// Đọc focus (sản phẩm tập trung) còn hạn.
async function loadFocusKeys(client: Client): Promise<string[]> {
  const { data } = await client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle();
  const v = ((data as any)?.value || {}) as { groups?: string[]; until?: string };
  const keys = (Array.isArray(v.groups) ? v.groups : []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const active = keys.length > 0 && (!v.until || new Date(v.until).getTime() > Date.now());
  return active ? keys : [];
}

// Cập nhật/đề xuất SỐNG: tính lại từ số liệu mới nhất, lưu 1 bản 'live' (update tại chỗ).
export async function refreshLiveProposal(client: Client, now: Date = new Date()): Promise<{ id: string | null; skipped?: string }> {
  const report = await buildWeekReport(client, 0, now);
  const [shareGroups, focusKeys] = await Promise.all([loadShareGroups(client), loadFocusKeys(client)]);

  let products = rankProducts(report.byProduct.map((p) => ({ product: p.product, count: p.count, avgScore: p.avgScore, avgEng: p.avgEng, conversions: p.conversions })));

  // Nếu đang tập trung: chỉ giữ sản phẩm khớp focus. Focus product chưa có số liệu -> vẫn thêm
  // vào để BOSS chia bài (trọng số mặc định 1).
  const focusActive = focusKeys.length > 0;
  if (focusActive) {
    const matched = products.filter((p) => focusKeys.some((k) => p.product.toLowerCase().includes(k)));
    const matchedNames = new Set(matched.map((p) => p.product));
    // focus key chưa khớp sản phẩm nào có số liệu -> tạo placeholder từ guessGroup
    for (const k of focusKeys) {
      const already = matched.some((p) => p.product.toLowerCase().includes(k));
      if (already) continue;
      const guessed = (guessGroup as (t: string) => string | null)(k);
      const name = (guessed || k).replace(/^\s*\d+\.\s*/, '').trim();
      if (name && !matchedNames.has(name)) {
        matched.push({ product: name, count: 0, engagement: 0, conversions: 0, avgEng: 0, avgConv: 0, tier: 'insufficient', weight: 1, postsPerWeek: 0, note: '' });
        matchedNames.add(name);
      }
    }
    products = matched;
  }

  // Chia số bài bán/tuần theo trọng số (tối thiểu 1 mỗi sản phẩm bán).
  const salesProducts = products.filter((p) => p.product !== 'Bài content');
  const sumW = salesProducts.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of salesProducts) p.postsPerWeek = Math.max(1, Math.round((p.weight / sumW) * WEEKLY_SALES_BUDGET));

  const weights: Record<string, number> = {};
  for (const p of salesProducts) weights[p.product] = p.weight;

  // Hướng đi dự kiến từng ngày: đọc content_suggestions của bản ĐANG ÁP (nguồn vòng xoay rút).
  // NGÀY HÔM NAY: nếu vòng xoay ĐÃ sinh bài theo hướng nào thì hiển thị đúng hướng + biến thể
  // ĐÃ SINH (user 21/8: "lịch ghi bản B mà bài ra bản A" — vì queue dự kiến tính cả hôm nay
  // trong khi hôm nay đã chạy rồi). Queue dự kiến khi đó bắt đầu từ NGÀY MAI.
  let dirQueue: (DayDirection & { done?: boolean })[] = [];
  try {
    const { data: apRow } = await client
      .from('mkt_plans').select('data').eq('applied', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const sugs = Array.isArray((apRow as any)?.data?.content_suggestions) ? (apRow as any).data.content_suggestions : [];
    dirQueue = buildDirectionQueue(sugs, weights);

    // Bài BÁN đã sinh hôm nay theo hướng nào (brief.suggestion_title + ab_variant)?
    const vnToday = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const dayStartIso = new Date(new Date(vnToday + 'T00:00:00+07:00')).toISOString();
    const { data: todayRows } = await client
      .from('mkt_content').select('brief')
      .gte('created_at', dayStartIso)
      .eq('brief->>generator', 'rotation')
      .limit(20);
    const doneToday = (todayRows || [])
      .map((r: any) => r.brief || {})
      .filter((b: any) => b.suggestion_title);
    if (doneToday.length) {
      const b = doneToday[doneToday.length - 1];
      // Hôm nay có thể đã ra cả A lẫn B (nhịp cùng-ngày) — gom biến thể đã sinh của hướng đó.
      const variantsDone = new Set(doneToday.map((x: any) => (x.ab_variant === 'B' ? 'B' : 'A')));
      const doneDir: DayDirection & { done: boolean } = {
        title: String(b.suggestion_title || ''),
        product: String(b.keyword || ''),
        variant: variantsDone.size >= 2 ? 'AB' : (variantsDone.has('B') ? 'B' : 'A'),
        done: true,
      };
      // Bỏ mục trùng (hướng hôm nay) khỏi đầu queue nếu nó chính là mục kế tiếp, rồi chèn
      // hướng đã sinh vào vị trí hôm nay; phần còn lại dời sang từ ngày mai. GIỮ mục 'B' mồ
      // côi cùng title (hôm nay mới ra A, bản B còn chờ ngày mai) — bỏ nó là lịch mai mất B.
      const rest = dirQueue.filter((d, i) => !(i === 0 && d.title === doneDir.title && d.variant !== 'B'));
      dirQueue = [doneDir, ...rest];
    }
  } catch { /* không có bản áp -> lịch không ghi hướng */ }

  const daily = buildDailySchedule(now, salesProducts, shareGroups, dirQueue);
  const narrative = buildLiveNarrative(salesProducts, shareGroups, { posts: report.totals.posts, engagement: report.totals.engagement, views: report.totals.views }, focusActive);

  const win = weekWindowVN(now);
  const plan: Plan = {
    generatedAt: now.toISOString(),
    threshold: MIN_POSTS,
    weeklyBudget: WEEKLY_SALES_BUDGET,
    products: salesProducts,
    weights,
    narrative,
    origin: 'live',
    cadence: 'update',
    daily_schedule: daily,
    share_groups: shareGroups,
    summary: {
      totalProducts: report.byProduct.length,
      ranked: salesProducts.filter((p) => p.tier !== 'insufficient').length,
      insufficient: salesProducts.filter((p) => p.tier === 'insufficient').length,
      totalPosts: report.totals.posts,
      totalEngagement: report.totals.engagement,
      totalConversions: report.totals.conversions,
      topProduct: salesProducts[0]?.product || null,
    },
  };

  // Cập nhật TẠI CHỖ bản 'live' chưa áp gần nhất (không tạo bản mới mỗi 30p).
  const { data: existing } = await client
    .from('mkt_plans')
    .select('id')
    .eq('data->>origin', 'live')
    .eq('applied', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && (existing as any).id) {
    const { error } = await client.from('mkt_plans').update({ data: plan, period_start: win.start, period_end: win.end }).eq('id', (existing as any).id);
    if (error) throw new Error(error.message);
    return { id: (existing as any).id };
  }
  const { data, error } = await client
    .from('mkt_plans')
    .insert({ period_start: win.start, period_end: win.end, generated_by: 'cron', data: plan, applied: false })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: ((data as any)?.id as string) || null };
}

// Tối (>=19h VN, user 24/8 dời từ 21h)? Dùng để cron biết có tự áp dụng đề xuất sống hôm nay chưa.
export function isEveningVN(now: Date = new Date()): boolean {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.getUTCHours() >= 20; // 29/8 user doi 19h -> 20h
}

function vnDayStartIso(now: Date): string {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 60 * 60 * 1000).toISOString();
}

// MỖI TỐI tự áp dụng: GỘP trọng số + lịch + nhóm của bản 'live' vào bản ĐANG ÁP (giữ nguyên
// content_suggestions của BOSS). Chưa có bản đang áp -> áp thẳng bản 'live'. Guard 1 lần/ngày
// bằng cột run_log task 'mkt.live_apply'.
export async function applyLiveEvening(client: Client, opts: { force?: boolean } = {}, now: Date = new Date()): Promise<{ applied: boolean; skipped?: string }> {
  if (!opts.force && !isEveningVN(now)) {
    // 28/8 CHAY BU (user xac nhan may local tat toi 26-27/8 nen cron khong no khung 19h,
    // BOSS mat 2 luot chinh): buoi SANG (< 12h VN) neu TOI QUA khong co luot live_apply ok
    // nao -> cho chay bu 1 luot ngay bay gio. Luot bu thay luot toi cung ngay (guard "da ap
    // dung dem nay" ben duoi van tinh) — moi ngay van dung 1 nhip chinh ±0,5.
    const vnHour = new Date(now.getTime() + 7 * 3600 * 1000).getUTCHours();
    if (vnHour >= 12) return { applied: false, skipped: 'chua toi buoi toi (>=19h VN)' };
    const todayStart = vnDayStartIso(now);
    const yesterdayStart = vnDayStartIso(new Date(now.getTime() - 24 * 3600 * 1000));
    const { count: yCount } = await client
      .from('run_log')
      .select('id', { count: 'exact', head: true })
      .eq('task', 'mkt.live_apply')
      .eq('status', 'ok')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart);
    if (yCount && yCount > 0) return { applied: false, skipped: 'chua toi buoi toi (>=19h VN)' };
    // toi qua 0 luot -> roi xuong chay bu (guard 1 luot/ngay hom nay van ap ben duoi).
  }

  if (!opts.force) {
    const { count } = await client
      .from('run_log')
      .select('id', { count: 'exact', head: true })
      .eq('task', 'mkt.live_apply')
      .eq('status', 'ok')
      .gte('created_at', vnDayStartIso(now));
    if (count && count > 0) return { applied: false, skipped: 'da ap dung dem nay' };
  }

  const { data: live } = await client
    .from('mkt_plans')
    .select('id, data')
    .eq('data->>origin', 'live')
    .eq('applied', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!live || !(live as any).data) return { applied: false, skipped: 'chua co ban live de ap' };
  const liveData = (live as any).data as Plan;

  const { data: appliedRow } = await client
    .from('mkt_plans')
    .select('id, data')
    .eq('applied', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (appliedRow && (appliedRow as any).id) {
    // GỘP TỪNG CHÚT (user 22/8): kế hoạch tuần là xương sống, số liệu ngày chỉ DỊCH trọng số
    // tối đa ±step mỗi tối về phía đề xuất sống (trước đây thay hẳn -> tối nào cũng lật kế
    // hoạch tuần). Giữ nguyên content_suggestions (hướng đi A/B) + summary gốc; products +
    // lịch ngày dựng lại theo trọng số ĐÃ DỊCH để mọi chỗ nhất quán.
    const base = (appliedRow as any).data as Plan;
    const step = Number(process.env.LIVE_ADJUST_STEP) > 0 ? Number(process.env.LIVE_ADJUST_STEP) : (DEFAULT_STEP as number);
    const { weights: damped, changes } = (dampWeights as any)(base.weights || {}, liveData.weights || {}, step) as { weights: Record<string, number>; changes: Array<{ product: string; from: number; to: number; target: number }> };
    const liveByName = new Map((liveData.products || []).map((p) => [p.product, p] as const));
    const baseByName = new Map((base.products || []).map((p) => [p.product, p] as const));
    const products: PlanProduct[] = Object.keys(damped).map((name) => {
      const src = liveByName.get(name) || baseByName.get(name);
      const p: PlanProduct = src ? { ...src } : { product: name, count: 0, engagement: 0, conversions: 0, avgEng: 0, avgConv: 0, tier: 'insufficient', weight: 1, postsPerWeek: 0, note: '' };
      p.weight = damped[name];
      return p;
    });
    const sumW = products.reduce((s, p) => s + p.weight, 0) || 1;
    for (const p of products) p.postsPerWeek = Math.max(1, Math.round((p.weight / sumW) * WEEKLY_SALES_BUDGET));
    const dirQueue = buildDirectionQueue(Array.isArray(base.content_suggestions) ? base.content_suggestions : [], damped);
    const dailySchedule = buildDailySchedule(now, products, liveData.share_groups || base.share_groups || [], dirQueue);
    const adjustNote = (describeChanges as any)(changes) as string;
    const prevLog = Array.isArray(base.adjust_log) ? base.adjust_log : [];
    const adjustLog = [...prevLog, ...changes.map((c) => ({ at: now.toISOString(), ...c }))].slice(-30);
    const merged: Plan = {
      ...base,
      weights: damped,
      products,
      daily_schedule: dailySchedule,
      share_groups: liveData.share_groups,
      narrative: [adjustNote, ...(liveData.narrative || [])],
      generatedAt: liveData.generatedAt,
      adjust_log: adjustLog,
    };
    const { error } = await client.from('mkt_plans').update({ data: merged, applied_at: new Date().toISOString() }).eq('id', (appliedRow as any).id);
    if (error) throw new Error(error.message);
  } else {
    // Chưa có bản đang áp -> áp thẳng bản live.
    await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
    const { error } = await client.from('mkt_plans').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', (live as any).id);
    if (error) throw new Error(error.message);
  }

  try { await client.from('run_log').insert({ task: 'mkt.live_apply', actor: 'cron', status: 'ok', detail: { merged: !!appliedRow, damped: !!appliedRow } }); } catch { /* bỏ qua */ }
  return { applied: true };
}
