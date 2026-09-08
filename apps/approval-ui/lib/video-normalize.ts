import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// Đường dẫn binary ffmpeg. 8/9: KHÔNG import tĩnh @ffmpeg-installer nữa — import tĩnh làm Next
// trace binary linux (~68 MB) vào mọi function trên Vercel, đẩy Functions Storage vượt 10 GB
// (mỗi bản deploy ~37 MB). Thứ tự tìm:
//   1. env FFMPEG_PATH (nếu sau này muốn có ffmpeg trên Vercel: tải binary lúc chạy rồi đặt env).
//   2. @ffmpeg-installer/ffmpeg qua require THẬT của Node lấy bằng eval('require') — webpack không
//      bundle, nft không trace (next.config còn outputFileTracingExcludes chặn thêm). Máy local
//      (dev/test) vẫn tìm thấy binary win32 ở node_modules gốc monorepo (packages/marketing giữ gói).
//      KHÔNG dùng createRequire(node:module): webpack thay bằng undefined trong bundle server.
//   3. Không có -> normalizeVideo ném lỗi, caller (lib/tiktok.ts) dùng file gốc, KHÔNG chặn đăng.
//      Đường đăng TikTok qua API đã bỏ từ 26/8 (xuất tay) nên trên Vercel chấp nhận không có ffmpeg.
function resolveFfmpeg(): string | undefined {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv) return fromEnv;
  try {
    // eslint-disable-next-line no-eval
    const nodeRequire = eval('require') as NodeRequire;
    const installer = nodeRequire('@ffmpeg-installer/ffmpeg');
    return (installer as any)?.path || (installer as any)?.default?.path;
  } catch {
    return undefined;
  }
}
const FFMPEG: string | undefined = resolveFfmpeg();

// Chuẩn hóa video cho TikTok: re-encode để NƯỚNG chiều xoay (ffmpeg autorotate mặc định bật) +
// H.264 + AAC + faststart. Sửa lỗi video quay 90 độ khi TikTok bỏ qua cờ rotate. Chạy trong /tmp.
// Lỗi thì ném ra kèm chẩn đoán để caller fallback file gốc.
export async function normalizeVideo(input: Buffer): Promise<Buffer> {
  if (!FFMPEG || !existsSync(FFMPEG)) {
    let dirInfo = '';
    try {
      if (FFMPEG) dirInfo = ' | dir=' + (await readdir(dirname(FFMPEG))).join(',');
    } catch {
      /* bỏ qua */
    }
    throw new Error(`ffmpeg binary khong co (path=${FFMPEG} exists=${FFMPEG ? existsSync(FFMPEG) : false})${dirInfo}`);
  }
  const base = join(tmpdir(), `tt-${randomUUID()}`);
  const inPath = `${base}.in`;
  const outPath = `${base}.out.mp4`;
  await writeFile(inPath, input);
  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-i', inPath,
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-movflags', '+faststart',
        '-y', outPath
      ];
      const proc = spawn(FFMPEG, args);
      let err = '';
      proc.stderr.on('data', (d) => {
        err += d.toString();
        if (err.length > 4000) err = err.slice(-4000);
      });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`))));
    });
    return await readFile(outPath);
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}
