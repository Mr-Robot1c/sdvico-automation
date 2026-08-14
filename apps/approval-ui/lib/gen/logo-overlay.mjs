// Ghép logo SDVICO vào góc dưới phải một ảnh. Dùng @napi-rs/canvas (đã chạy ổn trên Vercel,
// giống banner.mjs) và logo NHÚNG base64 (logo-data.mjs) — KHÔNG dùng sharp, KHÔNG đọc file lúc
// chạy, để tránh vỡ trên serverless. Logo nền trắng thì tự cắt gần trắng thành trong suốt.
// Cỡ vừa (~14% chiều rộng ảnh), có padding.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { LOGO_B64 } from './logo-data.mjs';

// Cache logo đã cắt nền (canvas trong suốt) trong vòng đời tiến trình.
let cachedCutout = null;
async function getLogoCutout() {
  if (cachedCutout) return cachedCutout;
  const img = await loadImage(Buffer.from(LOGO_B64, 'base64'));
  const w = img.width, h = img.height;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  // Cắt gần trắng thành trong suốt để logo nằm gọn trên ảnh, không còn khung trắng.
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 240 && g > 240 && b > 240) d[i + 3] = 0;
    else if (r > 220 && g > 220 && b > 220) d[i + 3] = Math.max(0, d[i + 3] - 120);
  }
  ctx.putImageData(data, 0, 0);
  cachedCutout = { canvas: cv, w, h };
  return cachedCutout;
}

// Ghép logo vào ảnh; trả buffer JPEG (mặc định) hoặc PNG.
// opts.position: 'br' (mặc định, góc dưới phải), 'bl', 'tr', 'tl'.
// opts.scale: tỉ lệ chiều rộng logo so với ảnh (mặc định 0.14).
// opts.padding: khoảng cách mép (mặc định 3% chiều nhỏ hơn).
export async function overlayLogo(input, opts = {}) {
  const { position = 'br', scale = 0.14, padding: padRatio = 0.03, format = 'jpeg' } = opts;
  const base = await loadImage(input);
  const W = base.width || 0, H = base.height || 0;
  if (!W || !H) throw new Error('Khong doc duoc anh nen');

  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(base, 0, 0, W, H);

  const logo = await getLogoCutout();
  const lw = Math.max(64, Math.round(W * scale));
  const lh = Math.round(logo.h * (lw / logo.w));
  const pad = Math.round(Math.min(W, H) * padRatio);
  let left = W - lw - pad;
  let top = H - lh - pad;
  if (position === 'bl') { left = pad; top = H - lh - pad; }
  if (position === 'tr') { left = W - lw - pad; top = pad; }
  if (position === 'tl') { left = pad; top = pad; }

  ctx.drawImage(logo.canvas, left, top, lw, lh);

  if (format === 'png') return cv.toBuffer('image/png');
  return cv.toBuffer('image/jpeg', 92);
}
