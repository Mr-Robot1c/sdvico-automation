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
// @ts-ignore — module JS thuần
import { guessGroup } from './gen/products.mjs';
import { loadRecentKnowledge } from './knowledge';

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

export type KnowledgeUsed = {
  // Số bản ghi tri thức 7 ngày qua được đọc để sinh kế hoạch. Cặp (internal, public).
  internal: number;
  publicSrc: number;
  // Vài mục đáng chú ý để hiển thị trên trang Kế hoạch (giữ nhỏ để không phình mkt_plans.data).
  internalHighlights: Array<{ id: string; title: string | null; needs_gov_review: boolean }>;
  publicHighlights: Array<{ id: string; source_title: string | null; source_url: string; needs_gov_review: boolean }>;
};

// Hướng đi nội dung tuần tới, sinh từ tri thức nội bộ + public bởi Gemini/Claude
// (xem apps/approval-ui/scripts/generate-plan-directions.mjs). Vòng xoay sinh bài đọc
// content_suggestions này để chọn góc bài đăng bám tri thức thật, không sinh chung chung.
export type ContentDirection = {
  title: string;                    // Tiêu đề gợi ý bài đăng, 5-10 chữ
  why: string;                      // Vì sao tuần này nên đăng chủ đề này (dựa tri thức nào)
  product: string;                  // Sản phẩm chính bài này nói tới
  kind: string;                     // checklist | qa | tip | engage | glossary | news
  sources: string[];                // Nguồn tri thức đã dùng, vd ["public #7", "noi bo #2"]
  needs_gov_review: boolean;        // Nguồn chạm quy định thì bài theo hướng này cũng cần duyệt QL
  used_at?: string;                 // Rotate đánh dấu khi hướng này đã sinh cặp bài A/B (không lặp)
  carried?: boolean;                // Hướng giữ lại từ bản trước (chưa dùng); thiếu cờ = hướng MỚI của bản này
};

// Một ngày trong lịch BOSS đề xuất: sản phẩm bán + số bài, số bài content, nhóm chia sẻ.
export type DailyPlan = {
  date: string;        // YYYY-MM-DD (giờ VN)
  dow: string;         // "Thứ 2".."Chủ nhật"
  sales: Array<{ product: string; count: number }>;
  contentCount: number;
  // v6 (20/8, user: "ghi rõ là content gì"): loại bài content BOSS định cho ngày đó
  // (qa | checklist | glossary | tip | engage | portrait). Rotate đọc để sinh ĐÚNG loại.
  contentKind?: string;
  contentKindLabel?: string;
  contentPurpose?: string;   // bài content này ĐỂ LÀM GÌ cho bà con (user 24/8) // nhãn tiếng Việt hiển thị ("Hỏi Đáp"...)
  // v7 (20/8, user: "kế hoạch phải chi tiết hơn — hướng đi gì, cấu trúc ra sao"):
  // hướng đi DỰ KIẾN cho bài bán ngày đó (map từ content_suggestions chưa dùng của bản đang
  // áp, theo đúng thứ tự vòng xoay sẽ rút). Chỉ để hiển thị; rotate vẫn tự rút lúc chạy.
  direction?: { title: string; product: string; variant: 'A' | 'B' | 'AB'; done?: boolean } | null;
  contentStructure?: string; // cấu trúc 1 dòng của bài content ("❓ Hỏi 1 câu → 💡 Đáp 3-5 câu")
  groups: string[];    // tên nhóm chia sẻ hôm đó
};

export type Plan = {
  generatedAt: string;
  threshold: number;
  weeklyBudget: number;
  products: PlanProduct[];
  weights: Record<string, number>; // product -> mức ưu tiên, cho /api/rotate
  narrative: string[];
  // v9 (22/8, user chốt nguyên tắc BOSS): bản tuần lấy số liệu TUẦN VỪA XONG (đo lường theo
  // tuần -> kế hoạch tổng quát tuần sau); ghi rõ nguồn để /ke-hoach hiện. Số liệu NGÀY chỉ
  // điều chỉnh dần qua applyLiveEvening (adjust_log ghi từng tối dịch bao nhiêu).
  measurement_source?: string;
  adjust_log?: Array<{ at: string; product: string; from: number; to: number; target: number }>;
  // v3 (18/8): mục tiêu tuần do người giao (app_config mkt_weekly_goal) tại thời điểm sinh bản này.
  goal?: string;
  // v3 (18/8): nhịp bản này — 'weekly' (Thứ 2, kế hoạch tuần), 'update' (Thứ 4, cập nhật lần 1),
  // 'manual' (bấm tay). Bản cũ không có -> undefined.
  cadence?: 'weekly' | 'update' | 'manual';
  // v4 (20/8, item 1b): nguồn sinh — 'boss' hoặc undefined = BOSS đề xuất từ tri thức + số liệu
  // (chức năng cũ), 'learn-weekly' = vòng học tự động Chủ nhật, đề xuất trọng số dựa CHỦ YẾU
  // vào số liệu tuần vừa qua. Khối riêng ở /ke-hoach; khi bấm Áp dụng thì rotate đọc weights.
  // 'live' = đề xuất SỐNG: BOSS cập nhật mỗi 30 phút từ số liệu mới nhất, mỗi tối tự áp dụng
  // (user 20/8). Kèm lịch theo ngày + phân nhóm chia sẻ.
  origin?: 'boss' | 'learn-weekly' | 'live';
  // v5 (20/8): lịch theo NGÀY do BOSS đề xuất (sản phẩm nào mấy bài, chia sẻ vào nhóm nào).
  // Chỉ để HIỂN THỊ cho người làm, rotate không đọc (rotate vẫn theo slot + focus + weights).
  daily_schedule?: DailyPlan[];
  // v5 (20/8): danh sách 4 nhóm Facebook người dùng đang ở, để BOSS chia lịch chia sẻ.
  share_groups?: string[];
  // v2 (18/8): hướng đi cụ thể tuần tới, sinh từ tri thức. Bản cũ không có -> undefined.
  content_suggestions?: ContentDirection[];
  summary: {
    totalProducts: number;
    ranked: number;
    insufficient: number;
    totalPosts: number;
    totalEngagement: number;
    totalConversions: number;
    topProduct: string | null;
    // v2: số nguồn tri thức đã dùng cho lần sinh kế hoạch này. Bản v1 không có -> đọc ra undefined.
    knowledge?: KnowledgeUsed;
  };
};

// Tên sản phẩm của một bài: gộp biến thể tên về đúng MỘT sản phẩm.
// Ưu tiên: rotation_group thẳng (đã chọn folder chuẩn) → guessGroup(rot+keyword+title+draft snippet) →
// keyword thô → title thô. Bổ sung draft (300 ký tự đầu) để bắt bài Xưởng sản xuất tay có title
// không có tên SP nhưng thân bài nêu (vd "Chạy máy khoẻ" - thân bài có "Thiết bị lọc dầu SF-50").
function productOf(brief: any, title: string, draft: string = ''): string {
  const g = brief?.rotation_group as string | undefined;
  if (brief?.post_kind === 'content' || g === 'Bài content') return 'Bài content';
  // rotation_group đã là folder chuẩn -> dùng luôn, không cần guess.
  if (g && g !== 'Content' && /^\d+\.\s/.test(g)) return g.replace(/^\s*\d+\.\s*/, '').trim();
  const draftSnippet = String(draft || '').slice(0, 300);
  const guess = (guessGroup as (s: string) => string | null)(
    `${g || ''} ${brief?.keyword || ''} ${title || ''} ${draftSnippet}`
  );
  if (guess) return guess.replace(/^\s*\d+\.\s*/, '').trim();
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
  // Cửa sổ 7 ngày gần nhất: chỉ dùng snapshot mới trong tuần để lên kế hoạch T4/CN, không lấy
  // lịch sử vĩnh viễn (bài cũ đã lỗi thời không đại diện tình hình bây giờ).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: mrows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'facebook')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(500);

  const latest = new Map<string, FbMetrics>();
  for (const r of mrows || []) {
    const cid = (r as any).entity_ref as string | null;
    // Bỏ dòng PAGE-LEVEL (__page__/__page_real__ = đếm follower, thêm 19/8): không phải id
    // bài. Trước đây lọt vào danh sách cid làm query .in('id', ...) chết (không phải uuid)
    // -> tra tên bài về RỖNG -> mọi bài rơi vào "Khác" -> "Dẫn đầu là Khác" (gốc sâu nhất).
    if (!cid || cid.startsWith('__')) continue;
    if (!latest.has(cid)) latest.set(cid, ((r as any).metrics || {}) as FbMetrics);
  }

  const cids = [...latest.keys()];
  const contents = new Map<string, { title: string; product: string; conversions: number }>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief, draft').in('id', cids);
    for (const c of cs || []) {
      const brief = (c as any).brief || {};
      contents.set((c as any).id, {
        title: (c as any).title || '(không tên)',
        product: productOf(brief, (c as any).title, (c as any).draft),
        conversions: Number(brief.conversions) || 0
      });
    }
  }

  // CHỈ đếm bài còn tồn tại trong mkt_content. Bài đã XÓA vẫn còn snapshot trong mkt_metrics
  // (entity_ref mồ côi) — trước đây rơi hết vào nhóm "Khác", đủ 3 bài là BOSS xếp "Dẫn đầu là
  // Khác" vô nghĩa (user bắt 20/8). Bỏ bài ma khỏi đo lường kế hoạch.
  const perPost = cids
    .filter((cid) => contents.has(cid))
    .map((cid) => {
      const m = latest.get(cid) || {};
      const c = contents.get(cid)!;
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

// Tiêu đề hướng đi ĐÃ DÙNG 7 ngày qua (bài máy sinh có brief.suggestion_title) — đưa vào
// prompt sinh hướng mới để Gemini KHÔNG lặp lại chủ đề na ná (21/8: hướng "Lap dat may loc
// dau kip chuyen bien" trùng ý hướng vừa chạy hôm trước, dedupe theo title không bắt được).
export async function loadRecentDirectionTitles(client: Client): Promise<string[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  // 1. Tiêu đề hướng đi của các bài ĐÃ ĐĂNG 7 ngày qua.
  const { data: posted } = await client
    .from('mkt_content')
    .select('brief')
    .gte('created_at', sevenDaysAgo)
    .eq('brief->>generator', 'rotation')
    .limit(100);
  const postedTitles = (posted || [])
    .map((r: any) => String(r.brief?.suggestion_title || '').trim())
    .filter(Boolean);
  // 2. 24/8 (user "KHONG DUOC TRUNG"): CẢ hướng trong plan ĐANG ÁP (chưa đăng) — trước đây
  //    thiếu nên regen sinh lại y hệt 12 hướng của chính plan đang áp. Gộp vào avoidTitles.
  const { data: applied } = await client
    .from('mkt_plans').select('data').eq('applied', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const planTitles: string[] = Array.isArray((applied as any)?.data?.content_suggestions)
    ? (applied as any).data.content_suggestions.map((s: any) => String(s.title || '').trim()).filter(Boolean)
    : [];
  return [...new Set([...planTitles, ...postedTitles])].slice(0, 30);
}

// Thứ 4 (3) hoặc chủ nhật (0) theo giờ Việt Nam. Nhịp CŨ, giữ cho tương thích chỗ khác gọi.
export function isPlanDayVN(now: Date): boolean {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dow = vn.getUTCDay();
  return dow === 3 || dow === 0;
}

// Nhịp MỚI (user chốt 18/8, flowchart v3): Thứ 2 từ 8h sáng VN = kế hoạch TUẦN (BOSS đã gom
// đủ thông tin Chủ nhật); Thứ 6 từ 8h sáng VN = CẬP NHẬT lần 1 (user dời từ Thứ 4 sang Thứ 6
// "cho nó xa tí, vậy mới có số liệu" — 4 ngày bài chạy sau kế hoạch Thứ 2). Ngoài 2 khung đó
// không sinh. Cron 30 phút/lần nên chỗ gọi phải tự chặn trùng (1 bản cron mỗi ngày).
export function planSlotVN(now: Date): 'weekly' | 'update' | null {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dow = vn.getUTCDay();
  const hour = vn.getUTCHours();
  if (hour < 8) return null;
  if (dow === 1) return 'weekly';
  if (dow === 5) return 'update';
  return null;
}

// Mốc đầu ngày hôm nay theo giờ VN, trả ISO UTC — để đếm "hôm nay cron đã sinh bản nào chưa".
export function vnDayStartIso(now: Date): string {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const startUtcMs = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 60 * 60 * 1000;
  return new Date(startUtcMs).toISOString();
}

// Sinh 1 bản kế hoạch từ số liệu hiện tại rồi lưu vào mkt_plans (applied = false).
// Bot ĐỀ XUẤT, người quyết (điều cấm 1 và 2). Dùng chung cho cron, action tạo tay, và cron metrics-pull.
// v2 (18/8/2026): thêm nguyên liệu tri thức (nội bộ + public) 7 ngày qua vào plan.summary.knowledge.
// v3 (18/8/2026): mỗi bản TỰ KÈM hướng đi (content_suggestions, chỉ đạo cho AI Creator) qua
// Gemini — lỗi LLM không đánh hỏng bản kế hoạch, chỉ thiếu hướng đi (chạy tay bù sau).
// Đổi báo cáo TUẦN (week-report, T2..CN) sang dạng Measurement cho buildPlan. Dùng cho bản
// kế hoạch tuần (thứ 2): nguyên tắc user 22/8 — đo lường THEO TUẦN quyết định kế hoạch tổng
// quát tuần sau, không lấy 7 ngày trượt lẫn lộn hai tuần.
export async function loadMeasurementFromWeekReport(client: Client, weekOffset: number, now: Date = new Date()): Promise<{ m: Measurement; label: string } | null> {
  try {
    const { buildWeekReport } = await import('./week-report');
    const report = await buildWeekReport(client, weekOffset, now);
    if (!report || !report.totals.posts) return null;
    const products: ProductAgg[] = report.byProduct.map((p) => ({
      product: p.product,
      count: p.count,
      engagement: p.totalEng,
      conversions: p.conversions,
      avgEng: p.avgEng,
      avgConv: p.count ? Math.round((p.conversions / p.count) * 10) / 10 : 0,
    }));
    const m: Measurement = {
      products,
      totals: { posts: report.totals.posts, engagement: report.totals.engagement, conversions: report.totals.conversions },
      topPosts: report.topPosts.map((t) => ({ title: t.title, product: t.product, engagement: t.m.engagement })),
    };
    const w: any = report.window || {};
    // w.label da co san chu "Tuan truoc (...)" — dung them tien to "tuan" keo lap chu (24/8).
    const label = w.label ? String(w.label) : `tuần ${String(w.start || w.startIso || '').slice(0, 10)} tới ${String(w.end || w.endIso || '').slice(0, 10)}`;
    return { m, label };
  } catch {
    return null;
  }
}

export async function generateAndStorePlan(
  client: Client,
  generatedBy: 'cron' | 'manual',
  opts: { cadence?: 'weekly' | 'update' } = {}
): Promise<{ id: string | null; plan: Plan }> {
  const now = new Date();
  // Bản TUẦN (thứ 2): số liệu = báo cáo TUẦN VỪA XONG. Bản cập nhật/tay: 7 ngày gần nhất.
  let measurementSource = '7 ngày gần nhất';
  let weeklyMeasurement: Measurement | null = null;
  if (opts.cadence === 'weekly') {
    // weekWindowVNOffset: offset DUONG = lui ve qua khu (+1 = tuan truoc). 24/8 tung truyen -1
    // (tuan sau, 0 bai) nen ban tuan dau tien roi ve "7 ngay gan nhat".
    const r = await loadMeasurementFromWeekReport(client, 1, now);
    if (r) { weeklyMeasurement = r.m; measurementSource = `đo lường ${r.label} (tuần vừa xong)`; }
  }
  const [measurement, knowledge, goalRes, focusRes] = await Promise.all([
    weeklyMeasurement ? Promise.resolve(weeklyMeasurement) : loadMeasurement(client),
    loadRecentKnowledge(client, 7, 30),
    client.from('app_config').select('value').eq('key', 'mkt_weekly_goal').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle(),
  ]);
  let goal = String(((goalRes.data as any)?.value?.text) || '').trim();
  // Sản phẩm TẬP TRUNG tuần (app_config mkt_focus, còn hạn) nối vào mục tiêu để BOSS sinh hướng đi
  // đúng các sản phẩm đó (rotate cũng lọc theo focus; nhất quán hai đầu).
  const fv = ((focusRes.data as any)?.value || {}) as { groups?: string[]; until?: string };
  const fGroups = Array.isArray(fv.groups) ? fv.groups.filter(Boolean) : [];
  if (fGroups.length && (!fv.until || new Date(fv.until).getTime() > Date.now())) {
    goal = `${goal ? goal + '\n' : ''}TẬP TRUNG TUẦN NÀY: chỉ đề xuất hướng đi bài bán cho các sản phẩm: ${fGroups.join(', ')} (tới ${fv.until ? new Date(fv.until).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'hết tuần'}). Bài content nuôi trang vẫn giữ.`;
  }
  const knowledgeUsed: KnowledgeUsed = {
    internal: knowledge.internal.length,
    publicSrc: knowledge.publicSrc.length,
    internalHighlights: knowledge.internal.slice(0, 5).map((k) => ({
      id: k.id,
      title: k.title,
      needs_gov_review: !!k.needs_gov_review,
    })),
    publicHighlights: knowledge.publicSrc.slice(0, 5).map((k) => ({
      id: k.id,
      source_title: k.source_title,
      source_url: k.source_url,
      needs_gov_review: !!k.needs_gov_review,
    })),
  };
  const plan = buildPlan(measurement, {
    generatedAt: now.toISOString(),
    knowledge: knowledgeUsed,
    goal: goal || undefined,
  });
  plan.cadence = opts.cadence || (generatedBy === 'manual' ? 'manual' : undefined);
  plan.measurement_source = measurementSource;
  plan.narrative = [`Nguồn số liệu của bản này: ${measurementSource}. Số liệu từng ngày chỉ điều chỉnh dần trọng số mỗi tối (tối đa 0,5 điểm), không thay kế hoạch tuần.`, ...plan.narrative];

  // Chỉ đạo cho AI Creator: sinh hướng đi từ chính tri thức vừa nạp. Lỗi -> bản kế hoạch
  // vẫn lưu, hướng đi trống (chạy tay scripts/generate-plan-directions.mjs bù).
  // Kèm danh sách hướng ĐÃ DÙNG 7 ngày để Gemini không sinh lại chủ đề na ná (21/8).
  try {
    const { generateContentDirections } = await import('./plan-directions');
    const avoidTitles = await loadRecentDirectionTitles(client);
    plan.content_suggestions = await generateContentDirections(
      { internal: knowledge.internal, publicSrc: knowledge.publicSrc },
      goal,
      avoidTitles,
      client
    );
  } catch (e: any) {
    console.error('[plan] sinh huong di that bai (ke hoach van luu):', e?.message || e);
    plan.content_suggestions = [];
  }

  // GIỮ LẠI hướng đi CHƯA DÙNG của bản đang áp (user 20/8: "tạo hướng đi mà chả thấy dùng"
  // — trước đây mỗi lần sinh bản mới là vứt hết hướng cũ chưa kịp dùng, đếm reset về 0).
  //
  // 24/8 (user "bam sinh ke hoach moi ma T3-T6 khong doi"): CARRY-OVER BUG lon — plan cu
  // luon co 12 fresh chua dung, carry lay het 12 + fresh moi -> slice(0,12) VUT HET fresh
  // moi. Vong lap: moi lan bam Luu = 12 huong y het lan truoc.
  //
  // FIX 24/8 - QUY TAC PHAN LOAI CARRY:
  //   pendingBs (ban A vua sinh, dang cho B) -> LUON carry (khong the bo, cap A/B chua xong)
  //   fresh chua dung -> carry TOI DA 4 (thay 12) -> giu 8 slot cho huong moi
  //   Neu generatedBy='manual' (nguoi CHU DONG bam) -> KHONG carry fresh, chi carry pendingBs
  //     (nguoi bam Luu = nguoi MUON huong moi, khong muon nhet huong cu cua cron sang nay).
  try {
    const { data: prevApplied } = await client
      .from('mkt_plans').select('data').eq('applied', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const prevSugs: ContentDirection[] = Array.isArray((prevApplied as any)?.data?.content_suggestions)
      ? (prevApplied as any).data.content_suggestions : [];
    const pendingBs = prevSugs.filter((s) => !s.used_at && (s as any).pending_variant === 'B');
    const freshCarry = prevSugs.filter((s) => !s.used_at && (s as any).pending_variant !== 'B');
    // Manual = nguoi bam: bo fresh cu. Cron = tu dong: giu toi da 4 fresh cu de khong mat sach.
    let carry = generatedBy === 'manual'
      ? [...pendingBs]
      : [...pendingBs, ...freshCarry.slice(0, 4)];
    // 24/8: focus dang ap -> loai huong cu KHONG thuoc focus.
    if (carry.length && fGroups.length && (!fv.until || new Date(fv.until).getTime() > Date.now())) {
      const keys = fGroups.map((g) => String(g).toLowerCase().trim()).filter(Boolean);
      carry = carry.filter((c) => {
        const p = String(c.product || '').toLowerCase();
        return keys.some((k) => p === k || p.includes(k) || k.includes(p));
      });
    }
    if (carry.length) {
      const seen = new Set(carry.map((s) => s.title.toLowerCase().trim()));
      const fresh = (plan.content_suggestions || []).filter((s) => !seen.has(s.title.toLowerCase().trim()));
      // Danh dau carried de UI phan biet huong giu lai voi huong ✨ MOI cua ban nay.
      plan.content_suggestions = [...carry.map((s) => ({ ...s, carried: true })), ...fresh].slice(0, 12);
    }
  } catch (e: any) {
    console.error('[plan] carry-over huong di loi (bo qua):', e?.message || e);
  }

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
// opts.knowledge (v2): số nguồn tri thức 7 ngày qua đã đọc — hiển thị lên trang Kế hoạch và
// đi vào narrative để bà con biết bản này bám bao nhiêu nguồn nội bộ + public.
export function buildPlan(
  m: Measurement,
  opts: { threshold?: number; weeklyBudget?: number; generatedAt: string; knowledge?: KnowledgeUsed; goal?: string } = { generatedAt: '' }
): Plan {
  const threshold = opts.threshold ?? 3;
  const weeklyBudget = opts.weeklyBudget ?? 14;
  const generatedAt = opts.generatedAt || '';
  const knowledge = opts.knowledge;
  const goal = opts.goal;

  // Xếp sản phẩm đủ mẫu theo đơn/lead trung bình rồi tương tác trung bình.
  // "Khác" (bài không nhận diện được sản phẩm) và "Bài content" (bài nuôi trang, không bán)
  // KHÔNG phải sản phẩm — cấm vào bảng xếp hạng/trọng số, kẻo ra câu "Dẫn đầu là Khác" vô
  // nghĩa và weights không khớp folder nào của vòng xoay (user bắt 20/8).
  const NOT_PRODUCT = new Set(['Khác', 'Bài content']);
  const realProducts = m.products.filter((p) => !NOT_PRODUCT.has(p.product));
  const ranked = realProducts
    .filter((p) => p.count >= threshold)
    .sort((a, b) => b.avgConv - a.avgConv || b.avgEng - a.avgEng);
  const insufficient = realProducts.filter((p) => p.count < threshold);

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
    topProduct: rankedPlan[0]?.product || null,
    knowledge,
  };

  return {
    generatedAt,
    threshold,
    weeklyBudget,
    products: all,
    weights,
    goal,
    narrative: buildNarrative(all, summary, weeklyBudget, threshold, knowledge, goal),
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
  threshold: number,
  knowledge?: KnowledgeUsed,
  goal?: string
): string[] {
  const paras: string[] = [];

  // Mục tiêu tuần do người giao đứng đầu bản kế hoạch. Trống thì BOSS TỰ định hướng từ dữ
  // liệu các AI đã học (người dùng chốt 18/8: "không biết làm gì thì BOSS cứ dựa vào dữ liệu").
  if (goal) {
    paras.push(`Mục tiêu tuần được giao: ${goal}`);
  } else {
    paras.push(
      'Tuần này chưa có mục tiêu cụ thể được giao, bot tự định hướng dựa trên dữ liệu đã học và số đo lường bên dưới.'
    );
  }

  // Đoạn mở đầu về nguồn tri thức đã đọc — bám AC-3 và AC-4 trong ba-spec (nếu cả hai == 0
  // thì phải nói rõ thiếu nguồn, không im lặng bỏ qua). Đoạn này CHẠY TRƯỚC early return
  // totalPosts=0 để bà con thấy AI có học thật, chưa xếp hạng được không phải vì AI im lặng.
  if (knowledge) {
    const nI = knowledge.internal;
    const nP = knowledge.publicSrc;
    if (nI === 0 && nP === 0) {
      paras.push(
        'Tuần này bản kế hoạch chỉ dựa trên số đo lường Facebook, chưa có nguồn tri thức nội bộ hay public nào trong 7 ngày qua. Muốn kế hoạch bám thực tế hơn, thả file nội bộ vào Kho tri thức, và chờ bot học nguồn public vào Chủ nhật.'
      );
    } else if (nI === 0 && nP > 0) {
      paras.push(
        `Tuần này đã học được ${vnInt(nP)} nguồn tri thức public ngành cá, chưa có nguồn nội bộ nào. Bổ sung nguồn nội bộ giúp kế hoạch bám sát chuyện thật của công ty hơn.`
      );
    } else if (nI > 0 && nP === 0) {
      paras.push(
        `Tuần này đã học được ${vnInt(nI)} bản ghi tri thức nội bộ, chưa có nguồn public nào (bot học vào Chủ nhật).`
      );
    } else {
      paras.push(
        `Tuần này đã học ${vnInt(nI)} bản ghi tri thức nội bộ và ${vnInt(nP)} nguồn tri thức public ngành cá. Cùng với số đo lường, đây là nguyên liệu cho các đoạn dưới đây.`
      );
    }
  }

  // Không có bài đo lường: nói rõ ngoài đoạn tri thức để bà con biết bước tiếp theo.
  if (s.totalPosts === 0) {
    paras.push(
      'Chưa có bài nào có số liệu nên chưa xếp hạng sản phẩm được. Đăng bài lên Facebook, chờ có tương tác rồi bấm Cập nhật số liệu ở trang Đo lường. Có số rồi kế hoạch sẽ bám vào đó mà định hướng.'
    );
    return paras;
  }

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
