// Liệt kê tư liệu trong brand_assets để dựng video (chỉ owned/licensed, điều cấm 5).
// Chạy: node packages/marketing/src/video/list-assets.mjs
import { createClient } from '@supabase/supabase-js';
import { loadRealEnv } from './env.mjs';

const env = loadRealEnv();
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await client
  .from('brand_assets')
  .select('id, kind, title, storage_path, license, source, created_at')
  .order('created_at', { ascending: false })
  .limit(80);
if (error) { console.error('Lỗi truy vấn:', error.message); process.exit(1); }

const byKind = {};
for (const a of data) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
console.log('Nguồn env:', env._ENV_SOURCE || 'process.env');
console.log('Tổng:', data.length, 'tư liệu |', JSON.stringify(byKind));
for (const a of data) {
  console.log(`- [${a.kind}] ${a.title} | id=${a.id} | ${a.license} | ${a.storage_path}`);
}
