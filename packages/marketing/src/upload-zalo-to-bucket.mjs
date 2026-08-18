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

// Bo qua tai lieu HUONG DAN / bi kip cua phien doc Zalo (khong phai tri thuc noi bo -> AI hoc
// nham, nhieu Nguon - bat duoc 18/8). Bo qua ca file khong phai du lieu.
const SKIP_PATTERNS = [/^prompt-/i, /^readme/i, /^huong-dan/i, /^bi-kip/i, /^upload-log/i, /\.(log|bat|sh|ps1|exe)$/i];

// File hay bi GHI DE moi ngay (cung ten, noi dung moi): zalo-messages.jsonl, zalo-summary.md,
// zalo-groups-*.json. Neu chi upsert cung ten thi import bo qua vi source_path da co ->
// AI Data 1 KHONG hoc tin moi (bat duoc 18/8: 19 tin moi bi bo). Cach xu: khi noi dung khac
// ban tren bucket, upload them ban co hau to ngay (zalo-messages.2026-08-18.jsonl) de import
// coi la file moi; ban goc van upsert de giu "ban moi nhat".
import { createHash } from 'node:crypto';
const todayVN = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const md5 = (b) => createHash('md5').update(b).digest('hex');

let uploaded = 0, skipped = 0, errors = 0;
for (const name of items) {
  const full = join(localDir, name);
  const st = statSync(full);
  if (!st.isFile()) continue;
  if (SKIP_PATTERNS.some((re) => re.test(name))) { skipped += 1; console.log(`  - bo qua (tai lieu huong dan): ${name}`); continue; }
  const remote = `${bucketPrefix}/${name}`;
  const buf = readFileSync(full);

  // So voi ban dang co tren bucket (neu co) de biet noi dung co doi khong.
  let changed = true;
  try {
    const dl = await client.storage.from('kho-tri-thuc-noi-bo').download(remote);
    if (!dl.error && dl.data) {
      const old = Buffer.from(await dl.data.arrayBuffer());
      changed = md5(old) !== md5(buf);
    }
  } catch { /* chua co tren bucket -> coi la moi */ }

  const up = await client.storage
    .from('kho-tri-thuc-noi-bo')
    .upload(remote, buf, { contentType: ctype(name), upsert: true });
  if (up.error) { console.error(`  X ${remote}: ${up.error.message}`); errors += 1; continue; }
  uploaded += 1;
  console.log(`  ✓ ${remote}  (${Math.round(buf.length / 1024)} KB)${changed ? '' : '  [khong doi]'}`);

  // Noi dung doi va ten file KHONG co ngay -> them ban dated de import hoc lai.
  const hasDate = /\d{4}-\d{2}-\d{2}/.test(name);
  if (changed && !hasDate) {
    const dot = name.lastIndexOf('.');
    const dated = dot > 0 ? `${name.slice(0, dot)}.${todayVN}${name.slice(dot)}` : `${name}.${todayVN}`;
    const up2 = await client.storage.from('kho-tri-thuc-noi-bo').upload(`${bucketPrefix}/${dated}`, buf, { contentType: ctype(name), upsert: true });
    if (!up2.error) console.log(`    + ban ngay: ${bucketPrefix}/${dated} (de AI hoc noi dung moi)`);
  }
}
console.log(`\nUpload xong: ${uploaded} moi, ${skipped} bo qua, ${errors} loi.`);
