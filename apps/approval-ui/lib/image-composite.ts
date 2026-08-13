// Ghép logo công ty vào góc ảnh nền. Chạy server-side bằng sharp.
// Tự động xóa nền trắng/gần trắng của logo trước khi ghép.
// Thất bại (mạng, định dạng lạ) thì ném lỗi — bên gọi tự quyết định fallback.

import sharp from 'sharp';

export type LogoGravity = 'southeast' | 'southwest' | 'northeast' | 'northwest';

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Pixel nào có R,G,B đều >= threshold thì đổi alpha = 0 (trong suốt).
// Loại bỏ nền trắng/gần trắng của logo JPG hoặc PNG không có alpha.
async function removeWhiteBackground(buf: Buffer, threshold = 240): Promise<Buffer> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] >= threshold && pixels[i + 1] >= threshold && pixels[i + 2] >= threshold) {
      pixels[i + 3] = 0;
    }
  }

  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function overlayLogo(
  backgroundUrl: string,
  logoUrl: string,
  gravity: LogoGravity = 'southeast',
  logoScale = 0.18
): Promise<Buffer> {
  const [bgBuf, logoBuf] = await Promise.all([
    fetchBuffer(backgroundUrl),
    fetchBuffer(logoUrl),
  ]);

  const bg = sharp(bgBuf);
  const { width: bgW = 1080, height: bgH = 720 } = await bg.metadata();

  const logoW = Math.min(Math.max(Math.round(bgW * logoScale), 80), 240);

  const logoNoBg = await removeWhiteBackground(logoBuf);
  const logoResized = await sharp(logoNoBg)
    .resize(logoW, null, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const { width: lW = logoW, height: lH = 60 } = await sharp(logoResized).metadata();

  const pad = 8;
  const positions: Record<LogoGravity, { left: number; top: number }> = {
    southeast: { left: bgW - lW - pad, top: bgH - lH - pad },
    southwest: { left: pad,            top: bgH - lH - pad },
    northeast: { left: bgW - lW - pad, top: pad             },
    northwest: { left: pad,            top: pad             },
  };

  const { left, top } = positions[gravity];

  return bg
    .composite([{ input: logoResized, left: Math.max(0, left), top: Math.max(0, top), blend: 'over' }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
