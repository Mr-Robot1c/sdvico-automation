// banner.mjs — ghép ảnh bài đăng: nền (Unsplash) + ảnh sản phẩm ĐÃ CẮT NỀN (remove.bg) đặt
// lên trên có bóng đổ, thêm thương hiệu và hotline. Sản phẩm cắt rời nên nằm trong cảnh, không
// còn khung trắng "trồng chất lên". Sản phẩm giữ nguyên, không vẽ lại (điều cấm 5).

import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { FONT_REGULAR_B64, FONT_BLACK_B64 } from './fonts-data.mjs';

const TONGDAI = '1900 23 23 49';
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  GlobalFonts.register(Buffer.from(FONT_BLACK_B64, 'base64'), 'BVP-Black');
  GlobalFonts.register(Buffer.from(FONT_REGULAR_B64, 'base64'), 'BVP');
  fontsReady = true;
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCover(ctx, img, x, y, w, h) {
  const sc = Math.max(w / img.width, h / img.height);
  const dw = img.width * sc;
  const dh = img.height * sc;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Ghép: cutoutBuffer = ảnh sản phẩm đã cắt nền (PNG trong suốt). backgroundBuffer = ảnh nền.
// Trả PNG Buffer 1080x1350.
export async function buildBanner({ cutoutBuffer, backgroundBuffer = null, title = '', hotline = TONGDAI }) {
  ensureFonts();
  const W = 1080;
  const H = 1350;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');

  // Nền phủ kín + lớp phủ tối nhẹ để sản phẩm và chữ nổi lên.
  if (backgroundBuffer) {
    const bg = await loadImage(backgroundBuffer);
    drawCover(ctx, bg, 0, 0, W, H);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(10,20,35,0.42)');
    shade.addColorStop(0.5, 'rgba(10,20,35,0.20)');
    shade.addColorStop(1, 'rgba(8,16,28,0.82)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1f4e79');
    g.addColorStop(1, '#0d2a45');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Thương hiệu góc trên.
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = '46px BVP-Black';
  ctx.fillText('SDVICO', 60, 54);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '24px BVP';
  ctx.fillText('Nghề cá thịnh vượng', 62, 112);

  // Sản phẩm cắt nền: đặt giữa, to, có bóng đổ mềm để trông như đứng trong cảnh.
  const cut = await loadImage(cutoutBuffer);
  const boxW = W - 160;
  const boxH = 720;
  const boxX = 80;
  const boxY = 250;
  const sc = Math.min(boxW / cut.width, boxH / cut.height);
  const dw = cut.width * sc;
  const dh = cut.height * sc;
  const dx = boxX + (boxW - dw) / 2;
  const dy = boxY + (boxH - dh) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 24;
  ctx.drawImage(cut, dx, dy, dw, dh);
  ctx.restore();

  // Tiêu đề tiếng Việt, tối đa 3 dòng.
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = '58px BVP-Black';
  const lines = wrap(ctx, title, W - 120).slice(0, 3);
  let ty = 1010;
  for (const ln of lines) {
    ctx.fillText(ln, 60, ty);
    ty += 70;
  }

  // Pill hotline.
  const pillY = ty + 18;
  const pillH = 78;
  ctx.font = '40px BVP-Black';
  const pillText = 'Gọi ngay ' + hotline;
  const pillW = Math.min(W - 120, ctx.measureText(pillText).width + 72);
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.roundRect(60, pillY, pillW, pillH, 39);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, 96, pillY + pillH / 2 + 2);

  return cv.toBuffer('image/png');
}
