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

// Logo: GIỮ NGUYÊN file gốc (không cắt nền). Sếp góp ý 18/8 "logo bị mờ": nguyên nhân là
// thuật toán cắt nền trắng ăn luôn viền sáng của chữ SDVICO + mép quả cầu xám -> răng cưa,
// nhòe; cộng thêm phóng file 350px lên quá 1x. Cách sửa: vẽ logo trên ĐĨA TRÒN TRẮNG (đúng
// nền thiết kế gốc, viền không mất), kích thước không vượt 1x pixel gốc, có bóng đổ nhẹ.
let logoImg = null;
async function getLogo() {
  if (logoImg) return logoImg;
  const p = join(HERE, '..', '..', '..', '..', 'apps', 'approval-ui', 'lib', 'gen', 'assets', 'logo-sdvico.png');
  try { logoImg = await loadImage(readFileSync(p)); return logoImg; } catch { return null; }
}

// Vẽ logo trong đĩa trắng bo tròn tại tâm (cx, cy), đường kính diskSize, alpha 0..1.
// Logo chiếm ~72% đĩa, KHÔNG phóng quá 1x kích thước gốc (giữ nét).
function drawLogoDisk(ctx, logo, cx, cy, diskSize, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // Bóng đổ nhẹ cho đĩa nổi trên nền navy.
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.round(diskSize * 0.12);
  ctx.shadowOffsetY = Math.round(diskSize * 0.04);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, diskSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (logo) {
    const maxNative = Math.min(logo.width, logo.height);
    const inner = Math.min(Math.round(diskSize * 0.72), maxNative);
    // Vẽ mượt khi thu nhỏ.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo, cx - inner / 2, cy - inner / 2, inner, inner);
  }
  ctx.restore();
}

// Nền: navy sạch + vệt sáng tỏa từ phía trên (spotlight) + dải sóng mờ dưới đáy. Bỏ mấy chấm
// tròn (sếp: "màu hơi kì"). Chuyển động rất nhẹ theo t để không tĩnh chết.
const BRAND_NAVY = '#0b2a4a';
const BRAND_NAVY_DEEP = '#061a30';
const BRAND_BLUE = '#1f5fbf';
const BRAND_RED = '#e23b2e';
function drawBackground(ctx, W, H, t = 0) {
  // Nền phẳng navy đậm dần xuống dưới.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, BRAND_NAVY);
  g.addColorStop(1, BRAND_NAVY_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Spotlight xanh thương hiệu tỏa từ trên xuống, hơi lắc theo t.
  const sx = W / 2 + Math.sin(t * 0.6) * W * 0.03;
  const rg = ctx.createRadialGradient(sx, H * 0.18, 0, sx, H * 0.18, Math.max(W, H) * 0.7);
  rg.addColorStop(0, 'rgba(31,95,191,0.55)');
  rg.addColorStop(0.5, 'rgba(31,95,191,0.18)');
  rg.addColorStop(1, 'rgba(31,95,191,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  // Dải sóng mờ dưới đáy (2 lớp), gợi biển mà không rối.
  const waveBase = H * 0.86;
  for (let layer = 0; layer < 2; layer++) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    const amp = H * (0.018 + layer * 0.01);
    const freq = 2.2 + layer * 0.8;
    const phase = t * (0.9 + layer * 0.4) + layer * 1.3;
    for (let x = 0; x <= W; x += 12) {
      const y = waveBase + layer * H * 0.03 + Math.sin((x / W) * Math.PI * freq + phase) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = layer === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.035)';
    ctx.fill();
  }
}

// Easing: hàm easeOutCubic cho animation vào mềm mại.
const easeOut = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Thu cỡ chữ tới khi vừa maxWidth (user 21/8: bản dọc 1080x1920 bị che chữ — slogan tính
// font theo base=H=1920 nhưng khung chỉ rộng 1080 nên tràn 2 mép). Cùng cách với số tổng đài.
function fitFontPx(ctx, text, px, family, maxWidth) {
  let f = px;
  ctx.font = `${f}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && f > 24) {
    f = Math.round(f * 0.94);
    ctx.font = `${f}px ${family}`;
  }
  return f;
}

function drawText(ctx, text, x, y, opts = {}) {
  const { color = '#ffffff', font, align = 'center', alpha = 1, maxWidth = 0 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = font;
  // maxWidth > 0: tự thu font cho vừa (giữ nguyên family trong chuỗi font "NNpx Family").
  if (maxWidth > 0) {
    const m = String(font).match(/^(\d+)px\s+(.+)$/);
    if (m) ctx.font = `${fitFontPx(ctx, text, Number(m[1]), m[2], maxWidth)}px ${m[2]}`;
  }
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

  // Logo trên đĩa trắng: scale 0.6 → 1 + fade 0 → 1 trong 0-0.8s.
  {
    const p = easeOut(t / 0.8);
    const scale = 0.6 + 0.4 * p;
    const disk = Math.round(Math.min(W, H) * pos.logoRatio * scale);
    const cy = H * pos.logoY + Math.min(W, H) * pos.logoRatio / 2;
    drawLogoDisk(ctx, logo, W / 2, cy, disk, p);
  }

  // "SDVICO": slide up 60px + fade in 0.6-1.4s. Chữ trắng, gạch nhấn 2 màu thương hiệu bên dưới.
  const nameT = easeOut((t - 0.6) / 0.8);
  if (nameT > 0) {
    const offset = 60 * (1 - nameT);
    const fontPx = Math.round(base * 0.09);
    drawText(ctx, 'SDVICO', W / 2, H * pos.nameY + offset, {
      font: `${fontPx}px BVP-Black`, alpha: Math.min(1, nameT)
    });
    // Gạch nhấn xanh + đỏ dưới tên (mở rộng dần theo nameT).
    const barW = Math.round(fontPx * 2.4 * Math.min(1, nameT));
    const barH = Math.max(4, Math.round(fontPx * 0.07));
    const by = H * pos.nameY + offset + fontPx * 0.62;
    ctx.save();
    ctx.globalAlpha = Math.min(1, nameT);
    ctx.fillStyle = BRAND_BLUE;
    ctx.fillRect(W / 2 - barW / 2, by, Math.round(barW * 0.62), barH);
    ctx.fillStyle = BRAND_RED;
    ctx.fillRect(W / 2 - barW / 2 + Math.round(barW * 0.62), by, barW - Math.round(barW * 0.62), barH);
    ctx.restore();
  }

  // Slogan fade 1.2-2.0s.
  const sloganT = easeOut((t - 1.2) / 0.8);
  if (sloganT > 0) {
    drawText(ctx, 'Công nghệ số cho ngành biển và thủy sản', W / 2, H * pos.sloganY, {
      font: `${Math.round(base * 0.032)}px BVP`, color: 'rgba(255,255,255,0.92)', alpha: Math.min(1, sloganT),
      maxWidth: W * 0.92
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
  // Logo trên đĩa trắng: pop 0.5 → 1 + fade trong 0-0.7s.
  {
    const p = easeOut(t / 0.7);
    const scale = 0.5 + 0.5 * p;
    const disk = Math.round(Math.min(W, H) * pos.logoRatio * scale);
    const cy = H * pos.logoY + Math.min(W, H) * pos.logoRatio / 2;
    drawLogoDisk(ctx, logo, W / 2, cy, disk, p);
  }

  // "Gọi ngay tổng đài": slide từ trái vào + fade 0.6-1.4s.
  const headT = easeOut((t - 0.6) / 0.8);
  if (headT > 0) {
    const offset = -120 * (1 - headT);
    drawText(ctx, 'Gọi ngay tổng đài', W / 2 + offset, H * pos.headY, {
      font: `${Math.round(base * 0.045)}px BVP-Black`, alpha: Math.min(1, headT),
      maxWidth: W * 0.92
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
      font: `${Math.round(base * 0.028)}px BVP`, color: 'rgba(255,255,255,0.9)', alpha: Math.min(1, sloganT),
      maxWidth: W * 0.92
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
// Xem trước 1 frame (dùng cho scripts/preview-bumpers.mjs) — không ảnh hưởng pipeline.
export async function previewFrame(kind, W, H, t, dur) {
  return kind === 'outro' ? drawOutroFrame(W, H, t, dur) : drawIntroFrame(W, H, t, dur);
}

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
