// doi-kho-sang-drive.mjs — DỜI tư liệu cũ từ Supabase Storage sang Google Drive (16/9, Thanh: "dời sang Drive hết đi").
// Mỗi tư liệu: tải từ bucket brand-assets -> up Drive (OAuth tài khoản công ty, quyền xem theo link) -> đổi
// brand_assets.storage_path thành "gdrive:<id>/<tên>" -> xoá file trên Supabase. Ghi từng dòng vào
// out/doi-kho-sang-drive.log.jsonl (đường cũ -> mới) để lần vết / quay lại nếu cần.
//
// KHÔNG dời video do dây chuyền dựng (source='video-pipeline'): Facebook/YouTube kéo file này lúc đăng, link
// Drive chuyển hướng 302 nên rủi ro; các video này tự dọn còn 1 bản/bài, không nặng.
// Chạy: node packages/marketing/src/doi-kho-sang-drive.mjs [--limit 50] [--dry-run] [--include-pipeline]
import { createClient } from '@supabase/supabase-js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadRealEnv } from './video/env.mjs';
import { driveEnabled, uploadToDrive, isDrivePath } from './gdrive.mjs';

const env = loadRealEnv();
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const LIMIT = Number(argVal('limit', 500));
const DRY = args.includes('--dry-run');
const INCLUDE_PIPELINE = args.includes('--include-pipeline');
if (!driveEnabled(env)) { console.error('Drive chưa cấu hình (GDRIVE_FOLDER_ID + GDRIVE_REFRESH_TOKEN).'); process.exit(1); }
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
mkdirSync('out', { recursive: true });
const LOG = 'out/doi-kho-sang-drive.log.jsonl';

let q = client.from('brand_assets').select('id, kind, title, storage_path, source, mime, size_bytes').not('storage_path', 'like', 'gdrive:%').order('created_at', { ascending: true }).limit(LIMIT);
if (!INCLUDE_PIPELINE) q = q.neq('source', 'video-pipeline');
const { data: rows, error } = await q;
if (error) { console.error('Đọc brand_assets lỗi:', error.message); process.exit(1); }
console.log(`Cần dời: ${rows.length} tư liệu${DRY ? ' (thử, không đổi gì)' : ''}`);

const mimeOf = (a) => a.mime || (/\.(mp4|mov|m4v|webm)$/i.test(a.storage_path) ? 'video/mp4' : /\.png$/i.test(a.storage_path) ? 'image/png' : /\.webp$/i.test(a.storage_path) ? 'image/webp' : 'image/jpeg');
let ok = 0, loi = 0, bytes = 0;
for (const a of rows) {
  if (isDrivePath(a.storage_path)) continue;
  const name = String(a.storage_path).split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
  try {
    const dl = await client.storage.from('brand-assets').download(a.storage_path);
    if (dl.error) throw new Error('tải Supabase: ' + dl.error.message);
    const buf = Buffer.from(await dl.data.arrayBuffer());
    if (DRY) { console.log(`  · ${a.kind} ${Math.round(buf.length / 1024)} KB ${a.title}`); ok += 1; bytes += buf.length; continue; }
    const up = await uploadToDrive({ name, buf, mime: mimeOf(a) });
    const { error: ue } = await client.from('brand_assets').update({ storage_path: up.storagePath }).eq('id', a.id);
    if (ue) throw new Error('đổi storage_path: ' + ue.message);
    const rm = await client.storage.from('brand-assets').remove([a.storage_path]);
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), id: a.id, old: a.storage_path, new: up.storagePath, bytes: buf.length, removed: !rm.error }) + '\n');
    ok += 1; bytes += buf.length;
    console.log(`  ✓ ${a.kind} ${Math.round(buf.length / 1024)} KB | ${String(a.title || '').slice(0, 50)} -> Drive${rm.error ? ' (chưa xoá được bản Supabase: ' + rm.error.message + ')' : ''}`);
  } catch (e) {
    loi += 1; console.error(`  X ${a.title}: ${e?.message || e}`);
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), id: a.id, old: a.storage_path, error: String(e?.message || e) }) + '\n');
  }
}
try { if (!DRY) await client.from('run_log').insert({ task: 'mkt.asset_move_drive', actor: 'script', status: loi ? 'warn' : 'ok', detail: { moved: ok, errors: loi, mb: Math.round(bytes / 1e6) } }); } catch { /* bỏ qua */ }
console.log(`\nXong: ${ok} dời sang Drive (${Math.round(bytes / 1e6)} MB), ${loi} lỗi. Nhật ký: ${LOG}`);
