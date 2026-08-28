// lib/learn-weekly.ts — vòng HỌC TUẦN (item 1b, user 20/8).
//
// Mỗi Chủ Nhật 23:00 VN, chạy 1 lần: đọc số liệu tuần VỪA KẾT THÚC (T2-CN), chấm điểm mỗi
// bài (composite: engagement + views + reach + watchSec), gom theo sản phẩm, rồi ĐỀ XUẤT
// trọng số mới cho vòng xoay tuần tới. Ghi vào mkt_plans với origin='learn-weekly',
// applied=false. Người quản lí xem ở /ke-hoach, bấm "Áp dụng đề xuất" mới có hiệu lực
// (ba-spec NV4/R5: kế hoạch không tự áp dụng trọng số, chỉ có hiệu lực khi Bạn B xác nhận).
//
// KHÔNG tự đổi KIND_WEIGHT (bài content) trong phiên này — chỉ đề xuất bằng thông tin trong
// báo cáo tuần. Tôn trọng nguyên tắc máy đề xuất, người quyết.

import type { getServerClient } from './supabase-server';
import { buildWeekReport } from './week-report';
import type { Plan, PlanProduct, Tier } from './plan';
import { vnInt, weekWindowVN } from './plan';

type Client = ReturnType<typeof getServerClient>;

const WEIGHT_BY_TIER: Record<Tier, number> = { winner: 3, watch: 2, weak: 1, insufficient: 1 };

// Ngưỡng bài tối thiểu để xếp thắng/thua trong tuần. Tuần chỉ có 2 bài không đủ đại diện,
// giữ nguyên trọng số mặc định 1 (không đẩy mạnh mà cũng không cắt).
const MIN_POSTS_PER_PRODUCT = 2;

function joinAnd(items: string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' và ' + items[items.length - 1];
}

// Xếp bậc sản phẩm theo điểm trung bình tuần: top 1/3 = winner, đáy 1/3 chưa ra đơn = weak,
// còn lại = watch. Sản phẩm dưới ngưỡng bài = insufficient (giữ nhịp gom thêm số liệu).
function tierProducts(products: Array<{ product: string; count: number; avgScore: number; avgEng: number; conversions: number }>) {
  const eligible = products.filter((p) => p.count >= MIN_POSTS_PER_PRODUCT && p.product !== 'Bài content');
  const insufficient = products.filter((p) => (p.count < MIN_POSTS_PER_PRODUCT || p.product === 'Bài content') && p.product !== 'Bài content');
  const sorted = [...eligible].sort((a, b) => b.avgScore - a.avgScore);
  const n = sorted.length;
  const topCut = n ? Math.max(1, Math.round(n / 3)) : 0;
  const botStart = n - Math.max(1, Math.round(n / 3));
  const rows: PlanProduct[] = sorted.map((p, idx) => {
    let tier: Tier;
    if (idx < topCut) tier = 'winner';
    else if (idx >= botStart && p.conversions === 0) tier = 'weak';
    else tier = 'watch';
    return {
      product: p.product,
      count: p.count,
      engagement: 0,
      conversions: p.conversions,
      avgEng: p.avgEng,
      avgConv: 0,
      tier,
      weight: WEIGHT_BY_TIER[tier],
      postsPerWeek: 0,
      note: noteFor(tier, p)
    };
  });
  const insufRows: PlanProduct[] = insufficient.map((p) => ({
    product: p.product, count: p.count, engagement: 0, conversions: p.conversions,
    avgEng: p.avgEng, avgConv: 0, tier: 'insufficient' as Tier,
    weight: WEIGHT_BY_TIER.insufficient, postsPerWeek: 0,
    note: `Chỉ ${vnInt(p.count)} bài tuần rồi, chưa đủ để xếp — giữ nhịp để gom thêm số liệu.`
  }));
  return [...rows, ...insufRows];
}

function noteFor(tier: Tier, p: { avgEng: number; count: number }): string {
  if (tier === 'winner') return `Ăn nhất tuần rồi, trung bình ${vnInt(p.avgEng)} tương tác/bài. Đẩy mạnh nhịp đăng.`;
  if (tier === 'weak') return `Đuối nhất tuần rồi, chỉ ${vnInt(p.avgEng)} tương tác/bài mà chưa có đơn. Giảm nhịp, đổi góc.`;
  return `Ổn định (${vnInt(p.avgEng)} tương tác/bài, ${vnInt(p.count)} bài). Giữ nhịp hiện tại.`;
}

export type LearnWeeklyResult = { planId: string | null; ranked: number; skipped?: string };

// Guard: chỉ chạy 1 lần trong tuần (Chủ Nhật) — check mkt_plans origin='learn-weekly' đã có
// bản nào trong 24 giờ qua chưa. Chưa có thì sinh, có rồi thì skip.
export async function alreadyRanThisWeek(client: Client, now: Date = new Date()): Promise<boolean> {
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await client
    .from('mkt_plans')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', oneDayAgo)
    .eq('data->>origin', 'learn-weekly');
  return (count || 0) > 0;
}

// Sinh 1 bản kế hoạch "học tuần" từ số liệu TUẦN VỪA KẾT THÚC (offset=1). Insert vào mkt_plans
// với origin='learn-weekly', applied=false. Người quản lí bấm "Áp dụng đề xuất" ở /ke-hoach mới
// có hiệu lực.
export async function learnWeekly(client: Client, opts: { force?: boolean } = {}): Promise<LearnWeeklyResult> {
  const now = new Date();
  if (!opts.force && await alreadyRanThisWeek(client, now)) {
    return { planId: null, ranked: 0, skipped: 'da co ban learn-weekly trong 24 gio qua' };
  }

  // Đọc số liệu tuần VỪA KẾT THÚC. Chủ Nhật 19h chạy thì offset=0 là tuần đang khép lại,
  // dùng offset=0 (T2-CN tuần này, số liệu tới CN 19h).
  const report = await buildWeekReport(client, 0, now);

  if (report.totals.posts === 0) {
    return { planId: null, ranked: 0, skipped: 'tuan nay chua co bai nao dang' };
  }

  const productRows = tierProducts(report.byProduct.map((p) => ({
    product: p.product, count: p.count, avgScore: p.avgScore, avgEng: p.avgEng, conversions: p.conversions
  })));

  // Chia số bài/tuần theo weight (giống buildPlan của lib/plan.ts).
  const WEEKLY_BUDGET = 14;
  const sumW = productRows.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of productRows) {
    p.postsPerWeek = Math.max(1, Math.round((p.weight / sumW) * WEEKLY_BUDGET));
  }

  const weights: Record<string, number> = {};
  for (const p of productRows) weights[p.product] = p.weight;

  const winners = productRows.filter((p) => p.tier === 'winner');
  const weakOnes = productRows.filter((p) => p.tier === 'weak');

  const narrative: string[] = [];
  narrative.push(
    `Tuần vừa qua (${report.window.start.split('-').reverse().join('/')} đến ${report.window.end.split('-').reverse().join('/')}) đăng được ${vnInt(report.totals.posts)} bài, gom ${vnInt(report.totals.engagement)} lượt tương tác và ${vnInt(report.totals.views)} lượt xem.`
  );
  if (report.delta.engagement !== 0) {
    narrative.push(
      `So tuần trước, tương tác ${report.delta.engagement > 0 ? 'tăng' : 'giảm'} ${Math.abs(report.delta.engagement)} phần trăm, lượt xem ${report.delta.views > 0 ? 'tăng' : 'giảm'} ${Math.abs(report.delta.views)} phần trăm.`
    );
  }
  if (winners.length) {
    narrative.push(
      `Ăn nhất là ${joinAnd(winners.map((w) => w.product))}. Đề xuất tuần tới đẩy mạnh nhóm này (${winners.map((w) => `${w.product} ${vnInt(w.postsPerWeek)} bài/tuần`).join(', ')}).`
    );
  }
  if (weakOnes.length) {
    narrative.push(
      `Đuối nhất là ${joinAnd(weakOnes.map((w) => w.product))}. Đề xuất giảm nhịp còn ${vnInt(weakOnes[0].postsPerWeek)} bài/tuần và đổi góc, nhấn lợi ích cụ thể như tiết kiệm dầu, đủ nước ngọt ngoài khơi hay ra khơi an toàn.`
    );
  }
  narrative.push(
    'Đây là ĐỀ XUẤT dựa vào số liệu tuần rồi, chưa tự áp. Bấm "Áp dụng đề xuất" bên dưới mới có hiệu lực cho tuần tới.'
  );

  const plan: Plan = {
    generatedAt: now.toISOString(),
    threshold: MIN_POSTS_PER_PRODUCT,
    weeklyBudget: WEEKLY_BUDGET,
    products: productRows,
    weights,
    narrative,
    origin: 'learn-weekly',
    cadence: 'manual',
    summary: {
      totalProducts: report.byProduct.length,
      ranked: winners.length + productRows.filter((p) => p.tier === 'watch').length + weakOnes.length,
      insufficient: productRows.filter((p) => p.tier === 'insufficient').length,
      totalPosts: report.totals.posts,
      totalEngagement: report.totals.engagement,
      totalConversions: report.totals.conversions,
      topProduct: winners[0]?.product || null
    }
  };

  // Ghi period là TUẦN TỚI (tuần bắt đầu Thứ 2 kế tiếp) — kế hoạch này áp cho tuần đó.
  const nextMonday = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWin = weekWindowVN(nextMonday);

  const { data, error } = await client
    .from('mkt_plans')
    .insert({
      period_start: nextWin.start,
      period_end: nextWin.end,
      generated_by: 'cron',
      data: plan,
      applied: false
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { planId: ((data as any)?.id as string) || null, ranked: plan.summary.ranked };
}

// Chỉ chạy vào Chủ Nhật giờ VN, từ 23:00 trở đi. Cron 30 phút/lần nên tự chặn trùng ở
// alreadyRanThisWeek. Trước 19h hoặc ngày khác: trả false, không chạy.
export function shouldRunLearnWeekly(now: Date = new Date()): boolean {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dow = vn.getUTCDay(); // 0 = CN
  const hour = vn.getUTCHours();
  return dow === 0 && hour >= 20; // 29/8 user doi 19h -> 20h
}
