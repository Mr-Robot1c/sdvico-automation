// lib/learn-weekly.ts — vòng HỌC TUẦN (item 1b, user 20/8).
//
// Mỗi Chủ Nhật từ 20h VN (bù sáng thứ Hai nếu CN không có lượt chạy), chạy 1 lần: đọc số liệu tuần VỪA KẾT THÚC (T2-CN), chấm điểm mỗi
// bài (composite: engagement + views + reach + watchSec), gom theo sản phẩm, rồi ĐỀ XUẤT
// trọng số mới cho vòng xoay tuần tới. Ghi vào mkt_plans với origin='learn-weekly',
// applied=false. Người quản lí xem ở /ke-hoach, bấm "Áp dụng đề xuất" mới có hiệu lực
// (ba-spec NV4/R5: kế hoạch không tự áp dụng trọng số, chỉ có hiệu lực khi Bạn B xác nhận).
//
// 22/10 (user: "thật sự con BOSS agent có hoạt động kh vậy?", rồi chốt sửa vòng học): bản học tuần nằm chờ người bấm
// "Áp dụng" mà từ 24/8 không ai bấm, nên kế hoạch tuần chạy với mọi trọng số bằng 1. Giờ máy TỰ GỘP trọng số học
// được vào kế hoạch đang áp của tuần tới (mergeLearnIntoApplied): Thứ 2 sau khi áp đề xuất tuần, hoặc ngay khi học bù
// sáng Thứ 2. Bài vẫn qua duyệt như cũ, chỉ trọng số chia bài là tự đổi. Số liệu đo GỘP 4 TUẦN, luật xếp bậc dùng
// chung (lib/gen/rank-products.mjs): không xếp thắng khi 0 tương tác và 0 đơn.
//
// KHÔNG tự đổi KIND_WEIGHT (bài content) trong phiên này — chỉ đề xuất bằng thông tin trong
// báo cáo tuần. Tôn trọng nguyên tắc máy đề xuất, người quyết.

import type { getServerClient } from './supabase-server';
import { buildProductWindow } from './week-report';
// @ts-ignore — module JS thuần
import { rankProducts, MIN_POSTS_4W, WEEKS_WINDOW } from './gen/rank-products.mjs';
import type { Plan, PlanProduct, Tier } from './plan';
import { vnInt, weekWindowVN } from './plan';

type Client = ReturnType<typeof getServerClient>;

function joinAnd(items: string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' và ' + items[items.length - 1];
}

// Luật xếp bậc chung (rank-products.mjs) đổi sang dạng PlanProduct của trang Kế hoạch.
function tierProducts(products: Array<{ product: string; count: number; avgScore: number; avgEng: number; totalEng: number; conversions: number }>): PlanProduct[] {
  const rows = (rankProducts as (p: any[], o?: any) => any[])(products, { minPosts: MIN_POSTS_4W });
  return rows.map((p) => ({
    product: p.product, count: p.count, engagement: p.totalEng || 0, conversions: p.conversions,
    avgEng: p.avgEng, avgConv: 0, tier: p.tier as Tier, weight: p.weight, postsPerWeek: 0,
    note: p.tier === 'insufficient'
      ? `Chỉ ${vnInt(p.count)} bài trong ${WEEKS_WINDOW} tuần, chưa đủ để xếp. Giữ nhịp để gom thêm số liệu.`
      : noteFor(p.tier as Tier, p, (p.totalEng || 0) === 0 && !p.conversions),
  }));
}

function noteFor(tier: Tier, p: { avgEng: number; count: number }, noSignal = false): string {
  if (tier === 'winner') return `Ăn nhất ${WEEKS_WINDOW} tuần qua, trung bình ${vnInt(p.avgEng)} tương tác/bài. Đẩy mạnh nhịp đăng.`;
  if (tier === 'weak') return `Đuối nhất ${WEEKS_WINDOW} tuần qua, chỉ ${vnInt(p.avgEng)} tương tác/bài mà chưa có đơn. Giảm nhịp, đổi góc.`;
  if (noSignal) return `${vnInt(p.count)} bài trong ${WEEKS_WINDOW} tuần mà chưa có tương tác hay đơn nào, chưa đủ cớ để đẩy mạnh. Giữ nhịp.`;
  return `Ổn định (${vnInt(p.avgEng)} tương tác/bài, ${vnInt(p.count)} bài trong ${WEEKS_WINDOW} tuần). Giữ nhịp hiện tại.`;
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

  // Đọc số liệu tuần VỪA KẾT THÚC. Chủ Nhật tối chạy thì offset=0 là tuần đang khép lại (T2-CN tuần
  // này). 15/10: chạy bù sáng thứ Hai thì tuần vừa kết thúc là offset=1, offset=0 lúc đó là tuần mới.
  const mondayCatchUp = isMondayVN(now);
  const win4 = await buildProductWindow(client, mondayCatchUp ? 1 : 0, WEEKS_WINDOW, now);
  const report = win4.newestWeek;

  if (win4.totals.posts === 0) {
    return { planId: null, ranked: 0, skipped: 'chua co bai nao dang trong 4 tuan' };
  }

  const productRows = tierProducts(win4.byProduct.map((p) => ({
    product: p.product, count: p.count, avgScore: p.avgScore, avgEng: p.avgEng, totalEng: p.totalEng, conversions: p.conversions
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
  narrative.push(`Trọng số tuần tới tính trên ${win4.label}: ${vnInt(win4.totals.posts)} bài, ${vnInt(win4.totals.engagement)} lượt tương tác.`);
  if (!winners.length) {
    narrative.push('Chưa sản phẩm nào đủ số bài và có tương tác hay đơn để xếp thắng, giữ nhịp đều các sản phẩm.');
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
  narrative.push('Máy tự gộp trọng số này vào kế hoạch tuần tới sáng Thứ 2. Bài vẫn qua duyệt như cũ.');

  const plan: Plan = {
    generatedAt: now.toISOString(),
    threshold: MIN_POSTS_4W,
    weeklyBudget: WEEKLY_BUDGET,
    products: productRows,
    weights,
    narrative,
    origin: 'learn-weekly',
    cadence: 'manual',
    summary: {
      totalProducts: win4.byProduct.length,
      ranked: winners.length + productRows.filter((p) => p.tier === 'watch').length + weakOnes.length,
      insufficient: productRows.filter((p) => p.tier === 'insufficient').length,
      totalPosts: win4.totals.posts,
      totalEngagement: win4.totals.engagement,
      totalConversions: win4.totals.conversions,
      topProduct: winners[0]?.product || null
    }
  };

  // Ghi period là TUẦN TỚI (tuần bắt đầu Thứ 2 kế tiếp) — kế hoạch này áp cho tuần đó. Chạy bù sáng
  // thứ Hai thì "tuần tới" chính là tuần vừa bắt đầu hôm nay.
  const nextMonday = mondayCatchUp ? now : new Date(now.getTime() + 24 * 60 * 60 * 1000);
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
  const planId = ((data as any)?.id as string) || null;
  // Học bù sáng Thứ 2: kế hoạch tuần mới có thể đã được áp (rotate 8h) trước lượt học này, gộp luôn.
  if (planId) {
    try { await mergeLearnIntoApplied(client, planId, 'cron', nextWin.start); } catch (e: any) {
      console.error('[learn-weekly] gop trong so vao ke hoach dang ap loi (bo qua):', e?.message || e);
    }
  }
  return { planId, ranked: plan.summary.ranked };
}

// Gộp trọng số + bậc sản phẩm của một bản học tuần vào kế hoạch ĐANG ÁP, giữ nguyên hướng đi. weekStart có thì chỉ
// gộp khi kế hoạch đang áp đúng là của tuần đó (bản học Chủ nhật không được đè lên kế hoạch tuần cũ sắp hết).
// Dùng chung cho nút "Áp dụng đề xuất" (app/actions.ts) và tự gộp Thứ 2. Trả id bản được gộp vào, null nếu bỏ qua.
export async function mergeLearnIntoApplied(client: Client, learnPlanId: string, actor: 'cron' | 'nguoi-bam', weekStart?: string): Promise<string | null> {
  const { data: incoming } = await client.from('mkt_plans').select('id, data, applied_at').eq('id', learnPlanId).maybeSingle();
  const inData = ((incoming as any)?.data || {}) as any;
  if (!incoming || inData.origin !== 'learn-weekly') return null;
  const { data: base } = await client.from('mkt_plans').select('id, period_start, data').eq('applied', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const baseData = ((base as any)?.data || {}) as any;
  if (!(base as any)?.id || !Array.isArray(baseData.content_suggestions) || !baseData.content_suggestions.length) return null;
  if (weekStart && (base as any).period_start !== weekStart && baseData.proposal?.week_start !== weekStart) return null;
  if (baseData.appliedLearnPlanId === learnPlanId) return (base as any).id;
  const nowIso = new Date().toISOString();
  const merged = {
    ...baseData,
    weights: inData.weights || baseData.weights,
    products: inData.products || baseData.products,
    summary: { ...(baseData.summary || {}), ...(inData.summary || {}) },
    narrative: [`Đã áp đề xuất cuối tuần: ${(inData.narrative || [])[0] || ''}`, ...(baseData.narrative || [])].slice(0, 6),
    appliedLearnPlanId: learnPlanId,
    appliedLearnAt: nowIso,
  };
  const { error } = await client.from('mkt_plans').update({ data: merged, applied_at: nowIso }).eq('id', (base as any).id);
  if (error) throw new Error(error.message);
  // Đánh dấu bản học đã áp (để nút không hiện lại), không set applied cho nó.
  await client.from('mkt_plans').update({ applied_at: nowIso }).eq('id', learnPlanId);
  try { await client.from('run_log').insert({ task: 'mkt.apply_learn', actor, status: 'ok', detail: { planId: learnPlanId, mergedInto: (base as any).id, weights: inData.weights || null } }); } catch { /* bỏ qua */ }
  return (base as any).id;
}

function isMondayVN(now: Date): boolean {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCDay() === 1;
}

// Chạy Chủ Nhật giờ VN từ 20h (29/8 user đổi 19h -> 20h), HOẶC chạy bù sáng thứ Hai trước 12h.
// 15/10 (Thanh hỏi các AI có chạy đúng plan): từ 22/9 cron GitHub kéo số liệu 6 tiếng một lần
// (1h/7h/13h/19h VN) nên không lượt nào rơi vào CN >= 20h; task Windows mỗi giờ chỉ chạy khi máy bật,
// CN máy thường tắt -> lần chạy cuối 27/9. Lượt 1h/7h sáng thứ Hai giờ bắt được. alreadyRanThisWeek
// (24 giờ) chặn trùng khi CN tối đã chạy rồi.
export function shouldRunLearnWeekly(now: Date = new Date()): boolean {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dow = vn.getUTCDay(); // 0 = CN
  const hour = vn.getUTCHours();
  return (dow === 0 && hour >= 20) || (dow === 1 && hour < 12);
}
