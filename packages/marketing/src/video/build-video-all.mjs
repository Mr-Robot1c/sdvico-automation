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

// 29/8 (audit mục 13): trước đây bài dựng LỖI giữ nguyên cờ video_requested -> watch 60 giây
// sau lại nhặt đúng bài đó, lặp vô hạn, MỖI lượt đều gọi Gemini sinh kịch bản trước khi chết
// (đốt quota), và không ghi run_log nên không ai thấy. Giờ mỗi bài có:
//   brief.video_attempts   — số lần đã thử, quá MAX_ATTEMPTS thì dừng hẳn + video_failed=true
//   brief.video_claimed_at — vé giữ chỗ khi bắt đầu dựng: tiến trình khác thấy vé còn hạn thì
//                            bỏ qua (không dựng đôi); bài lỗi giữ vé làm cooldown, hết
//                            CLAIM_TTL mới được thử lại thay vì 60 giây sau thử ngay.
// Mỗi lượt dựng ghi run_log (task mkt.video_build) để trang Dữ liệu/BOT thấy được.
const MAX_ATTEMPTS = 3;
const CLAIM_TTL_MS = 30 * 60 * 1000;

async function logVideo(client, status, detail) {
  try {
    await client.from('run_log').insert({ task: 'mkt.video_build', actor: 'video-watcher', status, detail });
  } catch { /* loi ghi log khong duoc keo sap batch */ }
}

async function readBrief(client, id) {
  const { data } = await client.from('mkt_content').select('brief').eq('id', id).single();
  return data?.brief || {};
}

// Một lượt quét + dựng. requested=true: chỉ bài đã bấm nút "Làm video" (brief.video_requested).
async function runOnce(client, { requested, limit, extra }) {
  const { data: contents } = await client
    .from('mkt_content')
    .select('id, title, draft, brief')
    .not('draft', 'is', null)
    .order('created_at', { ascending: false });
  const rows = contents || [];
  console.log(`[debug] SUPABASE_URL=${(process.env.SUPABASE_URL||"").slice(0,40)}... rows=${rows.length}`);
  const reqCount = rows.filter((c) => c.brief?.video_requested === true && !c.brief?.assets?.video_h).length;
  console.log(`[debug] video_requested=true chua co video: ${reqCount} bai`);
  // Bỏ qua chính các bài video-pipeline sinh ra; và bài NGUỒN đã được dựng video rồi.
  const doneSources = new Set(
    rows.filter((c) => c.brief?.generator === 'video-pipeline' && c.brief?.source_content).map((c) => c.brief.source_content)
  );
  // Bo qua bai da GAN video vao chinh no (bai rotation gop Post+Reel, brief.assets.video_h co san).
  // 29/8: bo luon bai da danh dau video_failed hoac het luot thu (theo du lieu vua load —
  // kiem tra lai bang brief MOI NHAT ngay truoc khi dung o vong duoi).
  let todo = rows.filter((c) => c.brief?.generator !== 'video-pipeline' && !doneSources.has(c.id) && !c.brief?.assets?.video_h
    && c.brief?.video_failed !== true && Number(c.brief?.video_attempts || 0) < MAX_ATTEMPTS);
  if (requested) todo = todo.filter((c) => c.brief?.video_requested === true);
  const picked = limit ? todo.slice(0, limit) : todo;
  if (!picked.length) return { ok: 0, fail: 0, total: 0 };

  console.log(`Se dung video: ${picked.length} bai${requested ? ' (da yeu cau)' : ''}${limit ? ` (gioi han ${limit})` : ''}.`);
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    console.log(`\n########## [${i + 1}/${picked.length}] ${c.title || c.id.slice(0, 8)} ##########`);

    // Doc brief MOI NHAT roi kiem ve giu cho + so lan thu ngay truoc khi dung
    // (danh sach picked load tu dau luot quet, co the da cu).
    let bStart;
    try { bStart = await readBrief(client, c.id); } catch { bStart = c.brief || {}; }
    const attempts = Number(bStart.video_attempts || 0);
    if (bStart.video_failed === true || attempts >= MAX_ATTEMPTS) {
      skipped++;
      console.log(`  Bo qua: da loi ${attempts} lan truoc do (video_failed) — xem run_log mkt.video_build.`);
      continue;
    }
    const claimedAt = bStart.video_claimed_at ? Date.parse(bStart.video_claimed_at) : 0;
    if (claimedAt && Date.now() - claimedAt < CLAIM_TTL_MS) {
      skipped++;
      console.log(`  Bo qua: co ve giu cho tu ${bStart.video_claimed_at} (tien trinh khac dang dung, hoac cooldown sau loi).`);
      continue;
    }
    // Giu ve + tang so lan thu TRUOC khi dung — tien trinh chet giua chung van tinh 1 lan.
    try {
      await client.from('mkt_content').update({
        brief: { ...bStart, video_claimed_at: new Date().toISOString(), video_attempts: attempts + 1 },
      }).eq('id', c.id);
    } catch { /* khong giu duoc ve thi van dung nhu cu, chi mat lop bao ve */ }

    const code = await runChild(c.id, extra);
    if (code === 0) {
      ok++;
      await logVideo(client, 'ok', { content_id: c.id, title: c.title || null, attempt: attempts + 1 });
      // Dung xong: xoa co video_requested + tra ve giu cho. PHAI doc lai brief MOI NHAT truoc
      // khi update: voi bai rotation, build-video.mjs vua GAN video_h/video_v + post_reel vao
      // brief bai goc; dung `c.brief` (ban cu load truoc khi dung) se GHI DE mat video
      // (bug bat duoc 18/8: queue co video ma mkt_content khong).
      try {
        const b = await readBrief(client, c.id);
        await client.from('mkt_content').update({
          brief: { ...b, video_requested: false, video_claimed_at: null, video_failed: false },
        }).eq('id', c.id);
      } catch { /* bo qua */ }
    } else {
      fail++;
      const attemptNo = attempts + 1;
      const gaveUp = attemptNo >= MAX_ATTEMPTS;
      console.error(`  Bai ${c.id.slice(0, 8)} loi (exit ${code}), lan thu ${attemptNo}/${MAX_ATTEMPTS}${gaveUp ? ' — DUNG HAN (video_failed=true)' : `, cho ${CLAIM_TTL_MS / 60000} phut roi moi thu lai`}.`);
      await logVideo(client, 'error', { content_id: c.id, title: c.title || null, exit_code: code, attempt: attemptNo, gave_up: gaveUp });
      if (gaveUp) {
        // Het luot: ha co video_requested de UI khong hien "Da yeu cau" treo mai, danh dau
        // video_failed. Muon thu lai: sua brief go video_failed/video_attempts roi bam lai nut.
        try {
          const b = await readBrief(client, c.id);
          await client.from('mkt_content').update({
            brief: { ...b, video_requested: false, video_failed: true, video_claimed_at: null, video_error: `dung loi ${attemptNo} lan, da dung thu lai (xem run_log mkt.video_build)` },
          }).eq('id', c.id);
        } catch { /* bo qua */ }
      }
      // Chua toi tran: GIU video_claimed_at lam cooldown, het CLAIM_TTL moi thu lai.
    }
  }
  if (skipped) console.log(`(bo qua ${skipped} bai dang giu cho / da loi qua ${MAX_ATTEMPTS} lan)`);
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
