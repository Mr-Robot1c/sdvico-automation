// lib/evaluator.ts — AI Đánh giá (Evaluator) trong flowchart v3 (docs/flowchart-v3.html).
//
// Việc: đọc các CẶP bài A/B (rotate sinh), lấy số liệu Facebook mới nhất của từng bản, so bản
// nào ăn khách hơn, rồi GHI VERDICT NGƯỢC VỀ KHO TRI THỨC NỘI BỘ (mkt_knowledge_internal,
// source_path = 'evaluator/<khóa cặp>'). Nhờ đó vòng sinh Kế hoạch + hướng đi tuần sau TỰ ĐỌC
// verdict như một nguồn tri thức — đúng vòng lặp kín "BOSS gửi kết quả về các AI học tiếp".
//
// KHÓA GHÉP CẶP (sửa 23/8): theo HƯỚNG ĐI (suggestion_title chuẩn hóa), KHÔNG theo ab_pair_id.
// Lý do: ab_pair_id = <planId>-s<idx>; kế hoạch tạo lại giữa chừng (carry-over hướng đi) làm bản
// B mang mã khác bản A (cặp lọc dầu a4513660-s1 / 75af5c08-s0) -> Evaluator không bao giờ so được.
// Bài không có suggestion_title thì vẫn rơi về ab_pair_id.
//
// Thước đo hiện tại: lượt tương tác Facebook (reactions + comments + shares) vì AD trả phí
// đang hoãn. Khi AD chạy, nâng cấp đọc CPC + click-to-action theo flowchart.
// Upsert theo source_path: số liệu lớn dần thì verdict tự cập nhật, không tạo bản trùng.

import type { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

export type AbSide = {
  id: string;
  title: string;
  variant: string;          // 'A' | 'B' | '?'
  createdAt: string;
  pairId: string;           // ab_pair_id gốc của bài (để dọn verdict cũ)
  insightLine: string | null;
  engagement: number | null; // null = chưa có số liệu FB
  reactions: number;
  comments: number;
  shares: number;
};

export type AbPair = {
  key: string;              // khóa ghép (hướng đi chuẩn hóa hoặc ab_pair_id)
  sugTitle: string;         // tên hướng đi
  sides: AbSide[];          // tối đa 1 bản mỗi biến thể (bản mới nhất)
  status: 'thieu_ben' | 'cho_so_lieu' | 'ca_hai_0' | 'da_ket_luan';
  winner?: string;          // biến thể thắng khi đã kết luận
  verdict?: string;         // câu kết luận (như ghi vào kho tri thức)
};

function vnInt(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString('vi-VN');
}

// Chuẩn hóa tiêu đề hướng đi thành khóa ascii ổn định (bỏ dấu, chữ thường, gạch nối).
export function normKey(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Đọc các cặp A/B 30 ngày + số liệu FB mới nhất, ghép theo hướng đi, kèm trạng thái so sánh.
// CHỈ ĐỌC (không ghi) — trang Nguồn dùng để hiện cách Evaluator so; evaluateAbPairs dùng để ghi.
export async function collectAbPairs(client: Client): Promise<AbPair[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await client
    .from('mkt_content')
    .select('id, title, brief, created_at')
    .gte('created_at', since)
    .not('brief->ab_pair_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300);

  const ids = (rows || []).map((r: any) => r.id as string);
  const latest = new Map<string, { reactions: number; comments: number; shares: number }>();
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
      if (!cid || latest.has(cid)) continue;
      const mm = ((m as any).metrics || {}) as { reactions?: number; comments?: number; shares?: number };
      latest.set(cid, { reactions: mm.reactions || 0, comments: mm.comments || 0, shares: mm.shares || 0 });
    }
  }

  const byKey = new Map<string, AbPair>();
  for (const r of rows || []) {
    const b = (r as any).brief || {};
    const pid = String(b.ab_pair_id || '');
    if (!pid) continue;
    const sug = String(b.suggestion_title || '').trim();
    const key = normKey(sug) || pid;
    if (!byKey.has(key)) byKey.set(key, { key, sugTitle: sug || String((r as any).title || ''), sides: [], status: 'thieu_ben' });
    const pair = byKey.get(key)!;
    const variant = String(b.ab_variant || '?');
    // rows đã sắp mới -> cũ: mỗi biến thể giữ bản MỚI NHẤT.
    if (pair.sides.some((s) => s.variant === variant)) continue;
    const m = latest.get((r as any).id as string) || null;
    pair.sides.push({
      id: (r as any).id as string,
      title: ((r as any).title as string) || '',
      variant,
      createdAt: String((r as any).created_at || ''),
      pairId: pid,
      insightLine: b.insight_line ? String(b.insight_line) : null,
      engagement: m ? m.reactions + m.comments + m.shares : null,
      reactions: m?.reactions || 0,
      comments: m?.comments || 0,
      shares: m?.shares || 0,
    });
  }

  for (const pair of byKey.values()) {
    pair.sides.sort((a, b) => a.variant.localeCompare(b.variant));
    if (pair.sides.length < 2) { pair.status = 'thieu_ben'; continue; }
    if (pair.sides.some((s) => s.engagement == null)) { pair.status = 'cho_so_lieu'; continue; }
    if (pair.sides.every((s) => (s.engagement || 0) === 0)) { pair.status = 'ca_hai_0'; continue; }
    const scored = pair.sides.slice().sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
    const win = scored[0];
    const lose = scored[scored.length - 1];
    pair.status = 'da_ket_luan';
    pair.winner = win.variant;
    pair.verdict = [
      `Cặp bài thử A/B cho hướng "${pair.sugTitle}": bản ${win.variant} ("${win.title}") được ${vnInt(win.engagement || 0)} lượt tương tác,`,
      `bản ${lose.variant} ("${lose.title}") được ${vnInt(lose.engagement || 0)}.`,
      `Vòng sau nên ưu tiên cách viết của bản ${win.variant}.`,
    ].join(' ');
  }
  return [...byKey.values()].sort((a, b) => (b.sides[0]?.createdAt || '').localeCompare(a.sides[0]?.createdAt || ''));
}

export async function evaluateAbPairs(
  client: Client
): Promise<{ pairs: number; verdicts: number; skipped: number; details: Array<{ pair: string; winner?: string; reason?: string }> }> {
  const pairs = await collectAbPairs(client);
  let verdicts = 0;
  let skippedCount = 0;
  const details: Array<{ pair: string; winner?: string; reason?: string }> = [];

  for (const p of pairs) {
    if (p.status !== 'da_ket_luan' || !p.verdict) {
      skippedCount += 1;
      details.push({ pair: p.key, reason: p.status === 'thieu_ben' ? 'thieu 1 ben (chua du cap)' : p.status === 'cho_so_lieu' ? 'chua du so lieu ca 2 ben' : 'ca 2 ben deu 0 tuong tac' });
      continue;
    }
    const up = await client.from('mkt_knowledge_internal').upsert(
      {
        source_path: `evaluator/${p.key}`,
        title: `Đánh giá A/B: ${p.sugTitle}`.slice(0, 200),
        summary: p.verdict.slice(0, 2000),
        raw_excerpt: JSON.stringify(p.sides.map((s) => ({ id: s.id, title: s.title, variant: s.variant, engagement: s.engagement }))).slice(0, 5000),
        needs_gov_review: false,
      },
      { onConflict: 'source_path' }
    );
    if (up.error) {
      skippedCount += 1;
      details.push({ pair: p.key, reason: 'upsert loi: ' + up.error.message });
      continue;
    }
    // Dọn verdict cũ ghi theo ab_pair_id (trước 23/8) để không có 2 bản cho cùng một cặp.
    const oldPaths = [...new Set(p.sides.map((s) => `evaluator/${s.pairId}`))].filter((x) => x !== `evaluator/${p.key}`);
    if (oldPaths.length) await client.from('mkt_knowledge_internal').delete().in('source_path', oldPaths);
    verdicts += 1;
    details.push({ pair: p.key, winner: p.winner });
  }

  return { pairs: pairs.length, verdicts, skipped: skippedCount, details };
}
