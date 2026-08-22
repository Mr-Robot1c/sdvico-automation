// Dây chuyền video SDVICO (chạy máy nội bộ).
// Kịch bản (Gemini) -> TTS từng cảnh (edge-tts) -> phụ đề từ kịch bản + Whisper artifact ->
// ghép bản dọc 9:16 và ngang 16:9 -> 3 tiêu đề + 3 ảnh đại diện.
// KHÔNG tự đăng: đầu ra để người duyệt (điều cấm 1). Chỉ dùng tư liệu brand_assets (điều cấm 5).
//
// Chạy:
//   node packages/marketing/src/video/build-video.mjs [contentId] [--voice vi-VN-HoaiMyNeural] [--out DIR]
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadRealEnv } from './env.mjs';
import { downloadAsset, probeDuration, ffmpeg, splitAtSilence } from './ffmpeg.mjs';
import { assembleVideo } from './assemble.mjs';
import { generateVideoScript } from './script.mjs';
import { WHISPER_PROMPT } from './terms.mjs';
import { PRODUCT_FACTS } from '../product-facts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// So lien he doi 21/8 theo sep: 0939 243 222 (du phong 0974 669 649 — doi tay o day + bumpers.mjs).
const BRAND_LINE = 'SDVICO • Hotline 0939 243 222';

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

// Tách lời thoại thành từng câu (theo . ! ? …) để đọc mỗi câu một ngữ điệu.
function splitSentences(text) {
  const parts = String(text || '').match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [];
  return parts.map((s) => s.trim()).filter(Boolean);
}

// Ngữ điệu theo LOẠI câu (user 21/8: "giọng đọc ngang quá, có thể lên xuống được không"):
// câu hỏi lên giọng chậm lại chút, câu cảm hào hứng nhanh hơn, câu thường dao động nhẹ xen
// kẽ — mỗi câu synth riêng rồi ghép, nghe có nhịp thật thay vì một đường thẳng.
function prosodyFor(sentence, idx) {
  if (/\?$/.test(sentence)) return { rate: '+8%', pitch: '+7Hz' };
  if (/!$/.test(sentence)) return { rate: '+13%', pitch: '+5Hz' };
  return idx % 2 === 0 ? { rate: '+10%', pitch: '+1Hz' } : { rate: '+8%', pitch: '+4Hz' };
}

// Synth MỘT khúc với rate/pitch cho trước (throw khi lỗi — caller tự retry/fallback).
async function ttsChunk(text, outPath, voice, workDir, tag, rate, pitch) {
  const txt = join(workDir, `${tag}.txt`);
  await writeFile(txt, text, 'utf8');
  await python('tts.py', ['--text-file', txt, '--out', outPath, '--voice', voice, '--rate', rate, '--pitch', pitch]);
}

// ===== GIỌNG CHÍNH: Gemini TTS (user chốt 21/8 sau khi nghe demo) =====
// Cùng họ giọng NotebookLM nhưng có API + dùng GEMINI_API_KEY sẵn có. Đọc NGUYÊN VĂN kịch bản,
// cảm xúc chỉ đạo bằng câu lệnh (không cần tách câu chỉnh rate/pitch như edge-tts). Trả PCM
// s16le -> ffmpeg sang mp3. Env: GEMINI_TTS_MODEL, GEMINI_TTS_VOICE (Puck nam / Leda nữ...),
// GEMINI_TTS_STYLE; TTS_ENGINE=edge để tắt hẳn. Lỗi/hết hạn mức -> caller tự lùi edge-tts.
// DANH SÁCH model nối tiếp: free tier hết hạn mức NGÀY của model này thì tự sang model kế
// (build 21/8 chiều: 3.1 cạn RPD sau demo + 2 lượt build -> cả video rơi về edge oan). Đặt
// env GEMINI_TTS_MODEL thì chỉ dùng đúng model đó. Hạn mức reset nửa đêm giờ Mỹ = 14h VN,
// nên build 7h sáng VN vẫn nằm trong "ngày" hôm trước — dự phòng model là bắt buộc.
const GEMINI_TTS_MODELS = process.env.GEMINI_TTS_MODEL
  ? [process.env.GEMINI_TTS_MODEL]
  : ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'];
let geminiModelIdx = 0; // model đang dùng; 429 cạn ngày thì nhích lên, các cảnh sau đi thẳng model sống
// 21/8 toi: user nghe Puck (nam) va Leda (nu) roi chot GIONG NU Leda lam mac dinh.
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Leda';
const GEMINI_TTS_STYLE = process.env.GEMINI_TTS_STYLE
  || 'Đọc bằng tiếng Việt, giọng nữ TikToker trẻ trung hào hứng, ngữ điệu lên xuống tự nhiên, nhấn nhá chỗ quan trọng, câu cảm thán thì phấn khích, giữ đúng một chất giọng từ đầu tới cuối: ';
// Hạn mức PHÚT của TTS free tier chặt (build 21/8: bản ngang dính 429 giữa chừng, bản dọc chạy
// sau lại êm) -> giãn nhịp giữa các lần gọi để cả 2 bản đều được giọng Gemini. Env chỉnh được.
const GEMINI_TTS_GAP_MS = Number(process.env.GEMINI_TTS_GAP_MS || 20000);
let geminiLastCallAt = 0;
async function geminiTTS(cleanText, outPath, workDir, tag, model) {
  const gap = geminiLastCallAt + GEMINI_TTS_GAP_MS - Date.now();
  if (gap > 0) await new Promise((r) => setTimeout(r, gap));
  geminiLastCallAt = Date.now();
  const body = {
    contents: [{ parts: [{ text: GEMINI_TTS_STYLE + '\n\n' + cleanText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
    },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`gemini-tts HTTP ${res.status}: ${JSON.stringify(json.error || json).slice(0, 200)}`);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error('gemini-tts khong tra audio: ' + JSON.stringify(json).slice(0, 200));
  const mime = part.inlineData.mimeType || '';
  const rate = (mime.match(/rate=(\d+)/) || [])[1] || '24000';
  const ch = (mime.match(/channels=(\d+)/) || [])[1] || '1';
  const pcm = join(workDir, `${tag}_gem.pcm`);
  await writeFile(pcm, Buffer.from(part.inlineData.data, 'base64'));
  await ffmpeg(['-y', '-f', 's16le', '-ar', rate, '-ac', ch, '-i', pcm, '-c:a', 'libmp3lame', '-q:a', '4', outPath]);
  return probeDuration(outPath);
}

// Gemini TTS có thử lại + đổi model: 429 đợi 25s thử lại (hạn mức PHÚT); vẫn 429 coi như model
// cạn hạn mức NGÀY -> sang model kế (idx giữ ở module, các cảnh sau đi thẳng model sống). Hết
// model thì THROW cho caller làm lại cả bản bằng edge. Nhận text ĐÃ làm sạch.
async function geminiTTSWithRetry(cleanText, outPath, workDir, tag) {
  let lastGemErr;
  for (; geminiModelIdx < GEMINI_TTS_MODELS.length; geminiModelIdx++) {
    const model = GEMINI_TTS_MODELS[geminiModelIdx];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await geminiTTS(cleanText, outPath, workDir, tag, model);
      } catch (e) {
        lastGemErr = e;
        if (/429/.test(String(e?.message)) && attempt === 0) await new Promise((r) => setTimeout(r, 25000));
      }
    }
    if (/429/.test(String(lastGemErr?.message))) {
      if (geminiModelIdx + 1 < GEMINI_TTS_MODELS.length) {
        console.warn(`  (gemini-tts: ${model} hết hạn mức, chuyển ${GEMINI_TTS_MODELS[geminiModelIdx + 1]})`);
      }
      continue; // 429 dai dẳng: thử model kế
    }
    break; // lỗi khác 429: không đổi model, cho caller lùi edge
  }
  throw lastGemErr || new Error('gemini-tts loi');
}

// engine 'gemini': đọc bằng Gemini TTS, THROW khi hỏng (caller quyết làm lại cả bản bằng edge —
// tránh video lẫn 2 giọng giữa chừng). engine 'edge': đường cũ, tự chống chịu, không bao giờ throw.
async function tts(text, outPath, voice, workDir, tag, engine = 'edge') {
  // Đọc số điện thoại/tổng đài từng chữ số (chỉ cho giọng đọc, phụ đề giữ số gốc).
  const clean = spellPhones(cleanNarration(text));
  // Thời lượng dự phòng theo số ký tự (~14 ký tự/giây tiếng Việt), tối thiểu 2 giây.
  const estSec = Math.max(2, Math.round(clean.length / 14));
  if (!clean) return silentAudio(outPath, estSec);

  if (engine === 'gemini') return geminiTTSWithRetry(clean, outPath, workDir, tag);

  // LÊN XUỐNG GIỌNG: nhiều câu thì synth từng câu với ngữ điệu riêng rồi ghép. Một câu lỗi
  // sau 3 lần thử, hoặc chỉ có 1 câu -> rơi về cách cũ đọc cả đoạn một giọng bên dưới.
  const sentences = splitSentences(clean);
  if (sentences.length > 1) {
    try {
      const parts = [];
      for (let i = 0; i < sentences.length; i++) {
        const pro = prosodyFor(sentences[i], i);
        const piece = join(workDir, `${tag}_c${i}.mp3`);
        let done = false;
        let err;
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          try { await ttsChunk(sentences[i], piece, voice, workDir, `${tag}_c${i}`, pro.rate, pro.pitch); done = true; } catch (e) { err = e; }
        }
        if (!done) throw err || new Error('tts cau ' + i + ' loi');
        parts.push(`${tag}_c${i}.mp3`);
      }
      const list = join(workDir, `${tag}_cat.txt`);
      await writeFile(list, parts.map((p) => `file ${p}`).join('\n'), 'utf8');
      await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-q:a', '4', outPath], { cwd: workDir });
      return probeDuration(outPath);
    } catch (e) {
      console.warn(`  (cảnh ${tag}: đọc theo từng câu lỗi "${String(e?.message || e).slice(0, 100)}", lùi về đọc cả đoạn một giọng)`);
    }
  }

  const txt = join(workDir, `${tag}.txt`);
  await writeFile(txt, clean, 'utf8');
  // GIỮ NGUYÊN 1 GIỌNG cho toàn video (không đổi giọng giữa chừng). edge-tts hay bị
  // "No audio received" -> thử lại vài lần với rate khác nhau. Hết mới lùi tiếng lặng.
  // Rate mac dinh +10% cho nhip tre trung (user 21/8: theo trend gioi tre; 19/8 tung +8%). Cac
  // lan retry giu +8% roi lui rate cham dan neu edge-tts bao "No audio received".
  const baseRate = process.env.TTS_RATE || '+10%';
  // Pitch nhích nhẹ cho giọng tươi hơn (sếp 21/8: "giọng chưa có cảm xúc"). Env TTS_PITCH đổi
  // được, vd '+4Hz' tươi hơn nữa, '+0Hz' về giọng cũ. Cảm xúc chính vẫn đến từ dấu câu trong
  // kịch bản (script.mjs đã yêu cầu câu hỏi, câu cảm, ngắt nhịp).
  const pitch = process.env.TTS_PITCH || '+3Hz';
  const attempts = [
    { voice, rate: baseRate },
    { voice, rate: '+0%' },
    { voice, rate: '-5%' },
    { voice, rate: '-10%' },
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      await python('tts.py', ['--text-file', txt, '--out', outPath, '--voice', a.voice, '--rate', a.rate, '--pitch', pitch]);
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

const OUTRO_TEXT = 'Nhắn tin cho Page SDVICO hoặc gọi số 0939 243 222 để được hỗ trợ.';

async function buildFormat(format, scenes, assetPaths, voice, workDir, outDir, contentId) {
  const fdir = join(workDir, format);
  await mkdir(fdir, { recursive: true });
  // GIỌNG NGUYÊN KHỐI: thử Gemini TTS cho TOÀN BỘ cảnh + outro của bản này; bất kỳ cảnh nào
  // hỏng (hết hạn mức...) thì làm lại HẾT bằng edge-tts — không để video lẫn 2 giọng giữa chừng.
  const engines = process.env.TTS_ENGINE !== 'edge' && process.env.GEMINI_API_KEY ? ['gemini', 'edge'] : ['edge'];
  const outroAudio = join(fdir, 'outro.mp3');
  let built = [];
  let sceneAudios = [];
  let engineUsed = 'edge';
  for (const engine of engines) {
    try {
      built = [];
      sceneAudios = [];
      let outroDone = false;
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        const audio = join(fdir, `sc${i}.mp3`);
        let dur;
        const cleanLast = spellPhones(cleanNarration(s.narration));
        if (engine === 'gemini' && i === scenes.length - 1 && cleanLast) {
          // CẢNH CUỐI + OUTRO đọc CHUNG một lần gọi rồi cắt tại khoảng lặng -> outro cùng giọng,
          // cùng nhịp với lời đọc (user 21/8), lại bớt một lần gọi hạn mức.
          const cleanOutro = spellPhones(cleanNarration(OUTRO_TEXT));
          const full = join(fdir, 'tail_full.mp3');
          await geminiTTSWithRetry(`${cleanLast}\n\n${cleanOutro}`, full, fdir, 'tail');
          const r = await splitAtSilence(full, audio, outroAudio, cleanLast.length / (cleanLast.length + cleanOutro.length));
          dur = r.first;
          outroDone = true;
          console.log(`  (outro đọc chung cảnh cuối, cắt tại ${r.cut.toFixed(2)}s/${r.total.toFixed(2)}s${r.found ? '' : ' — không thấy khoảng lặng, cắt theo tỷ lệ'})`);
        } else {
          dur = await tts(s.narration, audio, voice, fdir, `t${i}`, engine);
        }
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
      // Outro đọc số 0939 243 222 (spellPhones đọc từng chữ số). Đường edge tự chống chịu
      // (không throw); đường gemini throw thì cả bản rơi xuống edge cùng nhau. Gemini đã đọc
      // chung với cảnh cuối ở trên thì bỏ qua.
      if (!outroDone) await tts(OUTRO_TEXT, outroAudio, voice, fdir, 'outro', engine);
      engineUsed = engine;
      break;
    } catch (e) {
      if (engine !== 'gemini') throw e;
      console.warn(`  (bản ${format}: Gemini TTS không trọn bộ "${String(e?.message || e).slice(0, 140)}" — làm lại toàn bộ bằng edge-tts)`);
    }
  }
  console.log(`  Giọng bản ${format}: ${engineUsed === 'gemini' ? `Gemini TTS (${GEMINI_TTS_VOICE}, ${GEMINI_TTS_MODELS[Math.min(geminiModelIdx, GEMINI_TTS_MODELS.length - 1)]})` : 'edge-tts'}`);
  const wa = await whisperArtifact(sceneAudios, fdir, format);
  const out = join(outDir, `sdvico_${contentId.slice(0, 8)}_${format}.mp4`);
  await assembleVideo({ scenes: built, format, workDir: fdir, brandLine: BRAND_LINE, outPath: out, outroAudioPath: outroAudio });
  const totalDur = await probeDuration(out);
  return { out, totalDur, scenes: built.length, whisper: wa?.info || null };
}

// Đẩy video (CẢ 2 bản ngang 16:9 + dọc 9:16) vào Hàng đợi duyệt: upload Storage + brand_assets +
// mkt_content + approval_queue (pending, kênh Facebook + TikTok). Người bấm Duyệt (điều cấm 1).
// Lúc đăng: FB dùng video_h (ngang), TikTok dùng video_v (dọc).
async function pushToApprovalQueue(client, { content, script, horizontalPath, verticalPath }) {
  const title = (script.titles && script.titles[0]) || content.title || 'Video SDVICO';

  // Helper upload 1 file mp4 -> brand_assets, trả về id.
  const uploadVideo = async (path, tag) => {
    const buf = await readFile(path);
    const sp = `video/sdvico_${content.id.slice(0, 8)}_${tag}_${Date.now()}.mp4`;
    const up = await client.storage.from('brand-assets').upload(sp, buf, { contentType: 'video/mp4', upsert: false });
    if (up.error) throw new Error(`upload ${tag}: ` + up.error.message);
    const { data: a, error } = await client.from('brand_assets')
      .insert({ kind: 'video', title: `${title} (${tag})`, storage_path: sp, source: 'video-pipeline' }).select('id').single();
    if (error || !a) throw new Error(`brand_assets ${tag}: ` + (error?.message || ''));
    return a.id;
  };
  const videoH = await uploadVideo(horizontalPath, 'ngang'); // 16:9 -> FB
  const videoV = verticalPath ? await uploadVideo(verticalPath, 'doc') : videoH; // 9:16 -> TikTok

  // Caption ngắn + hashtag đúng sản phẩm.
  const { guessGroup, productHashtags, DEFAULT_HASHTAGS } = await import('../products.mjs');
  const grp = guessGroup(`${content.title || ''} ${title}`);
  const tags = [...DEFAULT_HASHTAGS, ...(grp ? productHashtags(grp) : [])].join(' ');
  const caption = `${title}\n\nGọi 0939 243 222 để được tư vấn tận nơi.\n\n${tags}`;
  const risk = script.assessment?.risk === 'red' ? 'red' : script.assessment?.risk === 'amber' ? 'amber' : 'none';

  // Chọn 1 ẢNH SẢN PHẨM để thả vào bình luận đầu của bài video (bà con thấy sản phẩm rõ,
  // không chỉ có video). Ưu tiên ảnh trong folder sản phẩm này; không có thì để null.
  let productImageId = null;
  if (grp) {
    const { data: imgs } = await client.from('brand_assets')
      .select('id').eq('kind', 'image').eq('product_group', grp).limit(20);
    if (imgs && imgs.length) productImageId = imgs[Math.floor(Math.random() * imgs.length)].id;
  }

  // video = fallback dùng ngang; video_h ngang cho FB; video_v dọc cho TikTok.
  // image = ảnh sản phẩm thả vào bình luận đầu (publishContentToFacebook tự làm khi có cả video và image).
  const assets = { image: productImageId, video: videoH, video_h: videoH, video_v: videoV };
  const channels = ['facebook', 'tiktok'];
  const srcBrief = content.brief || {};

  // ===== BÀI BÁN HÀNG TỪ VÒNG XOAY (rotation): GẮN video vào CHÍNH BÀI, KHÔNG tạo bài mới =====
  // User chốt 18/8: "bài bán hàng sản phẩm có video thì video kèm ảnh luôn trong 1 bài, đăng cả
  // Post lẫn Reel". Trước đây pipeline luôn sinh bài video RIÊNG (source_content) -> người duyệt
  // thấy 2 card, tưởng bài chữ "chưa có video". Nay: bài rotation -> update brief.assets của bài
  // gốc (giữ ảnh gốc, thêm video_h/video_v, đánh dấu post_reel=true) + cập nhật payload queue.
  // Bài content / thủ công (Xưởng sản xuất bấm Làm video) vẫn theo luồng cũ: bài video riêng.
  if (srcBrief.generator === 'rotation' && srcBrief.rotation === true) {
    const mergedAssets = { ...(srcBrief.assets || {}), video: videoH, video_h: videoH, video_v: videoV };
    // Ảnh: giữ ảnh gốc của bài; nếu bài gốc chưa có ảnh thì dùng ảnh sản phẩm vừa chọn.
    if (!mergedAssets.image && productImageId) mergedAssets.image = productImageId;
    const mergedChannels = Array.from(new Set([...(srcBrief.channels || ['facebook']), 'tiktok']));
    const newBrief = {
      ...srcBrief,
      assets: mergedAssets,
      channels: mergedChannels,
      post_reel: true,                 // publish: đăng Post (video_h) + Reel (video_v) trên FB
      video_requested: false,          // dựng xong
      video_titles: script.titles || [],
      video_risk: risk,
      video_compliance: script.assessment?.flags || {},
    };
    const { error: ue } = await client.from('mkt_content').update({ brief: newBrief }).eq('id', content.id);
    if (ue) throw new Error('mkt_content update: ' + ue.message);
    // Cập nhật payload của mục hàng đợi tương ứng (còn pending) để card hiện video + kênh.
    const { data: qrows } = await client.from('approval_queue')
      .select('id, payload').eq('kind', 'mkt_publish_content').eq('payload->>content_id', content.id).eq('status', 'pending');
    for (const q of qrows || []) {
      const p = { ...(q.payload || {}), assets: mergedAssets, channels: mergedChannels, post_reel: true, has_video: true };
      await client.from('approval_queue').update({ payload: p }).eq('id', q.id);
    }
    console.log(`\nĐã GẮN video vào bài gốc (Post + Reel + TikTok): ${content.title}`);
    console.log(`  mkt_content=${content.id.slice(0, 8)} | ngang(Post)=${videoH.slice(0, 8)} | doc(Reel/TikTok)=${videoV.slice(0, 8)} | risk=${risk}`);
    return;
  }

  // ===== Luồng cũ (bài content / thủ công): tạo bài video riêng =====
  // Bài nguồn thuộc cặp thử A/B -> video kế thừa cặp, nhưng mã cặp RIÊNG '<pair>-video' để
  // Evaluator so cặp VIDEO tách khỏi cặp bài text (không trộn 4 bài vào một cặp).
  const abMeta = srcBrief.ab_pair_id
    ? {
        ab_pair_id: `${srcBrief.ab_pair_id}-video`,
        ab_variant: srcBrief.ab_variant || null,
        suggestion_title: srcBrief.suggestion_title || null,
      }
    : {};
  // Nhan "Shorts" cho nguoi duyet biet day la ban ngan; KHONG lo A/B trong tieu de
  // (payload.ab_variant -> badge "Thu A/B" tren Hang doi).
  const isShortLabel = srcBrief.ab_pair_id ? 'Shorts ' : '';

  const { data: ins, error: ce } = await client.from('mkt_content').insert({
    kind: 'social', title,
    brief: { keyword: title, intent: 'giao_dich', assets, channels, generator: 'video-pipeline', post_kind: 'video', source_content: content.id, risk, compliance: script.assessment?.flags || {}, ...abMeta },
    draft: caption, status: 'review', needs_gov_review: risk === 'red',
  }).select('id').single();
  if (ce || !ins) throw new Error('mkt_content: ' + (ce?.message || ''));
  const { error: qe } = await client.from('approval_queue').insert({
    kind: 'mkt_publish_content', title: `🎬 ${isShortLabel}${title}`,
    payload: { content_id: ins.id, format: 'social', keyword: title, intent: 'giao_dich', risk, assets, channels, authored: 'ai', post_kind: 'video', needs_manager_approval: risk === 'red', ...abMeta },
    status: 'pending',
  });
  if (qe) throw new Error('approval_queue: ' + qe.message);
  console.log(`\nĐã đẩy vào Hàng đợi duyệt: 🎬 ${isShortLabel}${title}`);
  console.log(`  mkt_content=${ins.id.slice(0, 8)} | ngang(FB)=${videoH.slice(0, 8)} | doc(TikTok)=${videoV.slice(0, 8)} | risk=${risk}`);
}

async function main() {
  const env = loadRealEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // Giong mac dinh: NAM NamMinh (user 21/8 chieu doi lai sau khi nghe thu ca hai). Env TTS_VOICE ep khac.
  // Giong du phong edge-tts: NU HoaiMy (user chot giong nu 21/8 toi) de khi Gemini can han muc,
  // video roi ve edge van la giong nu chu khong bat ngo thanh nam. TTS_VOICE / --voice ep khac.
  const voice = arg('voice', process.env.TTS_VOICE || 'vi-VN-HoaiMyNeural');
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
  // Sản phẩm: ưu tiên brief.rotation_group (rotation tự đặt), rồi guessGroup từ tiêu đề + từ khóa +
  // draft (bài Xưởng sản xuất người tự soạn thường không có rotation_group).
  const { guessGroup, CONTENT_GROUP } = await import('../products.mjs');
  const brief = content.brief || {};
  let productGroup = brief.rotation_group
    || guessGroup(`${content.title || ''} ${brief.keyword || ''} ${String(content.draft || '').slice(0, 300)}`);
  // Bài content nuôi trang: kế hoạch gọi nhóm là 'Bài content' nhưng tư liệu nằm ở folder
  // 'Content' của Kho tư liệu (user 21/8: folder Content có video biển khơi, dùng dựng video
  // content được) — đổi sang folder thật để lấy được ảnh/clip.
  if (productGroup === 'Bài content' || brief.post_kind === 'content') productGroup = CONTENT_GROUP;
  if (!productGroup) throw new Error('Bài chưa gán sản phẩm (không đoán được từ tiêu đề/nội dung). Gán product_group ở /tu-lieu hoặc đặt tiêu đề rõ hơn.');
  const { data: assets } = await client.from('brand_assets')
    .select('id, kind, title, storage_path')
    .eq('product_group', productGroup)
    .order('created_at', { ascending: false });
  if (!assets?.length) throw new Error(`Sản phẩm "${productGroup}" chưa có tư liệu trong brand_assets.`);
  console.log(`Sản phẩm: ${productGroup} (${assets.length} tư liệu)`);

  // Kịch bản. Bài thuộc cặp thử A/B (rotate 🎯A/🎯B đặt brief.ab_pair_id) -> chế độ SHORTS
  // 10-20 giây theo flowchart v3 (Creator viết 2 kịch bản A/B cho video shorts gây chú ý).
  const isShort = !!brief.ab_pair_id;
  console.log(`Sinh kịch bản (Gemini)${isShort ? ' - che do SHORTS 10-20s (cap A/B ' + String(brief.ab_variant || '?') + ')' : ''}...`);
  const script = await generateVideoScript(
    content,
    assets.map((a) => ({ id: a.id, kind: a.kind, title: a.title })),
    PRODUCT_FACTS,
    { short: isShort }
  );
  console.log('Tiêu đề:', script.titles);
  console.log('Rủi ro tuân thủ:', script.assessment.risk, JSON.stringify(script.assessment.flags));
  console.log('Cảnh: dọc', script.vertical.length, '| ngang', script.horizontal.length);

  const workDir = join(HERE, '..', '..', '..', '..', 'out', 'video', `work_${contentId.slice(0, 8)}`);
  await mkdir(workDir, { recursive: true });

  // Tải các asset dùng cho CẢ 2 bản (ngang cho FB + dọc cho TikTok).
  const usedIds = new Set([...script.horizontal, ...script.vertical].map((s) => s.assetId));
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

  console.log('\n== Dựng bản horizontal (16:9) cho Facebook ==');
  const horizontal = await buildFormat('horizontal', script.horizontal, assetPaths, voice, workDir, outDir, contentId);
  console.log(`  -> ${horizontal.out} (${horizontal.totalDur.toFixed(1)}s, ${horizontal.scenes} cảnh)`);

  console.log('\n== Dựng bản vertical (9:16) cho TikTok ==');
  const vertical = await buildFormat('vertical', script.vertical, assetPaths, voice, workDir, outDir, contentId);
  console.log(`  -> ${vertical.out} (${vertical.totalDur.toFixed(1)}s, ${vertical.scenes} cảnh)`);

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
    horizontal, vertical, thumbnails: thumbs,
  };
  await writeFile(join(outDir, `sdvico_${contentId.slice(0, 8)}_summary.json`), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nXONG. Tóm tắt:', join(outDir, `sdvico_${contentId.slice(0, 8)}_summary.json`));
  console.log(JSON.stringify({ horizontal: horizontal.out, vertical: vertical.out, thumbs }, null, 2));

  // Đẩy vào Hàng đợi duyệt (bản ngang cho FB + bản dọc cho TikTok, đăng cả 2 kênh).
  if (!process.argv.includes('--no-queue')) {
    try {
      await pushToApprovalQueue(client, { content, script, horizontalPath: horizontal.out, verticalPath: vertical.out });
    } catch (e) {
      console.warn('Không đẩy được vào Hàng đợi duyệt:', e.message, '(video vẫn có ở out/video/).');
    }
  }
}

main().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
