// reset-public-knowledge.mjs - xoa TOAN BO mkt_knowledge_public de nhap lai voi parser sach.
// Chi dung khi sua parser va can wipe du lieu hong. NOI BO khong dung script nay.
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

const { count: before } = await client.from('mkt_knowledge_public').select('id', { count: 'exact', head: true });
console.log(`Truoc: ${before} ban ghi public`);

const del = await client.from('mkt_knowledge_public').delete().not('id', 'is', null);
if (del.error) { console.error('Xoa loi:', del.error.message); process.exit(1); }

const { count: after } = await client.from('mkt_knowledge_public').select('id', { count: 'exact', head: true });
console.log(`Sau: ${after} ban ghi public. Da xoa.`);
console.log('Chay lai: node apps/approval-ui/scripts/learn-public-rss.mjs');
