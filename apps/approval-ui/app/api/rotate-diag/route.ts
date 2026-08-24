import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';

// Soi vi sao rotate chieu KHONG bam ke hoach BOSS (user 24/8: lich T2 = SEA-40 B nhung
// rotate chieu sinh Ac quy). Bao ve bang CRON_SECRET. Chi doc, khong sua.
// Dung: /api/rotate-diag?secret=<CRON_SECRET>
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = url.searchParams.get('secret') || '';
  if (secret && given !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = getServerClient();
  const out: any = {};

  // 1. Ban ke hoach dang ap.
  const { data: apRow } = await client
    .from('mkt_plans')
    .select('id, created_at, data')
    .eq('applied', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ap = apRow as any;
  if (!ap) return NextResponse.json({ error: 'khong co ban plan ap' });
  const sugs: any[] = Array.isArray(ap.data?.content_suggestions) ? ap.data.content_suggestions : [];
  const weights: Record<string, number> = ap.data?.weights || {};

  out.appliedPlan = {
    id: ap.id,
    createdAt: ap.created_at,
    cadence: ap.data?.cadence,
    origin: ap.data?.origin,
    weights,
    focus: ap.data?.focus || null,
    totalSuggestions: sugs.length,
  };

  // 2. Phan loai suggestion theo trang thai.
  const pendingBs = sugs.filter((s) => !s.used_at && s.pending_variant === 'B');
  const fresh = sugs.filter((s) => !s.used_at && !s.pending_variant);
  const used = sugs.filter((s) => s.used_at);

  out.suggestions = {
    pendingBs: pendingBs.map((s, i) => ({
      order: i,
      title: s.title,
      product: s.product,
      a_at: s.a_at || null,
      a_image_id: s.a_image_id || null,
    })),
    fresh: fresh.map((s) => ({ title: s.title, product: s.product })),
    usedCount: used.length,
  };

  // 3. TRA THU dung logic rotate chieu: candidates = pendingBs[0].
  out.rotateSimulation = {
    slot_chieu_picks_first: pendingBs[0]
      ? { title: pendingBs[0].title, product: pendingBs[0].product, a_at: pendingBs[0].a_at || null }
      : null,
    slot_sang_picks_first: (function () {
      const wOf = (s: any) => {
        const nm = String(s.product || '').toLowerCase();
        // Rough match: tim key weights chua from nao trong nm
        for (const [k, v] of Object.entries(weights)) if (nm.includes(k.toLowerCase())) return v;
        return 1;
      };
      const freshSorted = [...fresh].sort((a, b) => wOf(b) - wOf(a));
      const cand = [...pendingBs, ...freshSorted];
      return cand[0]
        ? { title: cand[0].title, product: cand[0].product, source: pendingBs.includes(cand[0]) ? 'pendingBs' : 'fresh', a_at: cand[0].a_at || null }
        : null;
    })(),
  };

  // 4. Bai rotate SINH HOM NAY VN (bam gio VN).
  const vnNow = new Date();
  const vnDate = new Date(vnNow.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const dayStartIso = new Date(vnDate + 'T00:00:00+07:00').toISOString();
  const { data: todayRows } = await client
    .from('mkt_content')
    .select('id, title, created_at, brief')
    .gte('created_at', dayStartIso)
    .eq('brief->>generator', 'rotation')
    .order('created_at', { ascending: false });
  out.todayGenerated = (todayRows || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    slot: r.brief?.rotation_slot || null,
    product: r.brief?.rotation_group || r.brief?.keyword,
    suggestion_title: r.brief?.suggestion_title || null,
    suggestion_index: r.brief?.suggestion_index ?? null,
    ab_variant: r.brief?.ab_variant || null,
    ab_pair_id: r.brief?.ab_pair_id || null,
    insight_line: r.brief?.insight_line || null,
    post_kind: r.brief?.post_kind || null,
  }));

  // 5. run_log rotate 10 lan gan nhat (soi slot nao chay/skipped).
  const { data: logs } = await client
    .from('run_log')
    .select('status, detail, created_at')
    .eq('task', 'mkt.rotate')
    .order('created_at', { ascending: false })
    .limit(10);
  out.recentRotateRuns = (logs || []).map((r: any) => ({
    at: r.created_at,
    status: r.status,
    slot: r.detail?.slot || null,
    reason: r.detail?.reason || null,
    focus: r.detail?.focus || null,
    resultCount: Array.isArray(r.detail?.results) ? r.detail.results.length : null,
    products: Array.isArray(r.detail?.results) ? r.detail.results.map((x: any) => ({ group: x.group, variant: x.variant, from_suggestion: x.from_suggestion })) : null,
  }));

  return NextResponse.json({ ok: true, ...out });
}
