// Tạo INTRO (2.5s) và OUTRO (4s) cho video SDVICO. Vẽ khung bằng @napi-rs/canvas (đã có sẵn cho
// banner) rồi ffmpeg tạo mp4 tĩnh CÙNG CODEC với cảnh chính để nối bằng concat -c copy được.
// Intro: logo SDVICO + slogan. Outro: tổng đài + slogan (đọc số từng chữ số qua TTS ngoài).
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ffmpeg } from './ffmpeg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Nạp font Be Vietnam Pro cho canvas. Font đã được ensureFonts.js xuất ra workDir dạng .ttf.
let fontsReady = false;
function registerFontsFromWorkdir(workDir) {
  if (fontsReady) return;
  try {
    GlobalFonts.registerFromPath(join(workDir, 'BeVietnamPro-Black.ttf'), 'BVP-Black');
    GlobalFonts.registerFromPath(join(workDir, 'BeVietnamPro-Regular.ttf'), 'BVP');
    fontsReady = true;
  } catch { /* font thiếu -> canvas sẽ dùng font mặc định, không sập */ }
}

// Logo SDVICO nhúng base64 (dùng chung với logo-overlay web app).
let logoImg = null;
async function getLogo() {
  if (logoImg) return logoImg;
  const p = join(HERE, '..', '..', '..', '..', 'apps', 'approval-ui', 'lib', 'gen', 'assets', 'logo-sdvico.jpg');
  try { logoImg = await loadImage(readFileSync(p)); return logoImg; } catch { return null; }
}

// Vẽ nền gradient xanh biển SDVICO.
function drawBackground(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1f4e79');
  g.addColorStop(1, '#0d2a45');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Vẽ intro card. Trả về Buffer PNG.
async function drawIntro(W, H) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  drawBackground(ctx, W, H);
  const logo = await getLogo();
  if (logo) {
    const size = Math.round(Math.min(W, H) * 0.35);
    ctx.drawImage(logo, (W - size) / 2, H * 0.28, size, size);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(W * 0.075)}px BVP-Black`;
  ctx.fillText('SDVICO', W / 2, H * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `${Math.round(W * 0.032)}px BVP`;
  ctx.fillText('Công nghệ số cho ngành biển', W / 2, H * 0.78);
  return cv.toBuffer('image/png');
}

// Vẽ outro card.
async function drawOutro(W, H) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  drawBackground(ctx, W, H);
  const logo = await getLogo();
  if (logo) {
    const size = Math.round(Math.min(W, H) * 0.22);
    ctx.drawImage(logo, (W - size) / 2, H * 0.14, size, size);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(W * 0.05)}px BVP-Black`;
  ctx.fillText('Gọi ngay tổng đài', W / 2, H * 0.5);
  // Số điện thoại to.
  ctx.fillStyle = '#ffcc00';
  ctx.font = `${Math.round(W * 0.11)}px BVP-Black`;
  ctx.fillText('1900 23 23 49', W / 2, H * 0.62);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${Math.round(W * 0.03)}px BVP`;
  ctx.fillText('SDVICO đồng hành cùng ngư dân', W / 2, H * 0.72);
  return cv.toBuffer('image/png');
}

// Tạo file mp4 intro/outro CÙNG codec cảnh chính (H.264/AAC yuv420p 30fps 44100Hz stereo)
// để nối bằng concat -c copy. imagePath là ảnh png ở workDir; durationSec là thời lượng.
// audioPath = null -> lồng tiếng lặng để đồng nhất track audio.
async function makeBumperClip(imagePath, audioPath, durationSec, outSeg, workDir, fmt) {
  const args = [
    '-y',
    '-loop', '1', '-framerate', '30', '-i', imagePath,
  ];
  if (audioPath) {
    args.push('-i', audioPath);
  } else {
    args.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`);
  }
  args.push(
    '-t', durationSec.toFixed(3),
    '-vf', `scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=decrease,pad=${fmt.w}:${fmt.h}:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-r', '30', '-video_track_timescale', '30000',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    '-shortest',
    outSeg,
  );
  await ffmpeg(args, { cwd: workDir });
  return outSeg;
}

// Tạo intro và outro cho một FORMAT. Trả về {introSeg, outroSeg} là tên file trong workDir để
// concat cùng các cảnh chính. outroAudioPath: mp3 TTS đọc tổng đài (đã sinh sẵn), có thể null.
export async function buildBumpers({ workDir, fmt, outroAudioPath = null, introDurSec = 2.5, outroDurSec = 4 }) {
  registerFontsFromWorkdir(workDir);
  const introPng = join(workDir, 'intro.png');
  const outroPng = join(workDir, 'outro.png');
  await writeFile(introPng, await drawIntro(fmt.w, fmt.h));
  await writeFile(outroPng, await drawOutro(fmt.w, fmt.h));
  const introSeg = 'intro.mp4';
  const outroSeg = 'outro.mp4';
  await makeBumperClip(introPng, null, introDurSec, introSeg, workDir, fmt);
  await makeBumperClip(outroPng, outroAudioPath, outroDurSec, outroSeg, workDir, fmt);
  return { introSeg, outroSeg };
}
