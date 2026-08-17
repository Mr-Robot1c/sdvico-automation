// Tạo INTRO (2.5s) và OUTRO (đủ dài đọc hết TTS) cho video SDVICO.
// KHÁC bản cũ: render SEQUENCE frames PNG (30fps) - mỗi frame khác nhau để có animation THẬT:
// logo scale-in, text slide-up, số điện thoại pulse. ffmpeg concat sequence -> mp4.
// Cùng codec cảnh chính (H.264 yuv420p 30fps AAC 44100 stereo) để concat -c copy.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ffmpeg, probeDuration } from './ffmpeg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS = 30;

let fontsReady = false;
function registerFontsFromWorkdir(workDir) {
  if (fontsReady) return;
  try {
    GlobalFonts.registerFromPath(join(workDir, 'BeVietnamPro-Black.ttf'), 'BVP-Black');
    GlobalFonts.registerFromPath(join(workDir, 'BeVietnamPro-Regular.ttf'), 'BVP');
    fontsReady = true;
  } catch { /* font thiếu -> canvas dùng font mặc định */ }
}

// Logo cắt nền trắng (nếu file PNG đã trong suốt sẵn thì thuật toán vẫn chạy - vô hại).
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

// Nền gradient động: dịch chuyển theo t để có cảm giác biển động nhẹ.
function drawBackground(ctx, W, H, t = 0) {
  const shift = Math.sin(t * 0.5) * 0.05;
  const g = ctx.createLinearGradient(0, -H * shift, 0, H + H * shift);
  g.addColorStop(0, '#1f4e79');
  g.addColorStop(0.5, '#164066');
  g.addColorStop(1, '#0d2a45');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Vài chấm sáng "sóng" trang trí (không quá rối).
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 6; i++) {
    const x = ((i * 137 + t * 30) % W);
    const y = H * 0.3 + Math.sin(t * 1.5 + i) * H * 0.05;
    ctx.beginPath();
    ctx.arc(x, y, 20 + i * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Easing: hàm easeOutCubic cho animation vào mềm mại.
const easeOut = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function drawText(ctx, text, x, y, opts = {}) {
  const { color = '#ffffff', font, align = 'center', alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Vẽ 1 frame INTRO tại thời điểm t (0..dur).
// Timeline: 0-0.8s logo scale-in fade-in; 0.6-1.4s "SDVICO" slide up fade; 1.2-2.0s slogan fade.
async function drawIntroFrame(W, H, t, dur) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  drawBackground(ctx, W, H, t);
  const logo = await getLogo();
  const isPortrait = H > W;
  const pos = isPortrait
    ? { logoY: 0.22, logoRatio: 0.4, nameY: 0.6, sloganY: 0.72 }
    : { logoY: 0.15, logoRatio: 0.3, nameY: 0.7, sloganY: 0.85 };
  const base = isPortrait ? H : Math.min(W, H * 1.6);

  // Logo: scale 0.6 → 1 + fade 0 → 1 trong 0-0.8s.
  if (logo) {
    const p = easeOut(t / 0.8);
    const scale = 0.6 + 0.4 * p;
    const alpha = p;
    const size = Math.round(Math.min(W, H) * pos.logoRatio * scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(logo, (W - size) / 2, H * pos.logoY + (Math.min(W, H) * pos.logoRatio - size) / 2, size, size);
    ctx.restore();
  }

  // "SDVICO": slide up 60px + fade in 0.6-1.4s.
  const nameT = easeOut((t - 0.6) / 0.8);
  if (nameT > 0) {
    const offset = 60 * (1 - nameT);
    drawText(ctx, 'SDVICO', W / 2, H * pos.nameY + offset, {
      font: `${Math.round(base * 0.09)}px BVP-Black`, alpha: Math.min(1, nameT)
    });
  }

  // Slogan fade 1.2-2.0s.
  const sloganT = easeOut((t - 1.2) / 0.8);
  if (sloganT > 0) {
    drawText(ctx, 'Công nghệ số cho ngành biển', W / 2, H * pos.sloganY, {
      font: `${Math.round(base * 0.035)}px BVP`, color: 'rgba(255,255,255,0.9)', alpha: Math.min(1, sloganT)
    });
  }

  // Fade out toàn cảnh 0.4s cuối.
  const fadeOut = Math.max(0, (dur - t) / 0.4);
  if (fadeOut < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - fadeOut})`;
    ctx.fillRect(0, 0, W, H);
  }
  return cv.toBuffer('image/png');
}

// Vẽ 1 frame OUTRO tại t. Timeline: 0-0.7s logo pop + fade; 0.6-1.4s "Gọi ngay tổng đài" slide;
// 1.3-2.0s số điện thoại scale-in + PULSE nhẹ liên tục; 1.8-2.5s slogan fade.
async function drawOutroFrame(W, H, t, dur) {
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  drawBackground(ctx, W, H, t);
  const logo = await getLogo();
  const isPortrait = H > W;
  const pos = isPortrait
    ? { logoY: 0.28, headY: 0.5, phoneY: 0.6, sloganY: 0.72, logoRatio: 0.28 }
    : { logoY: 0.08, headY: 0.4, phoneY: 0.6, sloganY: 0.85, logoRatio: 0.18 };
  const base = isPortrait ? H : Math.min(W, H * 1.6);

  // Logo pop-in.
  if (logo) {
    const p = easeOut(t / 0.7);
    const scale = 0.5 + 0.5 * p;
    const alpha = p;
    const size = Math.round(Math.min(W, H) * pos.logoRatio * scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(logo, (W - size) / 2, H * pos.logoY + (Math.min(W, H) * pos.logoRatio - size) / 2, size, size);
    ctx.restore();
  }

  // "Gọi ngay tổng đài": slide từ trái vào + fade 0.6-1.4s.
  const headT = easeOut((t - 0.6) / 0.8);
  if (headT > 0) {
    const offset = -120 * (1 - headT);
    drawText(ctx, 'Gọi ngay tổng đài', W / 2 + offset, H * pos.headY, {
      font: `${Math.round(base * 0.045)}px BVP-Black`, alpha: Math.min(1, headT)
    });
  }

  // Số điện thoại: scale-in + PULSE liên tục sau đó (nhấp nhẹ 1.0-1.05).
  const phoneInT = easeOut((t - 1.3) / 0.7);
  if (phoneInT > 0) {
    const scaleIn = 0.7 + 0.3 * Math.min(1, phoneInT);
    const pulseT = Math.max(0, t - 2.0);
    const pulse = 1 + 0.04 * Math.sin(pulseT * 3.5); // biên độ 4%, tần số ~0.56Hz
    const finalScale = scaleIn * pulse;

    const phoneBase = Math.round(base * (isPortrait ? 0.095 : 0.09));
    const phoneText = '1900 23 23 49';
    // Tính font tối đa fit W*0.88
    let f = phoneBase;
    ctx.font = `${f}px BVP-Black`;
    while (ctx.measureText(phoneText).width > W * 0.88 && f > 40) {
      f = Math.round(f * 0.92);
      ctx.font = `${f}px BVP-Black`;
    }
    ctx.save();
    ctx.translate(W / 2, H * pos.phoneY);
    ctx.scale(finalScale, finalScale);
    ctx.globalAlpha = Math.min(1, phoneInT);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${f}px BVP-Black`;
    ctx.shadowColor = 'rgba(255,204,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffcc00';
    ctx.fillText(phoneText, 0, 0);
    ctx.restore();
  }

  // Slogan fade in 1.8-2.5s.
  const sloganT = easeOut((t - 1.8) / 0.7);
  if (sloganT > 0) {
    drawText(ctx, 'SDVICO đồng hành cùng ngư dân', W / 2, H * pos.sloganY, {
      font: `${Math.round(base * 0.028)}px BVP`, color: 'rgba(255,255,255,0.9)', alpha: Math.min(1, sloganT)
    });
  }

  // Fade out 0.5s cuối.
  const fadeOut = Math.max(0, (dur - t) / 0.5);
  if (fadeOut < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - fadeOut})`;
    ctx.fillRect(0, 0, W, H);
  }
  return cv.toBuffer('image/png');
}

// Render toàn bộ frames + gọi ffmpeg concat → mp4. framesDir: thư mục con chứa PNG sequence.
async function renderBumperMp4(drawFrame, framesDir, W, H, dur, audioPath, outSeg, workDir) {
  await mkdir(framesDir, { recursive: true });
  const totalFrames = Math.round(dur * FPS);
  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    const buf = await drawFrame(W, H, t, dur);
    await writeFile(join(framesDir, `f${String(i).padStart(4, '0')}.png`), buf);
  }
  const inputPattern = join(framesDir, 'f%04d.png');
  const args = ['-y', '-framerate', String(FPS), '-i', inputPattern];
  if (audioPath) args.push('-i', audioPath);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  args.push(
    '-t', dur.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-video_track_timescale', String(FPS * 1000),
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    outSeg,
  );
  await ffmpeg(args, { cwd: workDir });
  return outSeg;
}

// Tạo intro và outro cho một FORMAT. Trả về {introSeg, outroSeg} là tên file mp4 trong workDir để
// concat cùng cảnh chính. outroAudioPath: mp3 TTS đọc tổng đài (đã sinh sẵn), có thể null.
export async function buildBumpers({ workDir, fmt, outroAudioPath = null, introDurSec = 2.8, outroDurSec = 4 }) {
  registerFontsFromWorkdir(workDir);
  // Outro dài đủ đọc hết TTS (đọc "1900 23 23 49" từng số ~6s).
  let outroActualDur = outroDurSec;
  if (outroAudioPath) {
    try {
      const audioDur = await probeDuration(outroAudioPath);
      outroActualDur = Math.max(outroDurSec, audioDur + 1.2);
    } catch { /* thiếu audio -> giữ default */ }
  }
  const introFramesDir = join(workDir, '_intro_frames');
  const outroFramesDir = join(workDir, '_outro_frames');
  await renderBumperMp4(drawIntroFrame, introFramesDir, fmt.w, fmt.h, introDurSec, null, 'intro.mp4', workDir);
  await renderBumperMp4(drawOutroFrame, outroFramesDir, fmt.w, fmt.h, outroActualDur, outroAudioPath, 'outro.mp4', workDir);
  return { introSeg: 'intro.mp4', outroSeg: 'outro.mp4' };
}
