// Trích font Be Vietnam Pro (base64 trong apps/approval-ui) ra file .ttf cho libass.
// Dùng chung font với banner ảnh để nhất quán thương hiệu.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FONT_REGULAR_B64, FONT_BLACK_B64 } from '../../../../apps/approval-ui/lib/gen/fonts-data.mjs';

export const FONT_REGULAR = 'Be Vietnam Pro';
export const FONT_BLACK = 'Be Vietnam Pro Black';

// Ghi 2 file ttf vào fontsDir (nếu chưa có). Trả về fontsDir để truyền cho libass.
export async function ensureFonts(fontsDir) {
  await mkdir(fontsDir, { recursive: true });
  const reg = join(fontsDir, 'BeVietnamPro-Regular.ttf');
  const blk = join(fontsDir, 'BeVietnamPro-Black.ttf');
  if (!existsSync(reg)) await writeFile(reg, Buffer.from(FONT_REGULAR_B64, 'base64'));
  if (!existsSync(blk)) await writeFile(blk, Buffer.from(FONT_BLACK_B64, 'base64'));
  return fontsDir;
}
