import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { pullFacebookMetrics } from '../../../lib/fb-metrics';
import { generateAndStorePlan, planSlotVN, vnDayStartIso } from '../../../lib/plan';
import { importInternalFromBucket } from '../../../lib/knowledge';
import { learnPublicKnowledge, learnPublicDaily, isSundayVN } from '../../../lib/knowledge-public';
import { evaluateAbPairs } from '../../../lib/evaluator';

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
//   THỨ 4 8h+ : BOSS sinh bản CẬP NHẬT lần 1 giữa tuần (cadence update)
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
  const res = await pullFacebookMetrics(client);

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

  // CHỦ NHẬT — lượt quét sâu bằng Gemini grounding (ngày BOSS thu thập tổng). Hay dính
  // quota 429; lỗi bỏ qua vì RSS hằng ngày đã phủ.
  if (isSundayVN(new Date())) {
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

  // THỨ 2 (kế hoạch tuần) + THỨ 4 (cập nhật lần 1), từ 8h sáng VN, mỗi ngày đúng 1 bản cron.
  // Bản sinh ra TỰ KÈM hướng đi (generateAndStorePlan gọi Gemini directions bên trong).
  let plan: { id: string | null; ranked: number; cadence: string; directions: number } | { skipped: string } | null = null;
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
        plan = { id, ranked: p.summary.ranked, cadence: slot, directions: p.content_suggestions?.length || 0 };
      } catch (e: any) {
        console.error('[plan] sinh ke hoach that bai:', e?.message || e);
      }
    }
  }

  return NextResponse.json({ ok: true, ...res, knowledge, evaluation, plan });
}
