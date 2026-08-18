// upload-zalo-to-bucket.mjs - upload file trong folder ./Zalo/ len bucket kho-tri-thuc-noi-bo/zalo/.
// Dung tay khi Cowork xuat xong xa file vao ./Zalo.
// Bo qua file da co tren bucket (theo ten). Bao 1 dong ket qua moi file.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const localDir = resolve(process.argv[2] || './Zalo');
const bucketPrefix = 'zalo';

// Content-type theo duoi file (Supabase can dung de serve dung).
function ctype(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.json') || n.endsWith('.jsonl')) return 'application/json';
  if (n.endsWith('.md')) return 'text/markdown';
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'text/html';
  if (n.endsWith('.txt')) return 'text/plain';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

let items;
try { items = readdirSync(localDir); }
catch (e) { console.error('Khong doc duoc thu muc', localDir, ':', e.message); process.exit(1); }

let uploaded = 0, skipped = 0, errors = 0;
for (const name of items) {
  const full = join(localDir, name);
  const st = statSync(full);
  if (!st.isFile()) continue;
  const remote = `${bucketPrefix}/${name}`;
  const buf = readFileSync(full);
  const up = await client.storage
    .from('kho-tri-thuc-noi-bo')
    .upload(remote, buf, { contentType: ctype(name), upsert: true });
  if (up.error) { console.error(`  X ${remote}: ${up.error.message}`); errors += 1; continue; }
  uploaded += 1;
  console.log(`  ✓ ${remote}  (${Math.round(buf.length / 1024)} KB)`);
}
console.log(`\nUpload xong: ${uploaded} moi, ${skipped} bo qua, ${errors} loi.`);
