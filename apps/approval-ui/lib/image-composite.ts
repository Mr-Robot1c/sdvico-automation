// Ghép logo công ty vào góc ảnh nền. Chạy server-side bằng sharp.
// Logo PNG có nền trong suốt sẽ ghép đúng. Logo JPG/PNG nền trắng cũng ổn.
// Thất bại (mạng, định dạng lạ) thì ném lỗi — bên gọi tự quyết định fallback.

import sharp from 'sharp';

export type LogoGravity = 'southeast' | 'southwest' | 'northeast' | 'northwest';

// Tải buffer từ URL. Throw nếu HTTP lỗi.
async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Ghép logo vào góc ảnh nền.
// gravity: vị trí logo — mặc định góc dưới phải (southeast).
// logoScale: logo chiếm bao nhiêu % chiều rộng ảnh nền (mặc định 18%).
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

  // Tính kích thước logo: tối thiểu 80px, tối đa 240px.
  const logoW = Math.min(Math.max(Math.round(bgW * logoScale), 80), 240);

  // Resize logo giữ tỷ lệ, chuyển sang PNG để giữ kênh alpha.
  const logoResized = await sharp(logoBuf)
    .resize(logoW, null, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const { width: lW = logoW, height: lH = 60 } = await sharp(logoResized).metadata();

  const pad = 20; // khoảng cách cạnh ảnh
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
