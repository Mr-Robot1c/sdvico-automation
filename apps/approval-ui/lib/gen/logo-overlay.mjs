// Ghép logo SDVICO vào góc dưới phải một ảnh. Nếu logo nền trắng thì tự cắt nền
// (threshold trắng ~245+) trước khi phủ. Cỡ vừa (~14% chiều rộng ảnh), có padding.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(HERE, 'assets', 'logo-sdvico.jpg');

let cachedLogo = null;
async function getLogoPng() {
  if (cachedLogo) return cachedLogo;
  const raw = readFileSync(LOGO_PATH);
  const img = sharp(raw).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const { width, height, channels } = info;
  // Cắt gần trắng thành trong suốt.
  for (let i = 0; i < out.length; i += channels) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    if (r > 240 && g > 240 && b > 240) out[i + 3] = 0;
    else if (r > 220 && g > 220 && b > 220) out[i + 3] = Math.max(0, out[i + 3] - 120);
  }
  cachedLogo = await sharp(out, { raw: { width, height, channels } }).png().toBuffer();
  return cachedLogo;
}

// Ghép logo vào ảnh; trả buffer PNG/JPEG cùng loại đầu vào.
// opts.position: 'br' (mặc định, góc dưới phải), 'bl', 'tr', 'tl'.
// opts.scale: tỉ lệ chiều rộng logo so với ảnh (mặc định 0.14).
// opts.padding: khoảng cách mép (mặc định 3% chiều nhỏ hơn).
export async function overlayLogo(input, opts = {}) {
  const { position = 'br', scale = 0.14, padding: padRatio = 0.03, format = 'jpeg' } = opts;
  const base = sharp(input);
  const meta = await base.metadata();
  const W = meta.width || 0, H = meta.height || 0;
  if (!W || !H) throw new Error('Khong doc duoc anh nen');

  const logoRaw = await getLogoPng();
  const targetW = Math.max(64, Math.round(W * scale));
  const logoResized = await sharp(logoRaw).resize({ width: targetW }).toBuffer();
  const logoMeta = await sharp(logoResized).metadata();
  const lw = logoMeta.width || targetW;
  const lh = logoMeta.height || targetW;

  const pad = Math.round(Math.min(W, H) * padRatio);
  let left = W - lw - pad;
  let top = H - lh - pad;
  if (position === 'bl') { left = pad; top = H - lh - pad; }
  if (position === 'tr') { left = W - lw - pad; top = pad; }
  if (position === 'tl') { left = pad; top = pad; }

  const out = base.composite([{ input: logoResized, left, top }]);
  if (format === 'png') return out.png().toBuffer();
  return out.jpeg({ quality: 92 }).toBuffer();
}
