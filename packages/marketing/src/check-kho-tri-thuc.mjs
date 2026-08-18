// check-kho-tri-thuc.mjs - liet ke file trong bucket kho-tri-thuc-noi-bo (uu tien prefix zalo/).
// Dung tay de kiem tra truoc khi trigger import.
import { createClient } from '@supabase/supabase-js';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const client = createClient(url, key, { auth: { persistSession: false } });

async function listAll(prefix = '') {
  const out = [];
  const stack = [prefix];
  while (stack.length) {
    const p = stack.pop();
    const { data, error } = await client.storage.from('kho-tri-thuc-noi-bo').list(p, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) { console.error(`list ${p}:`, error.message); continue; }
    for (const e of data || []) {
      const full = p ? `${p}/${e.name}` : e.name;
      if (!e.id) { stack.push(full); continue; }
      out.push({ path: full, size: e.metadata?.size, updated_at: e.updated_at });
    }
  }
  return out;
}

const files = await listAll('');
console.log(`Bucket kho-tri-thuc-noi-bo: ${files.length} file`);
for (const f of files) {
  const kb = f.size ? Math.round(f.size / 1024) : '?';
  console.log(`  ${f.path}  (${kb} KB)  ${f.updated_at || ''}`);
}
