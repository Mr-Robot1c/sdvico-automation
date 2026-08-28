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
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.mp4') || n.endsWith('.m4v')) return 'video/mp4';
  if (n.endsWith('.mov')) return 'video/quicktime';
  if (n.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

// 28/8 tối (user): "zalo sẽ có mấy cái ảnh/video BÁN HÀNG lên — vẫn có thể dùng cho bài".
// File MEDIA trong folder Zalo không phải tài liệu đọc — đưa vào KHO TƯ LIỆU bài đăng
// (bucket brand-assets + dòng brand_assets) để rotate/bài sản phẩm chọn được như ảnh thật.
// Nhóm sản phẩm đoán từ TÊN FILE (đặt tên có chữ sản phẩm, vd "sea40-khach-lap.jpg" -> SEA-40);
// không đoán được thì vào 'Content'. Khử trùng theo title "Zalo: <tên file>".
const MEDIA_RE = /\.(jpe?g|png|webp|gif|mp4|mov|m4v|webm)$/i;

let items;
try { items = readdirSync(localDir); }
catch (e) { console.error('Khong doc duoc thu muc', localDir, ':', e.message); process.exit(1); }

// Bo qua tai lieu HUONG DAN / bi kip cua phien doc Zalo (khong phai tri thuc noi bo -> AI hoc
// nham, nhieu Nguon - bat duoc 18/8). Bo qua ca file khong phai du lieu.
const SKIP_PATTERNS = [/^prompt-/i, /^readme/i, /^huong-dan/i, /^bi-kip/i, /^upload-log/i, /^doc-truoc/i, /\.(log|bat|sh|ps1|exe)$/i];

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

  // File MEDIA (anh/video ban hang tu Zalo) -> KHO TU LIEU brand-assets, khong vao kho tri thuc.
  if (MEDIA_RE.test(name)) {
    const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(name);
    const title = `Zalo: ${name}`;
    const { data: dup } = await client.from('brand_assets').select('id').eq('title', title).limit(1);
    if (dup && dup.length) { skipped += 1; console.log(`  - da co trong kho tu lieu: ${name}`); continue; }
    const safeName = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const mediaPath = `zalo/${Date.now()}-${safeName}`;
    const upM = await client.storage.from('brand-assets').upload(mediaPath, buf, { contentType: ctype(name) });
    if (upM.error) { console.error(`  X media ${name}: ${upM.error.message}`); errors += 1; continue; }
    const { guessGroup } = await import('./products.mjs');
    const grp = guessGroup(name) || 'Content';
    const ins = await client.from('brand_assets').insert({
      kind: isVideo ? 'video' : 'image', title, storage_path: mediaPath, source: 'zalo', product_group: grp,
    });
    if (ins.error) { console.error(`  X brand_assets ${name}: ${ins.error.message}`); errors += 1; continue; }
    uploaded += 1;
    console.log(`  ✓ TU LIEU ${isVideo ? 'video' : 'anh'} -> nhom "${grp}": ${name} (${Math.round(buf.length / 1024)} KB)`);
    continue;
  }

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
// HOP THA TAY: ./Zalo/Học — nguoi dung chep tay tu lieu vao day de AI hoc (doi ten 19/8,
// truoc la Downloads). Chi upload loai file bo nap kho tri thuc doc duoc: .txt .md .markdown
// .html .htm .json va anh jpg/jpeg/png/webp (Gemini vision trich chu). Gioi han 10MB.
// docx/pdf/xlsx bo nap CHUA doc duoc -> bao ro va de lai, khong upload lang phi.
// Video khong hoc duoc noi dung -> bo vao Zalo/media, script hoc-video.mjs se xem.
// Luu y: file da upload cung ten se KHONG duoc hoc lai (idempotent theo duong dan) —
// cap nhat noi dung thi doi ten file (them ngay) roi tha lai.
const dropDir = join(localDir, 'Học');
const LEARNABLE = /\.(txt|md|markdown|html|htm|json|jpg|jpeg|png|webp)$/i;
let dropItems = [];
try { dropItems = readdirSync(dropDir); } catch { /* chua co folder hop tha */ }
for (const name of dropItems) {
  const full = join(dropDir, name);
  const st = statSync(full);
  if (!st.isFile()) continue;
  if (SKIP_PATTERNS.some((re) => re.test(name))) { skipped += 1; continue; }
  if (/^video-tom-tat-/i.test(name)) { skipped += 1; continue; } // ban tom tat cu con sot, da co ben Zalo/AI
  if (!LEARNABLE.test(name)) { skipped += 1; console.log(`  - hop tha: ${name} — loai file bo nap chua hoc duoc (docx/pdf/xlsx/video...), de lai`); continue; }
  if (st.size > 10 * 1024 * 1024) { skipped += 1; console.log(`  - hop tha: ${name} qua 10MB, bo qua`); continue; }
  const remote = `${bucketPrefix}/thu-cong/${name}`;
  const buf = readFileSync(full);
  const up = await client.storage.from('kho-tri-thuc-noi-bo').upload(remote, buf, { contentType: ctype(name), upsert: true });
  if (up.error) { console.error(`  X ${remote}: ${up.error.message}`); errors += 1; continue; }
  uploaded += 1;
  console.log(`  ✓ hop tha: ${remote}  (${Math.round(buf.length / 1024)} KB)`);
}

// NHAT KY AI: ./Zalo/AI/<ngay>/ — ban tom tat video (va cac ban ghi "AI da hoc") do
// hoc-video.mjs sinh ra. Day len bucket zalo/ai/<ngay>/ de importer nap (them 19/8).
const aiDir = join(localDir, 'AI');
let aiDays = [];
try { aiDays = readdirSync(aiDir); } catch { /* chua co folder AI */ }
for (const day of aiDays) {
  const dayDir = join(aiDir, day);
  let st;
  try { st = statSync(dayDir); } catch { continue; }
  if (!st.isDirectory()) continue;
  for (const name of readdirSync(dayDir)) {
    const full = join(dayDir, name);
    if (!statSync(full).isFile()) continue;
    if (!/\.(md|txt)$/i.test(name)) continue;
    const remote = `${bucketPrefix}/ai/${day}/${name}`;
    const buf = readFileSync(full);
    const up = await client.storage.from('kho-tri-thuc-noi-bo').upload(remote, buf, { contentType: ctype(name), upsert: true });
    if (up.error) { console.error(`  X ${remote}: ${up.error.message}`); errors += 1; continue; }
    uploaded += 1;
    console.log(`  ✓ nhat ky AI: ${remote}  (${Math.round(buf.length / 1024)} KB)`);
  }
}

console.log(`\nUpload xong: ${uploaded} moi, ${skipped} bo qua, ${errors} loi.`);
