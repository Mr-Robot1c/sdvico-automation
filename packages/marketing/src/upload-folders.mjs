// Tải ảnh/video từ các folder sản phẩm trong máy lên kho brand_assets (Storage + bản ghi),
// gán product_group theo STT folder. Bỏ file .txt (tính năng đọc riêng qua products.mjs).
//
// Nguồn:  C:\Users\ADMIN\Pictures\SDViCo\<N. Tên sản phẩm>\
// Chạy:
//   node packages/marketing/src/upload-folders.mjs --dry            # xem trước, chỉ folder ĐANG TRỐNG trong kho
//   node packages/marketing/src/upload-folders.mjs                  # tải thật, chỉ folder đang trống
//   node packages/marketing/src/upload-folders.mjs --force 3 7      # ép tải lại folder 3 và 7 (kể cả đã có)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadRealEnv } from './video/env.mjs';
import { PRODUCTS } from './products.mjs';

const SRC = 'C:\\Users\\ADMIN\\Pictures\\SDViCo';
const dry = process.argv.includes('--dry');
const forceIdx = process.argv.indexOf('--force');
const forced = forceIdx >= 0 ? process.argv.slice(forceIdx + 1).filter((x) => /^\d+$/.test(x)).map(Number) : [];

const CT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };
const kindOf = (ext) => (['.mp4', '.mov', '.webm'].includes(ext) ? 'video' : 'image');
const cleanTitle = (f) => basename(f, extname(f)).replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim() || basename(f, extname(f));
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);

const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Đếm tư liệu hiện có theo product_group để biết folder nào trống.
const { data: existing } = await client.from('brand_assets').select('product_group');
const countByGroup = {};
for (const a of existing || []) if (a.product_group) countByGroup[a.product_group] = (countByGroup[a.product_group] || 0) + 1;

// Map thư mục nguồn theo STT.
const dirs = readdirSync(SRC).filter((d) => { try { return statSync(join(SRC, d)).isDirectory(); } catch { return false; } });
let total = 0;
for (const dir of dirs) {
  const m = dir.match(/^\s*(\d+)\.\s/);
  if (!m) continue;
  const n = Number(m[1]);
  const product = PRODUCTS[n - 1];
  if (!product) { console.log(`(bỏ) folder "${dir}" không khớp sản phẩm STT ${n}`); continue; }
  const group = product.group;
  const already = countByGroup[group] || 0;
  const isForced = forced.includes(n);
  if (already > 0 && !isForced) { console.log(`- Folder ${n} (${group}): đã có ${already} tư liệu trong kho, BỎ QUA (dùng --force ${n} để ép).`); continue; }

  const files = readdirSync(join(SRC, dir)).filter((f) => CT[extname(f).toLowerCase()]);
  console.log(`\n== Folder ${n}: ${group} -> ${files.length} file ==`);
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const kind = kindOf(ext);
    const title = cleanTitle(f);
    const key = `sdvico/${n}-${slug(title)}-${(total + 1)}${ext}`;
    console.log(`   [${kind}] ${title}  ->  ${key}`);
    total++;
    if (dry) continue;
    const buf = readFileSync(join(SRC, dir, f));
    const { error: upErr } = await client.storage.from('brand-assets').upload(key, buf, { contentType: CT[ext], upsert: false });
    if (upErr) { console.log(`     Lỗi tải: ${upErr.message}`); continue; }
    const { error: insErr } = await client.from('brand_assets').insert({ kind, title, storage_path: key, license: 'owned', product_group: group });
    if (insErr) console.log(`     Lỗi ghi bản ghi: ${insErr.message}`);
  }
}
console.log(`\n${dry ? '(--dry) Se tai' : 'Da tai'} ${total} file.`);
process.exit(0);
