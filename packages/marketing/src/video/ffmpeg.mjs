// Helper ffmpeg/ffprobe cho dây chuyền video (chạy máy nội bộ).
// Binary đến từ @ffmpeg-installer + @ffprobe-installer (đóng gói sẵn, không cần cài hệ thống).
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

export const FFMPEG = ffmpegInstaller.path;
export const FFPROBE = ffprobeInstaller.path;

// Chạy một binary, gom stderr; reject kèm đuôi stderr khi mã thoát khác 0.
// cwd: đặt thư mục làm việc (để tham chiếu file phụ đề/font bằng tên tương đối,
// né escape path Windows trong filter subtitles).
export function run(bin, args, { onStderr, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, cwd ? { cwd } : {});
    let err = '';
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      if (err.length > 12000) err = err.slice(-12000);
      if (onStderr) onStderr(s);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0
      ? resolve({ stdout: out, stderr: err })
      : reject(new Error(`${bin.split(/[\\/]/).pop()} exit ${code}: ${err.slice(-600)}`))));
  });
}

export const ffmpeg = (args, opts) => run(FFMPEG, args, opts);

// Thời lượng (giây) của một file media.
export async function probeDuration(path) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ]);
  const d = parseFloat(stdout.trim());
  return Number.isFinite(d) ? d : 0;
}

// Kích thước khung hình (width,height) của video.
export async function probeSize(path) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0', path,
  ]);
  const [w, h] = stdout.trim().split('x').map((n) => parseInt(n, 10));
  return { width: w || 0, height: h || 0 };
}

// Tải một asset từ Supabase Storage (bucket brand-assets) xuống file.
export async function downloadAsset(client, storagePath, destPath, bucket = 'brand-assets') {
  const { data, error } = await client.storage.from(bucket).download(storagePath);
  if (error) throw new Error(`tai asset ${storagePath}: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await writeFile(destPath, buf);
  return destPath;
}
