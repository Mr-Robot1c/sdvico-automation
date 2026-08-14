// lib/plan.ts — bộ não định hướng marketing từ số liệu Đo lường.
//
// Con bot ĐỀ XUẤT kế hoạch, người quyết (điều cấm 1 và 2). Module này:
//   1) loadMeasurement: đọc số liệu Facebook mới nhất mỗi bài rồi gộp theo SẢN PHẨM,
//      đúng cách trang Đo lường (app/do-luong/page.tsx) đang đọc.
//   2) buildPlan: từ số liệu thật sinh ra xếp hạng, trọng số và đoạn định hướng.
//      Đoạn định hướng viết bằng VĂN MẪU từ chính các con số, không bịa số mới (điều cấm 5),
//      theo brand-voice (câu ngắn, số chuẩn Việt Nam, không gạch dài, không mũi tên).
//
// Sản phẩm cần đủ NGƯỠNG bài (mặc định 3) mới được xếp thắng/thua, tránh kết luận từ
// một bài may mắn. Dưới ngưỡng thì xếp vào "chưa đủ dữ liệu", vẫn giữ nhịp đăng để gom thêm.

import type { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

type FbMetrics = { reactions?: number; comments?: number; shares?: number; engagement?: number };

export type ProductAgg = {
  product: string;
  count: number;
  engagement: number; // tổng tương tác
  conversions: number; // tổng đơn/lead
  avgEng: number;
  avgConv: number;
};

export type Measurement = {
  products: ProductAgg[];
  totals: { posts: number; engagement: number; conversions: number };
  topPosts: { title: string; product: string; engagement: number }[];
};

export type Tier = 'winner' | 'watch' | 'weak' | 'insufficient';

export type PlanProduct = ProductAgg & {
  tier: Tier;
  weight: number; // mức ưu tiên vòng xoay (1..3)
  postsPerWeek: number; // số bài/tuần gợi ý
  note: string;
};

export type Plan = {
  generatedAt: string;
  threshold: number;
  weeklyBudget: number;
  products: PlanProduct[];
  weights: Record<string, number>; // product -> mức ưu tiên, cho /api/rotate
  narrative: string[];
  summary: {
    totalProducts: number;
    ranked: number;
    insufficient: number;
    totalPosts: number;
    totalEngagement: number;
    totalConversions: number;
    topProduct: string | null;
  };
};

// Tên sản phẩm của một bài: ưu tiên folder xoay vòng, rồi từ khóa, rồi tiêu đề. Khớp trang Đo lường.
function productOf(brief: any, title: string): string {
  const g = brief?.rotation_group as string | undefined;
  const name = (g ? g.replace(/^\s*\d+\.\s*/, '').trim() : '') || brief?.keyword || title || 'Khác';
  return String(name).trim() || 'Khác';
}

// Cửa sổ tuần chạy từ thứ 2 tới chủ nhật, tính theo giờ Việt Nam (UTC+7). Trả về YYYY-MM-DD.
export function weekWindowVN(now: Date): { start: string; end: string } {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dow = vn.getUTCDay(); // 0 = CN ... 6 = T7 (đang ở khung giờ VN)
  const sinceMonday = (dow + 6) % 7; // số ngày kể từ thứ 2
  const monday = new Date(vn);
  monday.setUTCDate(vn.getUTCDate() - sinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

// Số nguyên theo chuẩn Việt Nam: dấu chấm ngăn cách hàng nghìn. Ví dụ 3.000.
export function vnInt(n: number): string {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('vi-VN');
}

// Số một chữ số thập phân, dấu phẩy thập phân theo chuẩn Việt Nam. Ví dụ 1,5.
export function vnDec1(n: number): string {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return v.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

// Nối danh sách tên bằng "và" ở cuối, không dùng ký hiệu thay chữ (chuẩn giọng văn).
function joinAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' và ' + items[items.length - 1];
}

// Đọc số liệu: mkt_metrics (chuỗi snapshot, lấy bản mới nhất mỗi bài) gộp với mkt_content,
// rồi gom theo sản phẩm. Trả về tổng và top bài. Giống hệt logic app/do-luong/page.tsx.
export async function loadMeasurement(client: Client): Promise<Measurement> {
  const { data: mrows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'facebook')
    .order('created_at', { ascending: false })
    .limit(500);

  const latest = new Map<string, FbMetrics>();
  for (const r of mrows || []) {
    const cid = (r as any).entity_ref as string | null;
    if (cid && !latest.has(cid)) latest.set(cid, ((r as any).metrics || {}) as FbMetrics);
  }

  const cids = [...latest.keys()];
  const contents = new Map<string, { title: string; product: string; conversions: number }>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief').in('id', cids);
    for (const c of cs || []) {
      const brief = (c as any).brief || {};
      contents.set((c as any).id, {
        title: (c as any).title || '(không tên)',
        product: productOf(brief, (c as any).title),
        conversions: Number(brief.conversions) || 0
      });
    }
  }

  const perPost = cids.map((cid) => {
    const m = latest.get(cid) || {};
    const c = contents.get(cid) || { title: '(không rõ)', product: 'Khác', conversions: 0 };
    const reactions = m.reactions || 0;
    const comments = m.comments || 0;
    const shares = m.shares || 0;
    return { cid, title: c.title, product: c.product, engagement: reactions + comments + shares, conversions: c.conversions };
  });

  const byProduct = new Map<string, { count: number; engagement: number; conversions: number }>();
  for (const r of perPost) {
    const g = byProduct.get(r.product) || { count: 0, engagement: 0, conversions: 0 };
    g.count += 1;
    g.engagement += r.engagement;
    g.conversions += r.conversions;
    byProduct.set(r.product, g);
  }

  const products: ProductAgg[] = [...byProduct.entries()].map(([product, g]) => ({
    product,
    count: g.count,
    engagement: g.engagement,
    conversions: g.conversions,
    avgEng: g.count ? Math.round(g.engagement / g.count) : 0,
    avgConv: g.count ? Math.round((g.conversions / g.count) * 10) / 10 : 0
  }));

  const totals = {
    posts: perPost.length,
    engagement: perPost.reduce((s, r) => s + r.engagement, 0),
    conversions: perPost.reduce((s, r) => s + r.conversions, 0)
  };

  const topPosts = [...perPost]
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5)
    .map((r) => ({ title: r.title, product: r.product, engagement: r.engagement }));

  return { products, totals, topPosts };
}

// Thứ 4 (3) hoặc chủ nhật (0) theo giờ Việt Nam. Dùng để cron metrics-pull hàng ngày biết
// hôm nay có sinh kế hoạch không (Vercel Hobby chỉ 2 cron nên gộp thay vì thêm cron thứ 3).
export function isPlanDayVN(now: Date): boolean {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dow = vn.getUTCDay();
  return dow === 3 || dow === 0;
}

// Sinh 1 bản kế hoạch từ số liệu hiện tại rồi lưu vào mkt_plans (applied = false).
// Bot ĐỀ XUẤT, người quyết (điều cấm 1 và 2). Dùng chung cho cron, action tạo tay, và cron metrics-pull.
export async function generateAndStorePlan(
  client: Client,
  generatedBy: 'cron' | 'manual'
): Promise<{ id: string | null; plan: Plan }> {
  const now = new Date();
  const measurement = await loadMeasurement(client);
  const plan = buildPlan(measurement, { generatedAt: now.toISOString() });
  const win = weekWindowVN(now);
  const { data, error } = await client
    .from('mkt_plans')
    .insert({
      period_start: win.start,
      period_end: win.end,
      generated_by: generatedBy,
      data: plan,
      applied: false
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: ((data as any)?.id as string) || null, plan };
}

const WEIGHT_BY_TIER: Record<Tier, number> = {
  winner: 3,
  watch: 2,
  weak: 1,
  insufficient: 1 // sàn tối thiểu để gom thêm số liệu, chưa dồn sức vào cái chưa rõ
};

// Sinh kế hoạch từ số liệu. threshold: số bài tối thiểu để xếp hạng. weeklyBudget: số bài/tuần để chia.
export function buildPlan(
  m: Measurement,
  opts: { threshold?: number; weeklyBudget?: number; generatedAt: string } = { generatedAt: '' }
): Plan {
  const threshold = opts.threshold ?? 3;
  const weeklyBudget = opts.weeklyBudget ?? 14;
  const generatedAt = opts.generatedAt || '';

  // Xếp sản phẩm đủ mẫu theo đơn/lead trung bình rồi tương tác trung bình.
  const ranked = m.products
    .filter((p) => p.count >= threshold)
    .sort((a, b) => b.avgConv - a.avgConv || b.avgEng - a.avgEng);
  const insufficient = m.products.filter((p) => p.count < threshold);

  // Chia bậc: đỉnh 1/3 là winner, đáy 1/3 mà chưa ra đơn là weak, còn lại watch.
  const n = ranked.length;
  const topCut = n ? Math.max(1, Math.round(n / 3)) : 0;
  const botStart = n - Math.max(1, Math.round(n / 3));
  const tierOf = (idx: number, p: ProductAgg): Tier => {
    if (idx < topCut) return 'winner';
    if (idx >= botStart && p.avgConv === 0) return 'weak';
    return 'watch';
  };

  const rankedPlan: PlanProduct[] = ranked.map((p, idx) => {
    const tier = tierOf(idx, p);
    return { ...p, tier, weight: WEIGHT_BY_TIER[tier], postsPerWeek: 0, note: '' };
  });
  const insufficientPlan: PlanProduct[] = insufficient
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ ...p, tier: 'insufficient' as Tier, weight: WEIGHT_BY_TIER.insufficient, postsPerWeek: 0, note: '' }));

  const all = [...rankedPlan, ...insufficientPlan];

  // Chia số bài/tuần theo trọng số. Tối thiểu 1 bài mỗi sản phẩm — giảm chứ không bỏ hẳn (điều cấm 2).
  const sumW = all.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of all) {
    p.postsPerWeek = Math.max(1, Math.round((p.weight / sumW) * weeklyBudget));
    p.note = noteFor(p);
  }

  const weights: Record<string, number> = {};
  for (const p of all) weights[p.product] = p.weight;

  const summary = {
    totalProducts: m.products.length,
    ranked: ranked.length,
    insufficient: insufficient.length,
    totalPosts: m.totals.posts,
    totalEngagement: m.totals.engagement,
    totalConversions: m.totals.conversions,
    topProduct: rankedPlan[0]?.product || null
  };

  return {
    generatedAt,
    threshold,
    weeklyBudget,
    products: all,
    weights,
    narrative: buildNarrative(all, summary, weeklyBudget, threshold),
    summary
  };
}

function noteFor(p: PlanProduct): string {
  if (p.tier === 'winner') return 'Đang thắng, đẩy mạnh nhịp đăng.';
  if (p.tier === 'weak') return 'Đuối, giảm bài và đổi góc tiếp cận.';
  if (p.tier === 'insufficient') return `Mới ${vnInt(p.count)} bài, giữ nhịp để gom thêm số liệu.`;
  return 'Ổn định, giữ nhịp hiện tại.';
}

function buildNarrative(
  all: PlanProduct[],
  s: Plan['summary'],
  weeklyBudget: number,
  threshold: number
): string[] {
  if (s.totalPosts === 0) {
    return [
      'Chưa có bài nào có số liệu nên chưa xếp hạng được. Đăng bài lên Facebook, chờ có tương tác rồi bấm Cập nhật số liệu ở trang Đo lường. Có số rồi kế hoạch sẽ bám vào đó mà định hướng.'
    ];
  }

  const paras: string[] = [];

  // Tổng quan.
  let overview = `Đợt này gom được ${vnInt(s.totalPosts)} bài có số liệu, ${vnInt(s.totalEngagement)} lượt tương tác`;
  if (s.totalConversions > 0) overview += ` và ${vnInt(s.totalConversions)} đơn hoặc lead`;
  overview += '. ';
  if (s.ranked > 0) {
    overview += `Có ${vnInt(s.ranked)} sản phẩm đủ mẫu để xếp hạng, từ ${vnInt(threshold)} bài trở lên`;
    if (s.insufficient > 0) overview += `, còn ${vnInt(s.insufficient)} sản phẩm ít bài nên chưa vội kết luận`;
    overview += '.';
  } else {
    overview += `Chưa sản phẩm nào đủ mẫu để xếp hạng, cần từ ${vnInt(threshold)} bài trở lên. ${vnInt(s.insufficient)} sản phẩm đang gom thêm số liệu.`;
  }
  paras.push(overview);

  // Sản phẩm dẫn đầu.
  const winners = all.filter((p) => p.tier === 'winner');
  if (winners.length) {
    const top = winners[0];
    let lead = `Dẫn đầu là ${top.product}. Trung bình mỗi bài được ${vnInt(top.avgEng)} lượt tương tác`;
    if (top.avgConv > 0) lead += `, kéo về ${vnDec1(top.avgConv)} đơn hoặc lead mỗi bài`;
    lead += '. Nên tăng nhịp đăng nhóm này và giữ nguyên góc đang ăn khách.';
    if (winners.length > 1) {
      lead += ` Cùng nhóm mạnh còn có ${joinAnd(winners.slice(1).map((p) => p.product))}.`;
    }
    paras.push(lead);
  }

  // Sản phẩm yếu.
  const weak = all.filter((p) => p.tier === 'weak');
  if (weak.length) {
    const names = joinAnd(weak.map((p) => p.product));
    let w = `${names} đang đuối. Đăng đủ số bài mà tương tác vẫn thấp`;
    if (weak.every((p) => p.conversions === 0)) w += ' và chưa ra đơn nào';
    w += '. Đừng bỏ hẳn, nhưng nên giảm số bài rồi đổi góc, nhấn vào lợi ích cụ thể như tiết kiệm dầu, đủ nước ngọt ngoài khơi hay ra khơi an toàn.';
    paras.push(w);
  }

  // Chưa đủ dữ liệu.
  const ins = all.filter((p) => p.tier === 'insufficient');
  if (ins.length) {
    const names = joinAnd(ins.map((p) => p.product));
    paras.push(
      `${names} mới có ít bài, chưa đủ để nói tốt hay dở. Giữ nhịp đăng đều để gom thêm số liệu rồi hẵng quyết.`
    );
  }

  // Phân bổ tuần tới.
  const alloc = all
    .filter((p) => p.postsPerWeek > 0)
    .sort((a, b) => b.postsPerWeek - a.postsPerWeek)
    .map((p) => `${p.product} ${vnInt(p.postsPerWeek)} bài`);
  if (alloc.length) {
    paras.push(
      `Gợi ý tuần tới chia khoảng ${vnInt(weeklyBudget)} bài, ưu tiên: ${joinAnd(alloc)}. Con số chỉ để tham khảo. Mở trang Kế hoạch bấm Áp dụng thì vòng xoay sinh bài mới ưu tiên theo hướng này.`
    );
  }

  return paras;
}
