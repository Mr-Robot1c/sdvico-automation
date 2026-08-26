import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { pullFacebookMetrics } from '../../../lib/fb-metrics';
import { generateAndStorePlan, planSlotVN, vnDayStartIso } from '../../../lib/plan';
import { importInternalFromBucket } from '../../../lib/knowledge';
import { learnPublicKnowledge, learnPublicDaily } from '../../../lib/knowledge-public';
import { evaluateAbPairs } from '../../../lib/evaluator';
import { pullTikTokMetrics } from '../../../lib/tiktok-metrics';
import { learnWeekly, shouldRunLearnWeekly } from '../../../lib/learn-weekly';
import { refreshLiveProposal, applyLiveEvening } from '../../../lib/plan-live';

// Kéo số liệu tương tác Facebook về mkt_metrics. Gọi bởi Vercel Cron (Authorization: Bearer
// CRON_SECRET) hoặc thủ công (?secret=CRON_SECRET).
//
// NHỊP VÒNG LẶP (user chốt 18/8, flowchart v3 — cron 30 phút/lần, gate theo ngày giờ VN):
//   HẰNG NGÀY : AI Data #1 import bucket nội bộ (phiên Zalo 16:00 đẩy file mỗi ngày)
//               + AI Data #2 học public qua Google News RSS (không quota)
//               + Evaluator so các cặp A/B đủ số liệu (chỉ query, rẻ)
//   CHỦ NHẬT  : thêm lượt quét public SÂU bằng Gemini grounding (hay 429, lỗi bỏ qua)
//               — ngày BOSS "thu thập tổng" trước kế hoạch tuần
//   THỨ 2 8h+ : BOSS sinh KẾ HOẠCH TUẦN (cadence weekly) từ mọi thứ đã gom, TỰ KÈM hướng đi
//   THỨ 6 8h+ : BOSS sinh bản CẬP NHẬT lần 1 (cadence update) — 4 ngày số liệu sau Thứ 2
//   Chặn trùng: mỗi ngày chỉ 1 bản cron (đếm mkt_plans generated_by=cron từ đầu ngày VN) —
//   trước đây thiếu chốt này nên ngày kế hoạch cron 30 phút sinh bản mới liên tục.
// Gộp ở đây vì Vercel Hobby chỉ cho 2 cron, và kế hoạch nên bám số liệu vừa cập nhật.
export const dynamic = 'force-dynamic';
// 90s: metrics + import + RSS + evaluator (+ Gemini directions ngày sinh kế hoạch).
export const maxDuration = 90;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const bearer = (req.headers.get('authorization') || '') === `Bearer ${secret}`;
    const query = url.searchParams.get('secret') === secret;
    if (!bearer && !query) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const client = getServerClient();
  const startedAt = Date.now();
  let res: any;
  try {
    res = await pullFacebookMetrics(client);
  } catch (e: any) {
    res = { pulled: 0, results: [{ error: String(e?.message || e) }] };
  }
  // YouTube Shorts (user 21/8): kéo view/like/comment các video đã đăng, ghi source='youtube'.
  // Lỗi không đánh hỏng phần Facebook.
  let yt: { pulled: number; errors: string[] } = { pulled: 0, errors: [] };
  try {
    const { pullYouTubeMetrics } = await import('../../../lib/youtube-metrics');
    yt = await pullYouTubeMetrics(client);
  } catch (e: any) {
    yt = { pulled: 0, errors: [String(e?.message || e).slice(0, 160)] };
  }
  // TikTok metrics (24/8: sandbox bat scope video.list -> keo view/like/comment). Loi bo qua
  // khong lam vo cron; log qua run_log de theo doi.
  let tt: { pulled: number; matched: number; errors: string[] } = { pulled: 0, matched: 0, errors: [] };
  try {
    tt = await pullTikTokMetrics(client);
  } catch (e: any) {
    tt = { pulled: 0, matched: 0, errors: [String(e?.message || e).slice(0, 160)] };
  }
  // GHI run_log mỗi lần chạy (18/8: mkt_metrics trống suốt mà không ai biết cron có chạy không
  // vì route này im lặng). Trang Dữ liệu AI + /api/fb-diag đọc được để chẩn đoán.
  try {
    const errs = Array.isArray(res?.results) ? res.results.filter((r: any) => r?.error).map((r: any) => String(r.error).slice(0, 200)) : [];
    // insightErr: lý do thiếu lượt xem/người xem (thường: token thiếu quyền read_insights). Ghi vài
    // dòng đầu để trang Dữ liệu/BOT nói được "có tương tác nhưng chưa có lượt xem vì ...".
    const insightErrs = Array.isArray(res?.results)
      ? Array.from(new Set(res.results.flatMap((r: any) => (Array.isArray(r?.insightErr) ? r.insightErr : []).map((e: any) => String(e).slice(0, 160))))).slice(0, 3)
      : [];
    const notes = Array.isArray(res?.results)
      ? Array.from(new Set(res.results.flatMap((r: any) => (Array.isArray(r?.note) ? r.note : []).map((e: any) => String(e).slice(0, 160))))).slice(0, 3)
      : [];
    await client.from('run_log').insert({
      task: 'mkt.metrics_pull',
      actor: 'cron',
      status: errs.length && !(res?.pulled > 0) ? 'error' : 'ok',
      detail: { pulled: res?.pulled ?? 0, errors: errs.slice(0, 5), insightErrs, notes, ytPulled: yt.pulled, ytErrors: yt.errors.slice(0, 3), ttPulled: tt.pulled, ttMatched: tt.matched, ttErrors: tt.errors.slice(0, 3), ms: Date.now() - startedAt },
    });
  } catch { /* không để lỗi ghi log làm hỏng cron */ }

  // HẰNG NGÀY — AI Data #1: import file mới từ bucket Kho tri thức nội bộ (zalo-insight
  // phiên 16:00 đẩy lên). Idempotent theo source_path, file cũ tự bỏ qua.
  // Lỗi ở từng khối KHÔNG được đánh hỏng metrics-pull hoặc plan.
  const knowledge: { internal: any; publicSrc: any; publicDeep: any } = { internal: null, publicSrc: null, publicDeep: null };
  try {
    knowledge.internal = await importInternalFromBucket(client, { limit: 30 });
  } catch (e: any) {
    console.error('[knowledge] import internal that bai:', e?.message || e);
    knowledge.internal = { error: e?.message || String(e) };
  }

  // HẰNG NGÀY — AI Data #2: học public qua Google News RSS (không quota, dedup URL 30 ngày).
  try {
    knowledge.publicSrc = await learnPublicDaily(client);
  } catch (e: any) {
    console.error('[knowledge] hoc public RSS that bai:', e?.message || e);
    knowledge.publicSrc = { error: e?.message || String(e) };
  }

  // 2 NGÀY/LẦN sáng 7-10h VN (user 26/8 chốt: "điều chỉnh 2 ngày 1 lần quét đi" — trung
   // hòa độ tươi vs chi phí token). Cron mkt-metrics-pull chạy mỗi 1h, window 7-10h VN trúng
   // 3 slots — learnPublicKnowledge tự guard 48h qua run_log 'mkt.knowledge_public_deep'
   // nên ngày lẻ chạy 1 lần, ngày chẵn skip.
  const vnHour = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
  if (vnHour >= 7 && vnHour < 10) {
    try {
      knowledge.publicDeep = await learnPublicKnowledge(client);
    } catch (e: any) {
      console.error('[knowledge] quet sau public that bai:', e?.message || e);
      knowledge.publicDeep = { error: e?.message || String(e) };
    }
  }

  // HẰNG NGÀY — Evaluator so cặp A/B đủ số liệu, verdict ghi vào Kho tri thức nội bộ
  // (vòng lặp kín: bản kế hoạch nào sinh sau đó cũng đã học kết quả A/B). Chỉ query, rẻ.
  let evaluation: { pairs: number; verdicts: number; skipped: number } | null = null;
  try {
    const ev = await evaluateAbPairs(client);
    evaluation = { pairs: ev.pairs, verdicts: ev.verdicts, skipped: ev.skipped };
  } catch (e: any) {
    console.error('[evaluator] so cap A/B that bai:', e?.message || e);
  }

  // THỨ 2 (kế hoạch tuần) + THỨ 6 (cập nhật lần 1), từ 8h sáng VN, mỗi ngày đúng 1 bản cron.
  // Bản sinh ra TỰ KÈM hướng đi (generateAndStorePlan gọi Gemini directions bên trong).
  let plan: { id: string | null; ranked: number; cadence: string; directions: number } | { skipped: string } | null = null;
  // ?plan=1 (kèm CRON_SECRET): ép BOSS sinh kế hoạch NGAY + áp dụng, bỏ qua lịch T2/T6 và guard
  // 1 bản/ngày. Dùng khi người giao việc đổi mục tiêu/sản phẩm tập trung và muốn thấy liền
  // (GitHub workflow mkt-metrics-pull input force_plan=true).
  const planParam = new URL(req.url).searchParams.get('plan');
  const forcePlan = planParam === '1' || planParam === 'weekly';
  if (forcePlan) {
    // ?plan=weekly (24/8): ép ra BẢN TUẦN ngay (số liệu tuần vừa xong) không chờ 8h Thứ 2.
    // generatedBy 'cron' để guard 1-bản-cron/ngày chặn cron 8h khỏi sinh trùng.
    const forcedCadence: 'weekly' | 'update' = planParam === 'weekly' ? 'weekly' : 'update';
    try {
      const { id, plan: p } = await generateAndStorePlan(client, planParam === 'weekly' ? 'cron' : 'manual', { cadence: forcedCadence });
      if (id) {
        await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
        await client.from('mkt_plans').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', id);
      }
      plan = { id, ranked: p.summary.ranked, cadence: forcedCadence, directions: p.content_suggestions?.length || 0 };
    } catch (e: any) {
      console.error('[plan] ep sinh ke hoach that bai:', e?.message || e);
      plan = { skipped: 'loi: ' + String(e?.message || e) };
    }
    return NextResponse.json({ ok: true, ...res, knowledge, evaluation, plan, forced: true });
  }
  const slot = planSlotVN(new Date());
  if (slot) {
    const { count: cronToday } = await client
      .from('mkt_plans')
      .select('id', { count: 'exact', head: true })
      .eq('generated_by', 'cron')
      .gte('created_at', vnDayStartIso(new Date()));
    if (cronToday && cronToday > 0) {
      plan = { skipped: 'da co ban cron hom nay' };
    } else {
      try {
        const { id, plan: p } = await generateAndStorePlan(client, 'cron', { cadence: slot });
        // THỨ 2 = bản TUẦN: TỰ ÁP làm xương sống tuần (nguyên tắc user 22/8: đo lường tuần ->
        // kế hoạch tổng quát tuần sau; trước đây bản cron nằm applied=false nên không ai thấy
        // BOSS "ra kế hoạch tuần"). Hướng đi chưa dùng đã được carry-over bên trong. Bản cập nhật
        // thứ 6 vẫn chỉ đề xuất (số liệu ngày đã chỉnh dần mỗi tối rồi).
        let applied = false;
        if (slot === 'weekly' && id) {
          await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
          await client.from('mkt_plans').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', id);
          applied = true;
        }
        plan = { id, ranked: p.summary.ranked, cadence: slot, directions: p.content_suggestions?.length || 0 };
        try {
          await client.from('run_log').insert({ task: 'mkt.plan', actor: 'cron', status: 'ok', detail: { cadence: slot, planId: id, applied, directions: p.content_suggestions?.length || 0, measurement_source: p.measurement_source || null } });
        } catch { /* bỏ qua */ }
      } catch (e: any) {
        console.error('[plan] sinh ke hoach that bai:', e?.message || e);
        try { await client.from('run_log').insert({ task: 'mkt.plan', actor: 'cron', status: 'error', detail: { cadence: slot, error: String(e?.message || e) } }); } catch { /* bỏ qua */ }
      }
    }
  }

  // CHỦ NHẬT 23:00+ VN — vòng HỌC TUẦN (item 1b, 20/8). Đọc số liệu tuần vừa kết thúc, đề xuất
  // trọng số sản phẩm cho tuần tới. Ghi mkt_plans applied=false; người quản lí bấm Áp dụng ở
  // /ke-hoach mới có hiệu lực (ba-spec NV4/R5). ?learn=1 ép chạy ngoài lịch (dùng khi test).
  const forceLearn = new URL(req.url).searchParams.get('learn') === '1';
  let learn: { planId?: string | null; ranked?: number; skipped?: string; error?: string } | null = null;
  if (forceLearn || shouldRunLearnWeekly(new Date())) {
    try {
      const r = await learnWeekly(client, { force: forceLearn });
      learn = { planId: r.planId, ranked: r.ranked, skipped: r.skipped };
      if (!r.skipped) { try { await client.from('run_log').insert({ task: 'mkt.learn_weekly', actor: forceLearn ? 'manual' : 'cron', status: 'ok', detail: { planId: r.planId, ranked: r.ranked } }); } catch { /* bỏ qua */ } }
    } catch (e: any) {
      console.error('[learn-weekly] that bai:', e?.message || e);
      learn = { error: String(e?.message || e) };
    }
  }

  // NẠP LẠI HƯỚNG ĐI khi cạn (user 20/8: "Creator nhớ nhận hướng từ BOSS, học song song"):
  // bản đang áp hết suggestion chưa dùng -> Creator sẽ rơi về vòng xoay random. Mỗi ngày tối đa
  // 1 lần (guard run_log mkt.suggestions_refill), BOSS sinh thêm hướng đi MỚI từ tri thức mới
  // nhất (Gemini) nối vào bản đang áp — Creator luôn có hướng tươi bám tri thức.
  let refill: { added?: number; skipped?: string; error?: string } | null = null;
  try {
    const { data: ap } = await client
      .from('mkt_plans').select('id, data').eq('applied', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const sugs: any[] = Array.isArray((ap as any)?.data?.content_suggestions) ? (ap as any).data.content_suggestions : [];
    const fresh = sugs.filter((s) => !s.used_at).length;
    if (ap && fresh === 0) {
      const { count: doneToday } = await client
        .from('run_log').select('id', { count: 'exact', head: true })
        .eq('task', 'mkt.suggestions_refill').eq('status', 'ok')
        .gte('created_at', vnDayStartIso(new Date()));
      if (doneToday && doneToday > 0) {
        refill = { skipped: 'da nap hom nay' };
      } else {
        const { loadRecentKnowledge } = await import('../../../lib/knowledge');
        const { generateContentDirections } = await import('../../../lib/plan-directions');
        const { loadRecentDirectionTitles } = await import('../../../lib/plan');
        const knowledge = await loadRecentKnowledge(client, 7, 30);
        const { data: goalRow } = await client.from('app_config').select('value').eq('key', 'mkt_weekly_goal').maybeSingle();
        const goal = String(((goalRow as any)?.value?.text) || '').trim();
        const avoidTitles = await loadRecentDirectionTitles(client);
        const fresh2 = await generateContentDirections({ internal: knowledge.internal, publicSrc: knowledge.publicSrc }, goal, avoidTitles);
        if (fresh2.length) {
          const newData = { ...(ap as any).data, content_suggestions: [...sugs, ...fresh2] };
          await client.from('mkt_plans').update({ data: newData }).eq('id', (ap as any).id);
          try { await client.from('run_log').insert({ task: 'mkt.suggestions_refill', actor: 'cron', status: 'ok', detail: { added: fresh2.length } }); } catch { /* bo qua */ }
          refill = { added: fresh2.length };
        } else {
          refill = { skipped: 'gemini khong sinh duoc huong nao' };
        }
      }
    }
  } catch (e: any) {
    console.error('[refill] nap huong di that bai:', e?.message || e);
    refill = { error: String(e?.message || e) };
  }

  // ĐỀ XUẤT SỐNG (user 20/8): mỗi 30 phút BOSS cập nhật đề xuất (trọng số + số bài mỗi sản phẩm
  // + lịch theo ngày + nhóm chia sẻ) từ số liệu mới nhất. Rẻ (không Gemini), cập nhật tại chỗ 1
  // bản 'live'. Mỗi tối (>=19h VN, 1 lần/ngày) tự GỘP trọng số vào bản đang áp. ?live=1 ép áp ngay.
  const forceLive = new URL(req.url).searchParams.get('live') === '1';
  let live: { proposalId?: string | null; applied?: boolean; skipped?: string; error?: string } | null = null;
  try {
    const prop = await refreshLiveProposal(client);
    const ap = await applyLiveEvening(client, { force: forceLive });
    live = { proposalId: prop.id, applied: ap.applied, skipped: ap.skipped };
  } catch (e: any) {
    console.error('[plan-live] that bai:', e?.message || e);
    live = { error: String(e?.message || e) };
  }

  return NextResponse.json({ ok: true, ...res, knowledge, evaluation, plan, learn, live, refill });
}
