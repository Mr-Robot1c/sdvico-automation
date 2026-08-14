// Dây chuyền video SDVICO (chạy máy nội bộ).
// Kịch bản (Gemini) -> TTS từng cảnh (edge-tts) -> phụ đề từ kịch bản + Whisper artifact ->
// ghép bản dọc 9:16 và ngang 16:9 -> 3 tiêu đề + 3 ảnh đại diện.
// KHÔNG tự đăng: đầu ra để người duyệt (điều cấm 1). Chỉ dùng tư liệu brand_assets (điều cấm 5).
//
// Chạy:
//   node packages/marketing/src/video/build-video.mjs [contentId] [--voice vi-VN-NamMinhNeural] [--out DIR]
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadRealEnv } from './env.mjs';
import { downloadAsset, probeDuration, ffmpeg } from './ffmpeg.mjs';
import { assembleVideo } from './assemble.mjs';
import { generateVideoScript } from './script.mjs';
import { WHISPER_PROMPT } from './terms.mjs';
import { PRODUCT_FACTS } from '../product-facts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND_LINE = 'SDVICO • Hotline 1900 23 23 49';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function python(script, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [join(HERE, script), ...args]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${script} exit ${code}: ${(err || out).slice(-500)}`))));
  });
}

async function tts(text, outPath, voice, workDir, tag) {
  const txt = join(workDir, `${tag}.txt`);
  await writeFile(txt, text, 'utf8');
  await python('tts.py', ['--text-file', txt, '--out', outPath, '--voice', voice]);
  return probeDuration(outPath);
}

// Ghép audio các cảnh thành 1 file rồi chạy Whisper (artifact/ghi nhận, không chặn).
async function whisperArtifact(sceneAudios, workDir, tag) {
  try {
    const list = join(workDir, `wa_${tag}.txt`);
    await writeFile(list, sceneAudios.map((a) => `file '${a.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    const merged = join(workDir, `narration_${tag}.mp3`);
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', merged]);
    const srt = join(workDir, `whisper_${tag}.srt`);
    const res = await python('subtitle.py', ['--audio', merged, '--out', srt, '--model', arg('whisper-model', 'small'), '--prompt', WHISPER_PROMPT]);
    return { srt, info: JSON.parse(res.split('\n').pop() || '{}') };
  } catch (e) {
    console.warn('Whisper artifact bỏ qua:', e.message);
    return null;
  }
}

async function buildFormat(format, scenes, assetPaths, voice, workDir, outDir, contentId) {
  const fdir = join(workDir, format);
  await mkdir(fdir, { recursive: true });
  const built = [];
  const sceneAudios = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const audio = join(fdir, `sc${i}.mp3`);
    const dur = await tts(s.narration, audio, voice, fdir, `t${i}`);
    sceneAudios.push(audio);
    const asset = assetPaths.get(s.assetId);
    built.push({
      videoPath: asset.local,
      audioPath: audio,
      durationSec: dur,
      text: s.narration,
      kind: asset.kind === 'image' ? 'image' : 'video',
    });
  }
  const wa = await whisperArtifact(sceneAudios, fdir, format);
  const out = join(outDir, `sdvico_${contentId.slice(0, 8)}_${format}.mp4`);
  await assembleVideo({ scenes: built, format, workDir: fdir, brandLine: BRAND_LINE, outPath: out });
  const totalDur = await probeDuration(out);
  return { out, totalDur, scenes: built.length, whisper: wa?.info || null };
}

async function main() {
  const env = loadRealEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const voice = arg('voice', 'vi-VN-NamMinhNeural');
  const outDir = arg('out', join(HERE, '..', '..', '..', '..', 'out', 'video'));
  await mkdir(outDir, { recursive: true });

  // Nội dung nguồn.
  let contentId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
  let content;
  if (contentId) {
    const { data } = await client.from('mkt_content').select('id, title, draft, brief').eq('id', contentId).single();
    content = data;
  } else {
    const { data } = await client.from('mkt_content').select('id, title, draft, brief')
      .not('draft', 'is', null).order('created_at', { ascending: false }).limit(1);
    content = data?.[0];
  }
  if (!content) throw new Error('Không tìm thấy nội dung nguồn (mkt_content có draft).');
  contentId = content.id;
  console.log('Nội dung nguồn:', content.title, `(${contentId.slice(0, 8)})`);

  // Tư liệu.
  const { data: assets } = await client.from('brand_assets')
    .select('id, kind, title, storage_path').order('created_at', { ascending: false });
  if (!assets?.length) throw new Error('brand_assets rỗng.');

  // Kịch bản.
  console.log('Sinh kịch bản (Gemini)...');
  const script = await generateVideoScript(content, assets.map((a) => ({ id: a.id, kind: a.kind, title: a.title })), PRODUCT_FACTS);
  console.log('Tiêu đề:', script.titles);
  console.log('Rủi ro tuân thủ:', script.assessment.risk, JSON.stringify(script.assessment.flags));
  console.log('Cảnh: dọc', script.vertical.length, '| ngang', script.horizontal.length);

  const workDir = join(HERE, '..', '..', '..', '..', 'out', 'video', `work_${contentId.slice(0, 8)}`);
  await mkdir(workDir, { recursive: true });

  // Tải các asset được dùng.
  const usedIds = new Set([...script.vertical, ...script.horizontal].map((s) => s.assetId));
  const assetPaths = new Map();
  for (const id of usedIds) {
    const a = assets.find((x) => x.id === id);
    if (!a) continue;
    const ext = a.storage_path.split('.').pop();
    const local = join(workDir, `asset_${id.slice(0, 8)}.${ext}`);
    await downloadAsset(client, a.storage_path, local);
    assetPaths.set(id, { local, kind: a.kind });
  }
  console.log('Đã tải', assetPaths.size, 'tư liệu.');

  const results = {};
  for (const fmt of ['vertical', 'horizontal']) {
    console.log(`\n== Dựng bản ${fmt} ==`);
    results[fmt] = await buildFormat(fmt, script[fmt], assetPaths, voice, workDir, outDir, contentId);
    console.log(`  -> ${results[fmt].out} (${results[fmt].totalDur.toFixed(1)}s, ${results[fmt].scenes} cảnh)`);
  }

  // 3 ảnh đại diện từ bản dọc.
  const thumbs = [];
  const vdur = results.vertical.totalDur;
  for (let i = 0; i < 3; i++) {
    const t = Math.max(0.5, (vdur * (i + 1)) / 4);
    const th = join(outDir, `sdvico_${contentId.slice(0, 8)}_thumb${i + 1}.jpg`);
    await ffmpeg(['-y', '-ss', t.toFixed(2), '-i', results.vertical.out, '-frames:v', '1', '-q:v', '3', th]);
    thumbs.push(th);
  }

  const summary = {
    contentId, title: content.title, titles: script.titles,
    compliance: script.assessment,
    vertical: results.vertical, horizontal: results.horizontal, thumbnails: thumbs,
  };
  await writeFile(join(outDir, `sdvico_${contentId.slice(0, 8)}_summary.json`), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nXONG. Tóm tắt:', join(outDir, `sdvico_${contentId.slice(0, 8)}_summary.json`));
  console.log(JSON.stringify({ vertical: results.vertical.out, horizontal: results.horizontal.out, thumbs }, null, 2));
}

main().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
