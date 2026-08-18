// check-all-buckets.mjs - liet ke moi bucket + tim folder "zalo" bat cu dau.
import { createClient } from '@supabase/supabase-js';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: buckets, error } = await client.storage.listBuckets();
if (error) { console.error('listBuckets:', error.message); process.exit(1); }

for (const b of buckets) {
  console.log(`\n== Bucket: ${b.name} (public=${b.public}) ==`);
  // Liet ke thu muc cap dau
  const { data: top } = await client.storage.from(b.name).list('', { limit: 100 });
  const folders = (top || []).filter((e) => !e.id);
  const files = (top || []).filter((e) => e.id);
  console.log(`  ${folders.length} folder, ${files.length} file cap dau`);
  for (const f of folders) console.log(`  📁 ${f.name}/`);

  // Neu co folder ten chua "zalo" hoac "kho tri thuc" -> di sau xem
  for (const f of folders) {
    if (/zalo|tri.?thuc|knowledge/i.test(f.name)) {
      const { data: sub } = await client.storage.from(b.name).list(f.name, { limit: 100 });
      console.log(`    → sub ${f.name}/: ${(sub || []).length} entry`);
      for (const s of sub || []) console.log(`      ${s.id ? '📄' : '📁'} ${s.name}`);
    }
  }
}
