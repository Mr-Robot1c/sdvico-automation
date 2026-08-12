// banner.mjs — ghép ảnh bài đăng kiểu Facebook: nền (Unsplash hoặc gradient thương hiệu)
// + ảnh sản phẩm thật trong thẻ trắng + tiêu đề tiếng Việt + hotline. Chạy phía máy chủ.
// Sản phẩm GIỮ NGUYÊN, không vẽ lại (điều cấm 5). Font nhúng base64 để chắc chắn có trên Vercel.

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

// Vẽ ảnh phủ kín khung (cover), cắt phần thừa.
function drawCover(ctx, img, x, y, w, h) {
  const sc = Math.max(w / img.width, h / img.height);
  const dw = img.width * sc;
  const dh = img.height * sc;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Vẽ ảnh vừa khung (contain), giữ nguyên tỉ lệ, chừa nền.
function drawContain(ctx, img, x, y, w, h) {
  const sc = Math.min(w / img.width, h / img.height);
  const dw = img.width * sc;
  const dh = img.height * sc;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Trả về PNG Buffer 1080x1350.
export async function buildBanner({ productBuffer, backgroundBuffer = null, title = '', hotline = TONGDAI }) {
  ensureFonts();
  const W = 1080;
  const H = 1350;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'top';

  // Nền: ảnh Unsplash phủ kín + lớp phủ tối để chữ nổi; hoặc gradient thương hiệu nếu không có.
  if (backgroundBuffer) {
    const bg = await loadImage(backgroundBuffer);
    drawCover(ctx, bg, 0, 0, W, H);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(10,20,35,0.55)');
    shade.addColorStop(0.45, 'rgba(10,20,35,0.30)');
    shade.addColorStop(1, 'rgba(8,16,28,0.88)');
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
  ctx.fillStyle = '#ffffff';
  ctx.font = '46px BVP-Black';
  ctx.fillText('SDVICO', 60, 54);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '24px BVP';
  ctx.fillText('Nghề cá thịnh vượng', 62, 112);

  // Thẻ trắng chứa ảnh sản phẩm (giữ nguyên sản phẩm, contain trên nền tối).
  const prod = await loadImage(productBuffer);
  const cardX = 60;
  const cardY = 180;
  const cardW = W - 120;
  const cardH = 760;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 28);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cardX + 16, cardY + 16, cardW - 32, cardH - 32, 18);
  ctx.clip();
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(cardX + 16, cardY + 16, cardW - 32, cardH - 32);
  drawContain(ctx, prod, cardX + 16, cardY + 16, cardW - 32, cardH - 32);
  ctx.restore();

  // Tiêu đề tiếng Việt, bọc dòng, tối đa 3 dòng.
  ctx.fillStyle = '#ffffff';
  ctx.font = '58px BVP-Black';
  const lines = wrap(ctx, title, W - 120).slice(0, 3);
  let ty = 992;
  for (const ln of lines) {
    ctx.fillText(ln, 60, ty);
    ty += 70;
  }

  // Pill hotline.
  const pillY = ty + 20;
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
