// Tạo INTRO (2.5s) và OUTRO (4s) cho video SDVICO. Vẽ khung bằng @napi-rs/canvas (đã có sẵn cho
// banner) rồi ffmpeg tạo mp4 tĩnh CÙNG CODEC với cảnh chính để nối bằng concat -c copy được.
// Intro: logo SDVICO + slogan. Outro: tổng đài + slogan (đọc số từng chữ số qua TTS ngoài).
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ffmpeg, probeDuration } from './ffmpeg.mjs';

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

// Logo SDVICO đã CẮT NỀN TRẮNG (canvas trong suốt) — tránh khối trắng vuông xấu trên nền xanh.
// Dùng cùng thuật toán với apps/approval-ui/lib/gen/logo-overlay.mjs.
let logoCut = null;
async function getLogo() {
  if (logoCut) return logoCut;
  const p = join(HERE, '..', '..', '..', '..', 'apps', 'approval-ui', 'lib', 'gen', 'assets', 'logo-sdvico.png');
  try {
    const img = await loadImage(readFileSync(p));
    const w = img.width, h = img.height;
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    // Cắt gần trắng thành trong suốt (logo nền trắng -> chỉ còn chữ + biểu tượng).
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r > 240 && g > 240 && b > 240) d[i + 3] = 0;
      else if (r > 220 && g > 220 && b > 220) d[i + 3] = Math.max(0, d[i + 3] - 120);
    }
    ctx.putImageData(data, 0, 0);
    logoCut = cv;
    return logoCut;
  } catch { return null; }
}

// Vẽ nền gradient xanh biển SDVICO.
function drawBackground(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1f4e79');
  g.addColorStop(1, '#0d2a45');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Font size không vượt quá chiều CAO để tránh 2 dòng chồng nhau ở khung ngang (H nhỏ hơn W).
// Dựa cả W và H, lấy min.
function fs(W, H, ratio) {
  return Math.max(14, Math.round(Math.min(W, H * 1.6) * ratio));
}

// Vẽ chữ có shadow nhẹ để dễ đọc trên nền gradient.
function drawText(ctx, text, x, y, opts = {}) {
  const { color = '#ffffff', font, shadow = true, align = 'center' } = opts;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = font;
  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}

// Vẽ intro card. Logo trên, tên + slogan giữa/dưới. Cân đối cả 2 khung.
async function drawIntro(W, H) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  drawBackground(ctx, W, H);
  const logo = await getLogo();
  const isPortrait = H > W;
  const pos = isPortrait
    ? { logoY: 0.22, logoRatio: 0.4, nameY: 0.6, sloganY: 0.72 }
    : { logoY: 0.15, logoRatio: 0.3, nameY: 0.7, sloganY: 0.85 };
  const logoSize = Math.round(Math.min(W, H) * pos.logoRatio);
  if (logo) ctx.drawImage(logo, (W - logoSize) / 2, H * pos.logoY, logoSize, logoSize);
  const base = isPortrait ? H : Math.min(W, H * 1.6);
  drawText(ctx, 'SDVICO', W / 2, H * pos.nameY, { font: `${Math.round(base * 0.09)}px BVP-Black` });
  drawText(ctx, 'Công nghệ số cho ngành biển', W / 2, H * pos.sloganY, {
    font: `${Math.round(base * 0.035)}px BVP`, color: 'rgba(255,255,255,0.9)'
  });
  return cv.toBuffer('image/png');
}

// Vẽ outro card. Bố cục cân đối cả 2 khung (ngang/dọc): logo trên - "Gọi ngay tổng đài" - SỐ TO
// - slogan dưới. Vertical căn giữa (khối chữ + logo tập trung ở giữa), Horizontal trải rộng.
async function drawOutro(W, H) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  drawBackground(ctx, W, H);
  const logo = await getLogo();
  const isPortrait = H > W;

  // Vị trí % theo chiều CAO cho 2 khung, tránh trống hoặc chồng.
  const pos = isPortrait
    ? { logoY: 0.28, headY: 0.5, phoneY: 0.6, sloganY: 0.72, logoRatio: 0.28 }
    : { logoY: 0.08, headY: 0.4, phoneY: 0.6, sloganY: 0.85, logoRatio: 0.18 };

  const logoSize = Math.round(Math.min(W, H) * pos.logoRatio);
  if (logo) ctx.drawImage(logo, (W - logoSize) / 2, H * pos.logoY, logoSize, logoSize);

  // Font base: dùng CHIỀU CAO cho dọc (chữ to hơn), MIN(W,H) cho ngang.
  const base = isPortrait ? H : Math.min(W, H * 1.6);
  const headFont = Math.round(base * (isPortrait ? 0.045 : 0.045));
  const phoneBase = Math.round(base * (isPortrait ? 0.095 : 0.09));
  const sloganFont = Math.round(base * 0.028);

  drawText(ctx, 'Gọi ngay tổng đài', W / 2, H * pos.headY, { font: `${headFont}px BVP-Black` });

  // Số tổng đài: to, vàng. Nếu tràn W thì tự giảm.
  ctx.font = `${phoneBase}px BVP-Black`;
  const phoneText = '1900 23 23 49';
  let actualFont = phoneBase;
  while (ctx.measureText(phoneText).width > W * 0.88 && actualFont > 40) {
    actualFont = Math.round(actualFont * 0.92);
    ctx.font = `${actualFont}px BVP-Black`;
  }
  drawText(ctx, phoneText, W / 2, H * pos.phoneY, { font: `${actualFont}px BVP-Black`, color: '#ffcc00' });

  drawText(ctx, 'SDVICO đồng hành cùng ngư dân', W / 2, H * pos.sloganY, {
    font: `${sloganFont}px BVP`, color: 'rgba(255,255,255,0.85)'
  });
  return cv.toBuffer('image/png');
}

// Tạo file mp4 intro/outro với EFFECT: zoom nhẹ + fade in/out. Cùng codec cảnh chính để concat.
// audioPath = null -> tiếng lặng. Fade: 0.4s vào đầu, 0.5s cuối. Zoom: 1.0 → 1.08 trong suốt clip.
async function makeBumperClip(imagePath, audioPath, durationSec, outSeg, workDir, fmt) {
  const dur = durationSec.toFixed(3);
  const fadeOutStart = Math.max(0, durationSec - 0.5).toFixed(3);
  const frames = Math.round(durationSec * 30);
  // zoompan: phóng 1.0 -> 1.08 trong 'frames' khung, viewport wxh = fmt.w x fmt.h.
  // fade: hiện lên trong 0.4s, tắt dần 0.5s cuối.
  const vf = [
    `scale=${fmt.w * 2}:${fmt.h * 2}:force_original_aspect_ratio=decrease`,
    `pad=${fmt.w * 2}:${fmt.h * 2}:(ow-iw)/2:(oh-ih)/2:0x0d2a45`,
    `zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${fmt.w}x${fmt.h}:fps=30`,
    `fade=t=in:st=0:d=0.4`,
    `fade=t=out:st=${fadeOutStart}:d=0.5`,
    `format=yuv420p`
  ].join(',');
  // Audio fade: hiện 0.2s, tắt 0.4s cuối.
  const af = `afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeOutStart}:d=0.4`;

  const args = ['-y', '-loop', '1', '-framerate', '30', '-i', imagePath];
  if (audioPath) args.push('-i', audioPath);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  args.push(
    '-t', dur,
    '-vf', vf,
    '-af', af,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-r', '30', '-video_track_timescale', '30000',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    outSeg,
  );
  await ffmpeg(args, { cwd: workDir });
  return outSeg;
}

// Tạo intro và outro cho một FORMAT. Trả về {introSeg, outroSeg} là tên file trong workDir để
// concat cùng các cảnh chính. outroAudioPath: mp3 TTS đọc tổng đài (đã sinh sẵn), có thể null.
// Thời lượng outro = MAX(minDur, audio_duration + 1s buffer) để không cắt tiếng giữa chừng.
export async function buildBumpers({ workDir, fmt, outroAudioPath = null, introDurSec = 2.5, outroDurSec = 4 }) {
  registerFontsFromWorkdir(workDir);
  const introPng = join(workDir, 'intro.png');
  const outroPng = join(workDir, 'outro.png');
  await writeFile(introPng, await drawIntro(fmt.w, fmt.h));
  await writeFile(outroPng, await drawOutro(fmt.w, fmt.h));
  const introSeg = 'intro.mp4';
  const outroSeg = 'outro.mp4';
  // Đo thời lượng audio outro để đảm bảo video đủ dài (đọc "1900 23 23 49" từng số mất ~6-7s,
  // outro 4s cố định trước đây bị cắt tiếng giữa chừng).
  let outroActualDur = outroDurSec;
  if (outroAudioPath) {
    try {
      const audioDur = await probeDuration(outroAudioPath);
      outroActualDur = Math.max(outroDurSec, audioDur + 1);
    } catch { /* thiếu audio -> giữ default */ }
  }
  await makeBumperClip(introPng, null, introDurSec, introSeg, workDir, fmt);
  await makeBumperClip(outroPng, outroAudioPath, outroActualDur, outroSeg, workDir, fmt);
  return { introSeg, outroSeg };
}
