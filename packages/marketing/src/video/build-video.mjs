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
  // edge-tts đôi khi trả "No audio received" cho 1 câu cụ thể (hình như phía Microsoft). Thử giọng
  // chính -> giọng dự phòng (khác giới tính) -> chậm hơn. Hết mới lùi tiếng lặng.
  const fallback = ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'].filter((v) => v !== voice);
  const attempts = [
    { voice, rate: '+0%' },
    ...fallback.map((v) => ({ voice: v, rate: '+0%' })),
    { voice, rate: '-10%' },
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      await python('tts.py', ['--text-file', txt, '--out', outPath, '--voice', a.voice, '--rate', a.rate]);
      if (a.voice !== voice || a.rate !== '+0%') {
        console.log(`  (cảnh ${tag}: TTS đổi qua ${a.voice} rate ${a.rate})`);
      }
      return probeDuration(outPath);
    } catch (e) { lastErr = e; }
  }
  console.warn(`TTS lỗi cảnh ${tag} sau ${attempts.length} lần thử (${lastErr?.message}). Dùng tiếng lặng ${estSec}s, xem lại lời thoại cảnh này.`);
  return silentAudio(outPath, estSec);
}

// Ghép audio các cảnh thành 1 file rồi chạy Whisper (artifact/ghi nhận, không chặn).
// Skip khi --skip-whisper (dùng cho CI/GitHub Actions để đỡ ~2 phút cài faster-whisper).
async function whisperArtifact(sceneAudios, workDir, tag) {
  if (process.argv.includes('--skip-whisper')) return null;
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
  // TTS cho outro: đọc "Gọi ngay tổng đài 1900 23 23 49" (spellPhones sẽ đọc từng chữ số).
  const outroAudio = join(fdir, 'outro.mp3');
  try { await tts('Gọi ngay tổng đài 1900 23 23 49 để được hỗ trợ.', outroAudio, voice, fdir, 'outro'); } catch { /* bo qua */ }
  const out = join(outDir, `sdvico_${contentId.slice(0, 8)}_${format}.mp4`);
  await assembleVideo({ scenes: built, format, workDir: fdir, brandLine: BRAND_LINE, outPath: out, outroAudioPath: outroAudio });
  const totalDur = await probeDuration(out);
  return { out, totalDur, scenes: built.length, whisper: wa?.info || null };
}

// Đẩy video (bản NGANG 16:9) vào Hàng đợi duyệt: upload Storage + brand_assets + mkt_content +
// approval_queue (pending, kênh Facebook). KHÔNG tự đăng — người bấm Duyệt (điều cấm 1).
// (Reel/TikTok dùng đường avatar AI riêng theo phân công, không dựng ở đây.)
async function pushToApprovalQueue(client, { content, script, horizontalPath }) {
  const title = (script.titles && script.titles[0]) || content.title || 'Video SDVICO';
  // Upload video ngang lên Storage + brand_assets.
  const buf = await readFile(horizontalPath);
  const sp = `video/sdvico_${content.id.slice(0, 8)}_ngang_${Date.now()}.mp4`;
  const up = await client.storage.from('brand-assets').upload(sp, buf, { contentType: 'video/mp4', upsert: false });
  if (up.error) throw new Error('upload Storage: ' + up.error.message);
  const { data: a, error: ae } = await client.from('brand_assets')
    .insert({ kind: 'video', title: `${title} (ngang)`, storage_path: sp, source: 'video-pipeline' }).select('id').single();
  if (ae || !a) throw new Error('brand_assets: ' + (ae?.message || ''));
  const videoId = a.id;

  // Caption ngắn + hashtag đúng sản phẩm.
  const { guessGroup, productHashtags, DEFAULT_HASHTAGS } = await import('../products.mjs');
  const grp = guessGroup(`${content.title || ''} ${title}`);
  const tags = [...DEFAULT_HASHTAGS, ...(grp ? productHashtags(grp) : [])].join(' ');
  const caption = `${title}\n\nGọi tổng đài 1900 23 23 49 để được tư vấn tận nơi.\n\n${tags}`;
  const risk = script.assessment?.risk === 'red' ? 'red' : script.assessment?.risk === 'amber' ? 'amber' : 'none';
  const assets = { image: null, video: videoId, video_h: videoId };
  const channels = ['facebook'];
  const { data: ins, error: ce } = await client.from('mkt_content').insert({
    kind: 'social', title,
    brief: { keyword: title, intent: 'giao_dich', assets, channels, generator: 'video-pipeline', post_kind: 'video', source_content: content.id, risk, compliance: script.assessment?.flags || {} },
    draft: caption, status: 'review', needs_gov_review: risk === 'red',
  }).select('id').single();
  if (ce || !ins) throw new Error('mkt_content: ' + (ce?.message || ''));
  const { error: qe } = await client.from('approval_queue').insert({
    kind: 'mkt_publish_content', title: `[Facebook 16:9] 🎬 ${title}`,
    payload: { content_id: ins.id, format: 'social', keyword: title, intent: 'giao_dich', risk, assets, channels, authored: 'ai', post_kind: 'video', needs_manager_approval: risk === 'red' },
    status: 'pending',
  });
  if (qe) throw new Error('approval_queue: ' + qe.message);
  console.log(`\nĐã đẩy vào Hàng đợi duyệt: [Facebook 16:9] 🎬 ${title}`);
  console.log(`  mkt_content=${ins.id.slice(0, 8)} | video=${videoId.slice(0, 8)} | risk=${risk}`);
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
    // Nhận cả UUID đầy đủ lẫn prefix (vd 8 ký tự đầu) — tiện chạy tay. UUID không dùng LIKE được
    // nên với prefix phải quét rồi so trong JS.
    if (contentId.length >= 32) {
      const { data } = await client.from('mkt_content').select('id, title, draft, brief').eq('id', contentId).maybeSingle();
      content = data;
    } else {
      const { data } = await client.from('mkt_content').select('id, title, draft, brief').order('created_at', { ascending: false }).limit(500);
      content = (data || []).find((c) => String(c.id).startsWith(contentId));
    }
    if (content?.id) contentId = content.id;
  } else {
    const { data } = await client.from('mkt_content').select('id, title, draft, brief')
      .not('draft', 'is', null).order('created_at', { ascending: false }).limit(1);
    content = data?.[0];
  }
  if (!content) throw new Error('Không tìm thấy nội dung nguồn (mkt_content có draft).');
  contentId = content.id;
  console.log('Nội dung nguồn:', content.title, `(${contentId.slice(0, 8)})`);

  // Tư liệu: CHỈ dùng asset đúng sản phẩm (product_group của bài). Bài SEA-40 chỉ được dùng ảnh/
  // video SEA-40, không lẫn S-Tracking hay sơn (điều cấm 5 - không nhận vơ, và tránh sai lệch nội dung).
  const productGroup = content.brief?.rotation_group;
  if (!productGroup) throw new Error('Bài chưa gán sản phẩm (brief.rotation_group). Cập nhật ở /tu-lieu rồi thử lại.');
  const { data: assets } = await client.from('brand_assets')
    .select('id, kind, title, storage_path')
    .eq('product_group', productGroup)
    .order('created_at', { ascending: false });
  if (!assets?.length) throw new Error(`Sản phẩm "${productGroup}" chưa có tư liệu trong brand_assets.`);
  console.log(`Sản phẩm: ${productGroup} (${assets.length} tư liệu)`);

  // Kịch bản.
  console.log('Sinh kịch bản (Gemini)...');
  const script = await generateVideoScript(content, assets.map((a) => ({ id: a.id, kind: a.kind, title: a.title })), PRODUCT_FACTS);
  console.log('Tiêu đề:', script.titles);
  console.log('Rủi ro tuân thủ:', script.assessment.risk, JSON.stringify(script.assessment.flags));
  console.log('Cảnh: dọc', script.vertical.length, '| ngang', script.horizontal.length);

  const workDir = join(HERE, '..', '..', '..', '..', 'out', 'video', `work_${contentId.slice(0, 8)}`);
  await mkdir(workDir, { recursive: true });

  // Tải các asset được dùng. Chỉ dựng bản HORIZONTAL cho post FB (Reel dùng đường avatar AI riêng).
  const usedIds = new Set(script.horizontal.map((s) => s.assetId));
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

  console.log('\n== Dựng bản horizontal (16:9) cho post Facebook ==');
  const horizontal = await buildFormat('horizontal', script.horizontal, assetPaths, voice, workDir, outDir, contentId);
  console.log(`  -> ${horizontal.out} (${horizontal.totalDur.toFixed(1)}s, ${horizontal.scenes} cảnh)`);

  // 3 ảnh đại diện từ bản ngang.
  const thumbs = [];
  for (let i = 0; i < 3; i++) {
    const t = Math.max(0.5, (horizontal.totalDur * (i + 1)) / 4);
    const th = join(outDir, `sdvico_${contentId.slice(0, 8)}_thumb${i + 1}.jpg`);
    await ffmpeg(['-y', '-ss', t.toFixed(2), '-i', horizontal.out, '-frames:v', '1', '-q:v', '3', th]);
    thumbs.push(th);
  }

  const summary = {
    contentId, title: content.title, titles: script.titles,
    compliance: script.assessment,
    horizontal, thumbnails: thumbs,
  };
  await writeFile(join(outDir, `sdvico_${contentId.slice(0, 8)}_summary.json`), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nXONG. Tóm tắt:', join(outDir, `sdvico_${contentId.slice(0, 8)}_summary.json`));
  console.log(JSON.stringify({ horizontal: horizontal.out, thumbs }, null, 2));

  // Đẩy vào Hàng đợi duyệt (mặc định bật; thêm --no-queue để chỉ tạo file, không đẩy).
  // Chỉ có bản ngang 16:9 cho Facebook (Reel/TikTok dùng đường avatar AI riêng theo phân công).
  if (!process.argv.includes('--no-queue')) {
    try {
      await pushToApprovalQueue(client, { content, script, horizontalPath: horizontal.out });
    } catch (e) {
      console.warn('Không đẩy được vào Hàng đợi duyệt:', e.message, '(video vẫn có ở out/video/).');
    }
  }
}

main().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
