// @ts-ignore: @ffmpeg-installer/ffmpeg không kèm type declaration
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// Đường dẫn binary ffmpeg — đến từ @ffmpeg-installer (đóng gói sẵn trong npm, không tải runtime).
const FFMPEG: string | undefined = (ffmpegInstaller as any)?.path;

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
