// lib/evaluator.ts — AI Đánh giá (Evaluator) trong flowchart v3 (docs/flowchart-v3.html).
//
// Việc: đọc các CẶP bài A/B (brief.ab_pair_id do rotate sinh), lấy số liệu Facebook mới nhất
// của từng bản, so bản nào ăn khách hơn, rồi GHI VERDICT NGƯỢC VỀ KHO TRI THỨC NỘI BỘ
// (mkt_knowledge_internal, source_path = 'evaluator/<pair>'). Nhờ đó vòng sinh Kế hoạch +
// hướng đi tuần sau TỰ ĐỌC verdict như một nguồn tri thức — đúng vòng lặp kín "BOSS gửi
// kết quả về các AI học tiếp" mà không cần bảng mới.
//
// Thước đo hiện tại: lượt tương tác Facebook (reactions + comments + shares) vì AD trả phí
// đang hoãn. Khi AD chạy, nâng cấp đọc CPC + click-to-action theo flowchart.
// Upsert theo source_path: số liệu lớn dần thì verdict tự cập nhật, không tạo bản trùng.

import type { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

type Side = { id: string; title: string; variant: string; engagement: number };

function vnInt(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString('vi-VN');
}

export async function evaluateAbPairs(
  client: Client
): Promise<{ pairs: number; verdicts: number; skipped: number; details: Array<{ pair: string; winner?: string; reason?: string }> }> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Bài thuộc cặp A/B trong 30 ngày qua.
  const { data: rows } = await client
    .from('mkt_content')
    .select('id, title, brief, created_at')
    .gte('created_at', since)
    .not('brief->ab_pair_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300);

  const byPair = new Map<string, { sugTitle: string; sides: Array<{ id: string; title: string; variant: string }> }>();
  for (const r of rows || []) {
    const b = (r as any).brief || {};
    const pid = String(b.ab_pair_id || '');
    if (!pid) continue;
    if (!byPair.has(pid)) byPair.set(pid, { sugTitle: String(b.suggestion_title || (r as any).title || ''), sides: [] });
    byPair.get(pid)!.sides.push({
      id: (r as any).id as string,
      title: ((r as any).title as string) || '',
      variant: String(b.ab_variant || '?'),
    });
  }

  // Số liệu FB mới nhất mỗi bài.
  const ids = (rows || []).map((r: any) => r.id as string);
  const latestEng = new Map<string, number>();
  if (ids.length) {
    const { data: mrows } = await client
      .from('mkt_metrics')
      .select('entity_ref, metrics, created_at')
      .eq('source', 'facebook')
      .in('entity_ref', ids)
      .order('created_at', { ascending: false })
      .limit(1000);
    for (const m of mrows || []) {
      const cid = (m as any).entity_ref as string | null;
      if (!cid || latestEng.has(cid)) continue;
      const mm = ((m as any).metrics || {}) as { reactions?: number; comments?: number; shares?: number };
      latestEng.set(cid, (mm.reactions || 0) + (mm.comments || 0) + (mm.shares || 0));
    }
  }

  let verdicts = 0;
  let skippedCount = 0;
  const details: Array<{ pair: string; winner?: string; reason?: string }> = [];

  for (const [pid, p] of byPair) {
    if (p.sides.length < 2) {
      skippedCount += 1;
      details.push({ pair: pid, reason: 'thieu 1 ben (chua du cap)' });
      continue;
    }
    const scored: Side[] = p.sides.map((s) => ({ ...s, engagement: latestEng.get(s.id) ?? -1 }));
    // Bản nào chưa có số liệu (chưa đăng hoặc FB chưa kéo về) -> chưa so được.
    if (scored.some((s) => s.engagement < 0)) {
      skippedCount += 1;
      details.push({ pair: pid, reason: 'chua du so lieu ca 2 ben' });
      continue;
    }
    // Cả hai bằng 0 -> chưa có gì để kết luận.
    if (scored.every((s) => s.engagement === 0)) {
      skippedCount += 1;
      details.push({ pair: pid, reason: 'ca 2 ben deu 0 tuong tac' });
      continue;
    }
    scored.sort((a, b) => b.engagement - a.engagement);
    const win = scored[0];
    const lose = scored[scored.length - 1];
    const summary = [
      `Cặp bài thử A/B cho hướng "${p.sugTitle}": bản ${win.variant} ("${win.title}") được ${vnInt(win.engagement)} lượt tương tác,`,
      `bản ${lose.variant} ("${lose.title}") được ${vnInt(lose.engagement)}.`,
      `Vòng sau nên ưu tiên cách viết của bản ${win.variant}.`,
    ].join(' ');

    const up = await client.from('mkt_knowledge_internal').upsert(
      {
        source_path: `evaluator/${pid}`,
        title: `Đánh giá A/B: ${p.sugTitle}`.slice(0, 200),
        summary: summary.slice(0, 2000),
        raw_excerpt: JSON.stringify(scored).slice(0, 5000),
        needs_gov_review: false,
      },
      { onConflict: 'source_path' }
    );
    if (up.error) {
      skippedCount += 1;
      details.push({ pair: pid, reason: 'upsert loi: ' + up.error.message });
      continue;
    }
    verdicts += 1;
    details.push({ pair: pid, winner: win.variant });
  }

  return { pairs: byPair.size, verdicts, skipped: skippedCount, details };
}
