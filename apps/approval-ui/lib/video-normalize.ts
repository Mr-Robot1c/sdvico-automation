import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Chuẩn hóa video cho TikTok: re-encode để NƯỚNG chiều xoay (ffmpeg autorotate mặc định bật) +
// H.264 + AAC + faststart. Sửa lỗi video bị quay 90 độ khi TikTok xử lý (bỏ qua cờ rotate),
// đồng thời bảo đảm codec TikTok nhận. Cần ffmpeg-static (binary tải lúc npm install trên Vercel).
// Chạy trong /tmp (serverless chỉ ghi được /tmp). Lỗi thì ném ra để caller fallback file gốc.
export async function normalizeVideo(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('ffmpeg-static không có đường dẫn binary');
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
      const proc = spawn(ffmpegPath as unknown as string, args);
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
