// run-evaluator.mjs - chay tay AI Danh gia (Evaluator): so cac cap bai A/B theo tuong tac FB,
// ghi verdict nguoc ve Kho tri thuc noi bo (mkt_knowledge_internal, source_path=evaluator/<pair>)
// de vong sinh Ke hoach sau tu hoc. Ban mjs doc lap cho may noi bo; ban chinh chay tren
// Vercel la lib/evaluator.ts (gop trong cron mkt-metrics-pull T4 + CN).
//
// Chay:
//   node apps/approval-ui/scripts/run-evaluator.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse } from 'node:path';

function parseEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {}
  return out;
}
function loadRealEnv() {
  let dir = dirname(fileURLToPath(import.meta.url));
  const root = parse(dir).root;
  while (true) {
    const p = join(dir, '.env');
    if (existsSync(p)) {
      const e = parseEnv(p);
      if ((e.SUPABASE_URL || '').includes('supabase.co')) {
        for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
        return process.env;
      }
    }
    if (dir === root) break;
    dir = dirname(dir);
  }
  return process.env;
}
const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const vnInt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const since = new Date(Date.now() - 30 * 86400000).toISOString();

const { data: rows } = await client
  .from('mkt_content')
  .select('id, title, brief, created_at')
  .gte('created_at', since)
  .not('brief->ab_pair_id', 'is', null)
  .order('created_at', { ascending: false })
  .limit(300);

const byPair = new Map();
for (const r of rows || []) {
  const b = r.brief || {};
  const pid = String(b.ab_pair_id || '');
  if (!pid) continue;
  if (!byPair.has(pid)) byPair.set(pid, { sugTitle: String(b.suggestion_title || r.title || ''), sides: [] });
  byPair.get(pid).sides.push({ id: r.id, title: r.title || '', variant: String(b.ab_variant || '?') });
}
console.log(`Tim thay ${byPair.size} cap A/B trong 30 ngay.`);

const ids = (rows || []).map((r) => r.id);
const latestEng = new Map();
if (ids.length) {
  const { data: mrows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'facebook')
    .in('entity_ref', ids)
    .order('created_at', { ascending: false })
    .limit(1000);
  for (const m of mrows || []) {
    const cid = m.entity_ref;
    if (!cid || latestEng.has(cid)) continue;
    const mm = m.metrics || {};
    latestEng.set(cid, (mm.reactions || 0) + (mm.comments || 0) + (mm.shares || 0));
  }
}

let verdicts = 0, skipped = 0;
for (const [pid, p] of byPair) {
  if (p.sides.length < 2) { skipped++; console.log(`  ${pid}: thieu 1 ben, bo qua`); continue; }
  const scored = p.sides.map((s) => ({ ...s, engagement: latestEng.get(s.id) ?? -1 }));
  if (scored.some((s) => s.engagement < 0)) { skipped++; console.log(`  ${pid}: chua du so lieu 2 ben`); continue; }
  if (scored.every((s) => s.engagement === 0)) { skipped++; console.log(`  ${pid}: ca 2 ben 0 tuong tac`); continue; }
  scored.sort((a, b) => b.engagement - a.engagement);
  const win = scored[0], lose = scored[scored.length - 1];
  const summary = `Cặp bài thử A/B cho hướng "${p.sugTitle}": bản ${win.variant} ("${win.title}") được ${vnInt(win.engagement)} lượt tương tác, bản ${lose.variant} ("${lose.title}") được ${vnInt(lose.engagement)}. Vòng sau nên ưu tiên cách viết của bản ${win.variant}.`;
  const up = await client.from('mkt_knowledge_internal').upsert({
    source_path: `evaluator/${pid}`,
    title: `Đánh giá A/B: ${p.sugTitle}`.slice(0, 200),
    summary: summary.slice(0, 2000),
    raw_excerpt: JSON.stringify(scored).slice(0, 5000),
    needs_gov_review: false,
  }, { onConflict: 'source_path' });
  if (up.error) { skipped++; console.log(`  ${pid}: upsert loi ${up.error.message}`); continue; }
  verdicts++;
  console.log(`  ✓ ${pid}: ban ${win.variant} thang (${vnInt(win.engagement)} vs ${vnInt(lose.engagement)})`);
}
console.log(`\nXong: ${verdicts} verdict, ${skipped} bo qua. Verdict nam trong Kho tri thuc (/kho-tri-thuc) va se duoc doc khi sinh Ke hoach + huong di lan sau.`);
