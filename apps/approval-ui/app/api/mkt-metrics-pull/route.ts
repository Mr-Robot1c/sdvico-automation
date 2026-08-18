import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { pullFacebookMetrics } from '../../../lib/fb-metrics';
import { isPlanDayVN, generateAndStorePlan } from '../../../lib/plan';
import { importInternalFromBucket } from '../../../lib/knowledge';
import { learnPublicKnowledge, isSundayVN } from '../../../lib/knowledge-public';
import { evaluateAbPairs } from '../../../lib/evaluator';

// Kéo số liệu tương tác Facebook về mkt_metrics. Gọi bởi Vercel Cron (Authorization: Bearer
// CRON_SECRET) hoặc thủ công (?secret=CRON_SECRET).
// Thứ 4 và chủ nhật: sau khi kéo số liệu mới, sinh luôn 1 bản kế hoạch (con bot định hướng).
// v2 (18/8/2026): Chủ nhật, TRƯỚC khi sinh kế hoạch, học tri thức public + import nội bộ để
// sáng Thứ 2 bản kế hoạch có đủ nguyên liệu 7 ngày qua.
// Gộp ở đây vì Vercel Hobby chỉ cho 2 cron, và kế hoạch nên bám số liệu vừa cập nhật.
export const dynamic = 'force-dynamic';
// Tăng maxDuration lên 90s vì có thêm 2 tác vụ Chủ nhật (import bucket + học public qua Gemini).
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

  // Chủ nhật: học tri thức public + import bucket TRƯỚC khi sinh kế hoạch.
  // Lỗi ở đây KHÔNG được đánh hỏng metrics-pull hoặc plan.
  let knowledge: { internal: any; publicSrc: any } | null = null;
  if (isSundayVN(new Date())) {
    knowledge = { internal: null, publicSrc: null };
    try {
      knowledge.internal = await importInternalFromBucket(client, { limit: 30 });
    } catch (e: any) {
      console.error('[knowledge] import internal that bai:', e?.message || e);
      knowledge.internal = { error: e?.message || String(e) };
    }
    try {
      knowledge.publicSrc = await learnPublicKnowledge(client);
    } catch (e: any) {
      console.error('[knowledge] hoc public that bai:', e?.message || e);
      knowledge.publicSrc = { error: e?.message || String(e) };
    }
  }

  // Thứ 4 + Chủ nhật: Evaluator so cặp A/B TRƯỚC khi sinh kế hoạch — verdict được ghi
  // vào Kho tri thức nội bộ nên bản kế hoạch sinh ngay sau đó đã học được kết quả A/B
  // (vòng lặp kín flowchart v3). Lỗi evaluator không đánh hỏng metrics-pull hay plan.
  let evaluation: { pairs: number; verdicts: number; skipped: number } | null = null;
  if (isPlanDayVN(new Date())) {
    try {
      const ev = await evaluateAbPairs(client);
      evaluation = { pairs: ev.pairs, verdicts: ev.verdicts, skipped: ev.skipped };
    } catch (e: any) {
      console.error('[evaluator] so cap A/B that bai:', e?.message || e);
    }
  }

  // Sinh kế hoạch vào thứ 4 và chủ nhật. Lỗi sinh kế hoạch không được đánh hỏng việc kéo số liệu.
  let plan: { id: string | null; ranked: number } | null = null;
  if (isPlanDayVN(new Date())) {
    try {
      const { id, plan: p } = await generateAndStorePlan(client, 'cron');
      plan = { id, ranked: p.summary.ranked };
    } catch (e: any) {
      console.error('[plan] sinh ke hoach that bai:', e?.message || e);
    }
  }

  return NextResponse.json({ ok: true, ...res, knowledge, evaluation, plan });
}
