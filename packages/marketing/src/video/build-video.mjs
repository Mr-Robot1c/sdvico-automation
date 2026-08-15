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

// Làm sạch lời thoại trước khi đọc: bỏ emoji/ký hiệu lạ (edge-tts dễ trả "No audio"), gộp khoảng trắng.
function cleanNarration(text) {
  return String(text || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tạo mp3 LẶNG dài `sec` giây (dự phòng khi TTS lỗi: cảnh vẫn dựng, có phụ đề, chỉ mất tiếng cảnh đó).
async function silentAudio(outPath, sec) {
  const dur = Math.max(1, sec);
  await ffmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', dur.toFixed(2), '-c:a', 'libmp3lame', '-q:a', '5', outPath]);
  return probeDuration(outPath);
}

// Bảng chữ số tiếng Việt để đọc số điện thoại/tổng đài TỪNG chữ số.
const DIGIT_VN = { '0': 'không', '1': 'một', '2': 'hai', '3': 'ba', '4': 'bốn', '5': 'năm', '6': 'sáu', '7': 'bảy', '8': 'tám', '9': 'chín' };
function digitsToWords(s) {
  return String(s).split('').map((d) => DIGIT_VN[d]).filter(Boolean).join(' ');
}
// Đọc số tổng đài/điện thoại TỪNG chữ số cho GIỌNG ĐỌC (1900 23 23 49 -> "một chín không không, hai
// ba, hai ba, bốn chín") thay vì đọc như số lượng (một nghìn chín trăm). GIỮ NGUYÊN số lượng
// (80 lít, 15 mét, 3.000.000 đồng). Chỉ đổi cho audio; phụ đề vẫn hiện số gốc.
function spellPhones(text) {
  return String(text || '')
    // Tổng đài 1900/1800 + 6 chữ số (có hoặc không có cách giữa các cụm).
    .replace(/\b1(?:900|800)(?:[\s.]*\d){6}\b/g, (m) => m.split(/[\s.]+/).filter(Boolean).map(digitsToWords).join(', '))
    // Di động 10 chữ số bắt đầu bằng 0 (vd 0987 654 321).
    .replace(/\b0\d(?:[\s.]*\d){8}\b/g, (m) => m.split(/[\s.]+/).filter(Boolean).map(digitsToWords).join(', '));
}

async function tts(text, outPath, voice, workDir, tag) {
  // Đọc số điện thoại/tổng đài từng chữ số (chỉ cho giọng đọc, phụ đề giữ số gốc).
  const clean = spellPhones(cleanNarration(text));
  // Thời lượng dự phòng theo số ký tự (~14 ký tự/giây tiếng Việt), tối thiểu 2 giây.
  const estSec = Math.max(2, Math.round(clean.length / 14));
  if (!clean) return silentAudio(outPath, estSec);
  const txt = join(workDir, `${tag}.txt`);
  await writeFile(txt, clean, 'utf8');
  try {
    await python('tts.py', ['--text-file', txt, '--out', outPath, '--voice', voice]);
    return probeDuration(outPath);
  } catch (e) {
    // edge-tts vẫn lỗi sau khi retry: KHÔNG kéo sập cả dây chuyền — dùng tiếng lặng để cảnh vẫn dựng.
    console.warn(`TTS lỗi cảnh ${tag} (${e.message}). Dùng tiếng lặng ${estSec}s để cảnh vẫn dựng, xem lại lời thoại cảnh này.`);
    return silentAudio(outPath, estSec);
  }
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

// Đẩy video (bản DỌC) vào Hàng đợi duyệt: upload Storage -> brand_assets -> mkt_content +
// approval_queue (status pending). KHÔNG tự đăng — người bấm Duyệt mới đăng (điều cấm 1).
// Bản ngang giữ ở out/video/ để dùng riêng (YouTube/website). Đăng FB; muốn TikTok thì thêm 'tiktok'.
async function pushToApprovalQueue(client, { content, script, verticalPath }) {
  const title = (script.titles && script.titles[0]) || content.title || 'Video SDVICO';
  // 1. Upload video lên Storage.
  const buf = await readFile(verticalPath);
  const storagePath = `video/sdvico_${content.id.slice(0, 8)}_${Date.now()}.mp4`;
  const up = await client.storage.from('brand-assets').upload(storagePath, buf, { contentType: 'video/mp4', upsert: false });
  if (up.error) throw new Error('upload Storage: ' + up.error.message);
  // 2. brand_assets (kind=video).
  const { data: asset, error: ae } = await client.from('brand_assets')
    .insert({ kind: 'video', title, storage_path: storagePath, source: 'video-pipeline' }).select('id').single();
  if (ae || !asset) throw new Error('brand_assets: ' + (ae?.message || ''));
  // 3. Caption ngắn + hashtag đúng sản phẩm (số tổng đài để dạng đọc được cho người xem).
  const { guessGroup, productHashtags, DEFAULT_HASHTAGS } = await import('../products.mjs');
  const grp = guessGroup(`${content.title || ''} ${title}`);
  const tags = [...DEFAULT_HASHTAGS, ...(grp ? productHashtags(grp) : [])].join(' ');
  const caption = `${title}\n\nGọi tổng đài 1900 23 23 49 để được tư vấn tận nơi.\n\n${tags}`;
  const risk = script.assessment?.risk === 'red' ? 'red' : script.assessment?.risk === 'amber' ? 'amber' : 'none';
  const assets = { image: null, video: asset.id };
  // 4. mkt_content (status review; red thì cần cấp quản lý duyệt).
  const { data: ins, error: ce } = await client.from('mkt_content').insert({
    kind: 'social', title,
    brief: { keyword: title, intent: 'giao_dich', assets, channels: ['facebook'], generator: 'video-pipeline', post_kind: 'video', source_content: content.id, risk, compliance: script.assessment?.flags || {} },
    draft: caption, status: 'review', needs_gov_review: risk === 'red',
  }).select('id').single();
  if (ce || !ins) throw new Error('mkt_content: ' + (ce?.message || ''));
  // 5. approval_queue (pending) -> hiện ở trang Duyệt.
  const { error: qe } = await client.from('approval_queue').insert({
    kind: 'mkt_publish_content', title: `[Facebook] 🎬 ${title}`,
    payload: { content_id: ins.id, format: 'social', keyword: title, intent: 'giao_dich', risk, assets, channels: ['facebook'], authored: 'ai', post_kind: 'video', needs_manager_approval: risk === 'red' },
    status: 'pending',
  });
  if (qe) throw new Error('approval_queue: ' + qe.message);
  console.log(`\nĐã đẩy vào Hàng đợi duyệt: [Facebook] 🎬 ${title}`);
  console.log(`  mkt_content=${ins.id.slice(0, 8)} | brand_assets(video)=${asset.id.slice(0, 8)} | risk=${risk}`);
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

  // Đẩy vào Hàng đợi duyệt (mặc định bật; thêm --no-queue để chỉ tạo file, không đẩy).
  if (!process.argv.includes('--no-queue')) {
    try {
      await pushToApprovalQueue(client, { content, script, verticalPath: results.vertical.out });
    } catch (e) {
      console.warn('Không đẩy được vào Hàng đợi duyệt:', e.message, '(video vẫn có ở out/video/).');
    }
  }
}

main().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
