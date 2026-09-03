// Đóng lại Cache-Control max-age=31536000 cho MỌI file đang nằm trong 2 bucket public
// (brand-assets, post-images) của project hiện tại. Chạy 1 lần sau khi đổi code upload:
//   node scripts/set-cache-brand-assets.mjs
// Cách làm: tải file về (authenticated) rồi upload upsert kèm cacheControl — Supabase không
// cho sửa metadata rời. Chỉ đụng file chưa có max-age=31536000.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire(process.cwd() + '/package.json');
const { createClient } = req('@supabase/supabase-js');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function walk(bucket, prefix = '') {
  const out = [];
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
  for (const e of data || []) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) out.push(...await walk(bucket, p)); // folder
    else out.push({ path: p, meta: e.metadata || {} });
  }
  return out;
}

for (const bucket of ['brand-assets', 'post-images']) {
  const files = await walk(bucket);
  let done = 0, skip = 0, err = 0;
  for (const f of files) {
    if (String(f.meta.cacheControl || '').includes('31536000')) { skip++; continue; }
    const dl = await client.storage.from(bucket).download(f.path);
    if (dl.error) { err++; console.log(`  X tải ${bucket}/${f.path}: ${dl.error.message}`); continue; }
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const up = await client.storage.from(bucket).upload(f.path, buf, {
      contentType: f.meta.mimetype || 'application/octet-stream', upsert: true, cacheControl: '31536000',
    });
    if (up.error) { err++; console.log(`  X up ${bucket}/${f.path}: ${up.error.message}`); continue; }
    done++;
  }
  console.log(`${bucket}: đóng cache ${done}, sẵn đúng ${skip}, lỗi ${err} / tổng ${files.length}`);
}
console.log('Xong.');
