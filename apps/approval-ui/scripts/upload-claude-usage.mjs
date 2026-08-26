// upload-claude-usage.mjs — quét jsonl Claude Code ở ~/.claude/projects/*SDVICO* → upsert
// vào Supabase table claude_code_usage. Dashboard "Quản trị token" (block Claude Code) đọc
// bảng này. User 26/8: sếp muốn thấy token dùng + quy đổi tiền (giả định trả API pricing).
//
// CHẠY:
//   node apps/approval-ui/scripts/upload-claude-usage.mjs
//
// LỊCH: cron Windows Task Scheduler 1h/lần (import file claude-usage-cron.xml cùng thư mục).
// Idempotent: dedupe theo message_id, chạy lại nhiều lần không duplicate.
//
// FIELDS mỗi jsonl line CÓ USAGE:
//   type='assistant' (thực tế: object không có type nhưng có message.role='assistant')
//   message.id                   = msg_XXX (dedupe key)
//   message.model                = claude-opus-4-8 / sonnet-4-5 / haiku-4-5 / ...
//   message.usage.input_tokens
//   message.usage.cache_creation_input_tokens
//   message.usage.cache_read_input_tokens
//   message.usage.output_tokens
//   timestamp                     = ISO
//   sessionId                     = UUID
//
// PRICING API (Aug 2026, https://www.anthropic.com/pricing) USD per 1M tokens:
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const MODEL_PRICING = {
  // key = substring match trong model name
  opus:   { in: 15,   out: 75,   cwrite: 18.75, cread: 1.5  },
  sonnet: { in: 3,    out: 15,   cwrite: 3.75,  cread: 0.3  },
  haiku:  { in: 0.8,  out: 4,    cwrite: 1,     cread: 0.08 },
  fable:  { in: 10,   out: 40,   cwrite: 12.5,  cread: 1    },
};
const USD_TO_VND = 26000; // xấp xỉ tháng 8/2026, hardcode đơn giản.

function detectPricing(model) {
  const m = String(model || '').toLowerCase();
  for (const [k, p] of Object.entries(MODEL_PRICING)) if (m.includes(k)) return { key: k, ...p };
  // Không rõ model → fallback Sonnet (giá giữa) để không under-estimate.
  return { key: 'unknown', ...MODEL_PRICING.sonnet };
}

function computeCostUSD(usage, pricing) {
  const inTok = Number(usage.input_tokens || 0);
  const outTok = Number(usage.output_tokens || 0);
  const cwTok = Number(usage.cache_creation_input_tokens || 0);
  const crTok = Number(usage.cache_read_input_tokens || 0);
  const cost = (inTok * pricing.in + outTok * pricing.out + cwTok * pricing.cwrite + crTok * pricing.cread) / 1_000_000;
  return { inTok, outTok, cwTok, crTok, cost };
}

// Nạp .env từ root Marketing (chứa SUPABASE_URL + SERVICE_ROLE_KEY).
function parseEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch { /* bỏ qua */ }
  return out;
}
function loadEnv() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const p = join(dir, '.env');
    if (existsSync(p)) {
      const e = parseEnv(p);
      if ((e.SUPABASE_URL || '').includes('supabase.co')) {
        for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
        return;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
loadEnv();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.');
  process.exit(1);
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Scan projects dir. User 26/8 chốt: chỉ project SDVICO Marketing (main + worktrees).
const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
if (!existsSync(CLAUDE_PROJECTS_DIR)) {
  console.error(`Không thấy ${CLAUDE_PROJECTS_DIR}. Đảm bảo Claude Code đã tạo folder này.`);
  process.exit(1);
}
const projectFolders = readdirSync(CLAUDE_PROJECTS_DIR)
  .filter((n) => /SDVICO-Marketing/i.test(n))
  .filter((n) => {
    try { return statSync(join(CLAUDE_PROJECTS_DIR, n)).isDirectory(); }
    catch { return false; }
  });

console.log(`Quét ${projectFolders.length} folder Claude Code:`);
for (const p of projectFolders) console.log(`  - ${p}`);

const rows = [];
let totalLines = 0;
let usageEvents = 0;

for (const folder of projectFolders) {
  const projectPath = join(CLAUDE_PROJECTS_DIR, folder);
  const jsonlFiles = readdirSync(projectPath).filter((n) => n.endsWith('.jsonl'));
  for (const fname of jsonlFiles) {
    const fpath = join(projectPath, fname);
    let content;
    try { content = readFileSync(fpath, 'utf8'); }
    catch (e) { console.warn(`  bỏ qua ${fname}: ${e.message}`); continue; }
    const sessionId = fname.replace(/\.jsonl$/, '');
    for (const line of content.split(/\r?\n/)) {
      totalLines++;
      if (!line.trim() || !line.includes('"usage"')) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      const msg = ev?.message;
      const usage = msg?.usage;
      if (!msg || !usage || !msg.id || !msg.model) continue;
      const pricing = detectPricing(msg.model);
      const { inTok, outTok, cwTok, crTok, cost } = computeCostUSD(usage, pricing);
      if (inTok + outTok + cwTok + crTok === 0) continue;
      usageEvents++;
      rows.push({
        message_id: msg.id,
        session_id: sessionId,
        project: folder,
        model: msg.model,
        ts: ev.timestamp || new Date().toISOString(),
        input_tokens: inTok,
        cache_creation_tokens: cwTok,
        cache_read_tokens: crTok,
        output_tokens: outTok,
        estimated_cost_usd: Number(cost.toFixed(6)),
        estimated_cost_vnd: Math.round(cost * USD_TO_VND),
      });
    }
  }
}

console.log(`\nTổng: ${totalLines} dòng jsonl, ${usageEvents} events có usage.`);
if (!rows.length) { console.log('Không có gì để upload.'); process.exit(0); }

// Dedupe rows trong lô này theo message_id (tránh Supabase báo "cannot affect same row twice"
// khi cùng message_id lặp — hiếm nhưng xảy ra khi jsonl bị append lỗi).
const dedupMap = new Map();
for (const r of rows) if (!dedupMap.has(r.message_id)) dedupMap.set(r.message_id, r);
const uniqRows = [...dedupMap.values()];
console.log(`Dedupe: ${rows.length} → ${uniqRows.length} unique rows.`);

// Upsert theo message_id. Chia batch 500 để không overload Supabase.
const BATCH = 500;
let inserted = 0;
let failed = 0;
for (let i = 0; i < uniqRows.length; i += BATCH) {
  const chunk = uniqRows.slice(i, i + BATCH);
  const { error, data } = await client.from('claude_code_usage').upsert(chunk, { onConflict: 'message_id', ignoreDuplicates: true }).select('id');
  if (error) {
    console.error(`Batch ${i}: ${error.message}`);
    failed += chunk.length;
  } else {
    inserted += (data?.length || 0);
    process.stdout.write(`.`);
  }
}
console.log(`\nUpsert: ${inserted} rows mới (bản cũ dedupe qua onConflict), ${failed} fail.`);

// Tóm tắt cost tổng (chỉ upsert lần này, không phải toàn DB).
const totalUsd = uniqRows.reduce((s, r) => s + r.estimated_cost_usd, 0);
const totalVnd = uniqRows.reduce((s, r) => s + r.estimated_cost_vnd, 0);
console.log(`\nTóm tắt lô này (nếu trả API):`);
console.log(`  Tổng: $${totalUsd.toFixed(2)} = ${totalVnd.toLocaleString('vi-VN')}đ`);
const byModel = new Map();
for (const r of uniqRows) {
  const p = detectPricing(r.model);
  const e = byModel.get(p.key) || { calls: 0, cost: 0 };
  e.calls++; e.cost += r.estimated_cost_usd;
  byModel.set(p.key, e);
}
for (const [k, v] of [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
  console.log(`  ${k.padEnd(8)} ${v.calls.toString().padStart(5)} calls · $${v.cost.toFixed(2)}`);
}

// Ghi run_log để tab Vận hành thấy script chạy.
try {
  await client.from('run_log').insert({
    task: 'mkt.claude_usage_sync',
    actor: 'cron',
    status: 'ok',
    detail: { rows: uniqRows.length, inserted, totalUsd: Number(totalUsd.toFixed(4)), totalVnd, folders: projectFolders.length },
  });
} catch { /* bỏ qua */ }
