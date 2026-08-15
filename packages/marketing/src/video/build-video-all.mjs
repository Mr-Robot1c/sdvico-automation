// build-video-all.mjs — chạy dây chuyền video cho TẤT CẢ bài chưa có video (batch, tuần tự, máy nội bộ).
// Mỗi bài chạy trong MỘT tiến trình build-video.mjs riêng: bài lỗi không kéo sập cả batch, bộ nhớ sạch giữa các bài.
// Bỏ qua bài đã dựng video rồi -> chạy lại nhiều lần chỉ xử lý bài MỚI (hợp để hẹn giờ chạy định kỳ).
//
// Chạy:
//   node packages/marketing/src/video/build-video-all.mjs [--limit N] [--no-queue] [--voice vi-VN-NamMinhNeural]
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadRealEnv } from './env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// Cờ truyền thẳng xuống build-video.mjs.
function passthrough() {
  const out = [];
  for (const f of ['voice', 'whisper-model', 'out']) {
    const v = arg(f, null);
    if (v) out.push(`--${f}`, v);
  }
  if (process.argv.includes('--no-queue')) out.push('--no-queue');
  return out;
}

function runChild(contentId, extra) {
  return new Promise((resolve) => {
    const proc = spawn('node', [join(HERE, 'build-video.mjs'), contentId, ...extra], { stdio: 'inherit' });
    proc.on('error', () => resolve(1));
    proc.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const env = loadRealEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const limit = Number(arg('limit', '0')) || 0;

  const { data: contents } = await client
    .from('mkt_content')
    .select('id, title, draft, brief')
    .not('draft', 'is', null)
    .order('created_at', { ascending: false });
  const rows = contents || [];
  // Bỏ qua chính các bài video-pipeline sinh ra; và bài NGUỒN đã được dựng video rồi.
  const doneSources = new Set(
    rows.filter((c) => c.brief?.generator === 'video-pipeline' && c.brief?.source_content).map((c) => c.brief.source_content)
  );
  const todo = rows.filter((c) => c.brief?.generator !== 'video-pipeline' && !doneSources.has(c.id));
  const picked = limit ? todo.slice(0, limit) : todo;

  console.log(`Tong bai co draft: ${rows.length}. Da co video: ${doneSources.size}. Se dung video: ${picked.length}${limit ? ` (gioi han ${limit})` : ''}.`);
  if (!picked.length) { console.log('Khong co bai nao can dung video.'); return; }

  const extra = passthrough();
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    console.log(`\n########## [${i + 1}/${picked.length}] ${c.title || c.id.slice(0, 8)} ##########`);
    const code = await runChild(c.id, extra);
    if (code === 0) { ok++; } else { fail++; console.error(`  Bai ${c.id.slice(0, 8)} loi (exit ${code}), bo qua, chay tiep.`); }
  }
  console.log(`\n=== BATCH XONG: ${ok} thanh cong, ${fail} loi / ${picked.length} bai ===`);
}

main().catch((e) => { console.error('LOI batch:', e.message); process.exit(1); });
