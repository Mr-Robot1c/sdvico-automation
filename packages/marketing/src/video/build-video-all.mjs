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
  if (process.argv.includes('--skip-whisper')) out.push('--skip-whisper');
  return out;
}

function runChild(contentId, extra) {
  return new Promise((resolve) => {
    const proc = spawn('node', [join(HERE, 'build-video.mjs'), contentId, ...extra], { stdio: 'inherit' });
    proc.on('error', () => resolve(1));
    proc.on('close', (code) => resolve(code ?? 1));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Một lượt quét + dựng. requested=true: chỉ bài đã bấm nút "Làm video" (brief.video_requested).
async function runOnce(client, { requested, limit, extra }) {
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
  // Bo qua bai da GAN video vao chinh no (bai rotation gop Post+Reel, brief.assets.video_h co san).
  let todo = rows.filter((c) => c.brief?.generator !== 'video-pipeline' && !doneSources.has(c.id) && !c.brief?.assets?.video_h);
  if (requested) todo = todo.filter((c) => c.brief?.video_requested === true);
  const picked = limit ? todo.slice(0, limit) : todo;
  if (!picked.length) return { ok: 0, fail: 0, total: 0 };

  console.log(`Se dung video: ${picked.length} bai${requested ? ' (da yeu cau)' : ''}${limit ? ` (gioi han ${limit})` : ''}.`);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    console.log(`\n########## [${i + 1}/${picked.length}] ${c.title || c.id.slice(0, 8)} ##########`);
    const code = await runChild(c.id, extra);
    if (code === 0) {
      ok++;
      // Dung xong: xoa co video_requested (neu co) de khong dung lai + UI het "Da yeu cau".
      // PHAI doc lai brief MOI NHAT truoc khi update: voi bai rotation, build-video.mjs vua GAN
      // video_h/video_v + post_reel vao brief bai goc; dung `c.brief` (ban cu load truoc khi
      // dung) se GHI DE mat video (bug bat duoc 18/8: queue co video ma mkt_content khong).
      if (c.brief?.video_requested) {
        try {
          const { data: fresh } = await client.from('mkt_content').select('brief').eq('id', c.id).single();
          const b = fresh?.brief || c.brief || {};
          if (b.video_requested !== false) await client.from('mkt_content').update({ brief: { ...b, video_requested: false } }).eq('id', c.id);
        } catch { /* bo qua */ }
      }
    } else {
      fail++;
      console.error(`  Bai ${c.id.slice(0, 8)} loi (exit ${code}), bo qua, chay tiep.`);
    }
  }
  return { ok, fail, total: picked.length };
}

async function main() {
  const env = loadRealEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const limit = Number(arg('limit', '0')) || 0;
  const requested = process.argv.includes('--requested');
  const watch = process.argv.includes('--watch');
  const interval = (Number(arg('interval', '60')) || 60) * 1000;
  const extra = passthrough();

  if (watch) {
    console.log(`Che do WATCH: moi ${interval / 1000}s quet bai ${requested ? 'DA YEU CAU (bam nut Lam video)' : 'chua co video'} roi dung. Ctrl+C de dung.`);
    for (;;) {
      try {
        const r = await runOnce(client, { requested, limit, extra });
        if (r.total) console.log(`(watch) xong dot: ${r.ok} ok, ${r.fail} loi.`);
      } catch (e) { console.error('(watch) loi dot:', e.message); }
      await sleep(interval);
    }
  }

  const r = await runOnce(client, { requested, limit, extra });
  if (!r.total) console.log('Khong co bai nao can dung video.');
  else console.log(`\n=== BATCH XONG: ${r.ok} thanh cong, ${r.fail} loi / ${r.total} bai ===`);
}

main().catch((e) => { console.error('LOI batch:', e.message); process.exit(1); });
