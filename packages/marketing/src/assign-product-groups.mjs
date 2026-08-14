// Tự gán brand_assets vào folder sản phẩm (product_group) theo tên.
// Xem trước:  node packages/marketing/src/assign-product-groups.mjs --dry
// Gán thật:   node packages/marketing/src/assign-product-groups.mjs
// Chỉ gán tư liệu CHƯA có product_group (không đè tay người dùng đã chỉnh). Không đoán được thì để trống.
import { createClient } from '@supabase/supabase-js';
import { loadRealEnv } from './video/env.mjs';
import { guessGroup, PRODUCTS } from './products.mjs';

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force'); // gán lại kể cả đã có
const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: assets, error } = await client
  .from('brand_assets')
  .select('id, kind, title, product_group')
  .order('created_at', { ascending: true });
if (error) { console.error('Lỗi:', error.message); process.exit(1); }

const plan = [];
for (const a of assets) {
  if (a.product_group && !force) continue; // đã gán, giữ nguyên
  const group = guessGroup(a.title);
  plan.push({ id: a.id, kind: a.kind, title: a.title, from: a.product_group || null, to: group });
}

console.log(`Tổng ${assets.length} tư liệu. Sẽ xét ${plan.length}.`);
const matched = plan.filter((p) => p.to);
const unmatched = plan.filter((p) => !p.to);

console.log(`\n== Gán được (${matched.length}) ==`);
for (const p of matched) console.log(`  [${p.kind}] ${p.title}  ->  ${p.to}`);
console.log(`\n== Không đoán được, để trống (${unmatched.length}) ==`);
for (const p of unmatched) console.log(`  [${p.kind}] ${p.title}`);

// Tổng hợp theo folder.
console.log('\n== Theo folder ==');
for (const prod of PRODUCTS) {
  const inGroup = assets.filter((a) => (force || !a.product_group ? guessGroup(a.title) : a.product_group) === prod.group);
  const imgs = inGroup.filter((a) => a.kind === 'image').length;
  const vids = inGroup.filter((a) => a.kind === 'video' || a.kind === 'clip').length;
  console.log(`  ${prod.group}: ${imgs} ảnh, ${vids} video`);
}

if (dry) { console.log('\n(--dry: chưa ghi gì)'); process.exit(0); }

let done = 0;
for (const p of matched) {
  const { error: e } = await client.from('brand_assets').update({ product_group: p.to }).eq('id', p.id);
  if (!e) done++;
}
console.log(`\nĐã gán ${done}/${matched.length} tư liệu.`);
