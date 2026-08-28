import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { scoreUnscoredKnowledge } from '../../../lib/knowledge-public';

// 28/8: route CHAM DIEM TIER doc lap — cron mkt-metrics-pull lam qua nhieu viec (maxDuration
// 90s) nen buoc cham diem nam cuoi chuoi co the khong bao gio chay toi (user: "AI data 2 van
// chua cham diem"). Route nay chi cham diem, 60s tha ho. Goi tay hoac de kiem tra loi:
//   /api/knowledge-score?secret=<CRON_SECRET>&limit=20
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  if (secret) {
    const bearer = (req.headers.get('authorization') || '') === `Bearer ${secret}`;
    const query = url.searchParams.get('secret') === secret;
    if (!bearer && !query) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get('limit')) || 20));
  const client = getServerClient();
  const startedAt = Date.now();
  const r = await scoreUnscoredKnowledge(client, { limit });

  // Dem lai tong quan sau khi cham de user thay ngay ket qua.
  const { data: tierRows } = await client
    .from('mkt_knowledge_public')
    .select('tier')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .limit(500);
  const tiers = { S: 0, A: 0, B: 0, C: 0, unscored: 0 } as Record<string, number>;
  for (const row of tierRows || []) {
    const t = String((row as any).tier || '');
    if (t in tiers) tiers[t] += 1; else tiers.unscored += 1;
  }

  return NextResponse.json({
    ok: true,
    scored: r.scored,
    skipped: r.skipped || false,
    errors: r.errors,
    tiers_7_ngay: tiers,
    ms: Date.now() - startedAt,
    message: r.scored
      ? `Đã chấm ${r.scored} mục. Mở /agent xem Trending Digest.`
      : r.errors.length
        ? `Chấm thất bại: ${r.errors[0]}`
        : 'Không còn mục nào chưa chấm.',
  });
}
