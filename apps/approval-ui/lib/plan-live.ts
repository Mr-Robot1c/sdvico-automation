// lib/plan-live.ts — ĐỀ XUẤT SỐNG của AI Planner (BOSS), user chốt 20/8.
//
// Nhịp mới (user chốt): BOSS "tự cập nhật đề xuất rồi mỗi tối áp dụng, cuối tuần báo cáo".
//   - MỖI 30 PHÚT (cron mkt-metrics-pull): refreshLiveProposal đọc số liệu mới nhất, tính
//     trọng số + số bài mỗi sản phẩm + lịch theo NGÀY (sản phẩm nào mấy bài, chia sẻ nhóm nào),
//     lưu vào MỘT bản đề xuất 'live' (origin='live', applied=false, cập nhật tại chỗ, không
//     đầy lịch sử). KHÔNG gọi Gemini (rẻ, chạy dày được).
//   - MỖI TỐI (>=21h VN, 1 lần/ngày): applyLiveEvening GỘP trọng số + lịch + nhóm của bản 'live'
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

type Client = ReturnType<typeof getServerClient>;

const WEIGHT_BY_TIER: Record<Tier, number> = { winner: 3, watch: 2, weak: 1, insufficient: 1 };
const MIN_POSTS = 2;              // ngưỡng bài để xếp thắng/thua
const WEEKLY_SALES_BUDGET = 14;   // tổng bài bán/tuần để chia theo trọng số
const CONTENT_PER_DAY = 1;        // 1 bài content nuôi trang mỗi ngày
const GROUPS_PER_DAY = 2;         // mỗi ngày gợi ý chia sẻ vào 2 nhóm (xoay vòng)

const DOW_VN = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function joinAnd(items: string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' và ' + items[items.length - 1];
}

// Ngày thứ i kể từ hôm nay (giờ VN). Trả { date: 'YYYY-MM-DD', dow: 'Thứ 2' }.
function vnDayInfo(now: Date, offsetDays: number): { date: string; dow: string } {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  const date = vn.toISOString().slice(0, 10);
  return { date, dow: DOW_VN[vn.getUTCDay()] };
}

// Xếp bậc sản phẩm theo điểm trung bình tuần rồi gán trọng số 1..3.
function rankProducts(byProduct: Array<{ product: string; count: number; avgScore: number; avgEng: number; conversions: number }>): PlanProduct[] {
  const eligible = byProduct.filter((p) => p.count >= MIN_POSTS && p.product !== 'Bài content');
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
  const insufficient: PlanProduct[] = byProduct
    .filter((p) => p.count < MIN_POSTS && p.product !== 'Bài content')
    .map((p) => ({ product: p.product, count: p.count, engagement: 0, conversions: p.conversions, avgEng: p.avgEng, avgConv: 0, tier: 'insufficient' as Tier, weight: WEIGHT_BY_TIER.insufficient, postsPerWeek: 0, note: '' }));
  return [...ranked, ...insufficient];
}

// Chia lịch 7 ngày tới: mỗi sản phẩm bán rải đều số bài/tuần ra các ngày; content 1 bài/ngày;
// nhóm chia sẻ xoay vòng GROUPS_PER_DAY nhóm/ngày.
function buildDailySchedule(now: Date, salesProducts: PlanProduct[], groups: string[]): DailyPlan[] {
  const remaining = new Map<string, number>(salesProducts.map((p) => [p.product, p.postsPerWeek]));
  const out: DailyPlan[] = [];
  for (let i = 0; i < 7; i++) {
    const { date, dow } = vnDayInfo(now, i);
    const daysLeft = 7 - i;
    const sales: Array<{ product: string; count: number }> = [];
    for (const p of salesProducts) {
      const rem = remaining.get(p.product) || 0;
      if (rem <= 0) continue;
      const todayCount = Math.max(0, Math.round(rem / daysLeft));
      if (todayCount > 0) { sales.push({ product: p.product, count: todayCount }); remaining.set(p.product, rem - todayCount); }
    }
    let dayGroups: string[] = [];
    if (groups.length) {
      const picked = new Set<string>();
      for (let k = 0; k < GROUPS_PER_DAY; k++) picked.add(groups[(i * GROUPS_PER_DAY + k) % groups.length]);
      dayGroups = [...picked];
    }
    out.push({ date, dow, sales, contentCount: CONTENT_PER_DAY, groups: dayGroups });
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

  const daily = buildDailySchedule(now, salesProducts, shareGroups);
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

// Tối (>=21h VN)? Dùng để cron biết có tự áp dụng đề xuất sống hôm nay chưa.
export function isEveningVN(now: Date = new Date()): boolean {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.getUTCHours() >= 21;
}

function vnDayStartIso(now: Date): string {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 60 * 60 * 1000).toISOString();
}

// MỖI TỐI tự áp dụng: GỘP trọng số + lịch + nhóm của bản 'live' vào bản ĐANG ÁP (giữ nguyên
// content_suggestions của BOSS). Chưa có bản đang áp -> áp thẳng bản 'live'. Guard 1 lần/ngày
// bằng cột run_log task 'mkt.live_apply'.
export async function applyLiveEvening(client: Client, opts: { force?: boolean } = {}, now: Date = new Date()): Promise<{ applied: boolean; skipped?: string }> {
  if (!opts.force && !isEveningVN(now)) return { applied: false, skipped: 'chua toi buoi toi (>=21h VN)' };

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
    // GỘP: chỉ đổi weights + daily_schedule + share_groups + narrative của bản đang áp, giữ
    // nguyên content_suggestions (hướng đi A/B) + summary gốc.
    const base = (appliedRow as any).data as Plan;
    const merged: Plan = {
      ...base,
      weights: liveData.weights,
      products: liveData.products,
      daily_schedule: liveData.daily_schedule,
      share_groups: liveData.share_groups,
      narrative: liveData.narrative,
      generatedAt: liveData.generatedAt,
    };
    const { error } = await client.from('mkt_plans').update({ data: merged, applied_at: new Date().toISOString() }).eq('id', (appliedRow as any).id);
    if (error) throw new Error(error.message);
  } else {
    // Chưa có bản đang áp -> áp thẳng bản live.
    await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
    const { error } = await client.from('mkt_plans').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', (live as any).id);
    if (error) throw new Error(error.message);
  }

  try { await client.from('run_log').insert({ task: 'mkt.live_apply', actor: 'cron', status: 'ok', detail: { merged: !!appliedRow } }); } catch { /* bỏ qua */ }
  return { applied: true };
}
