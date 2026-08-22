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

// Cắt một file audio làm 2 tại KHOẢNG LẶNG gần vị trí kỳ vọng nhất. firstShare = tỷ lệ ký tự
// phần đầu (vd cảnh cuối / (cảnh cuối + outro)). Dùng cho "cảnh cuối + outro đọc chung một lần
// gọi TTS" (user 21/8: outro phải cùng giọng với lời đọc — Gemini mỗi lần gọi lên giọng khác
// nhau chút, đọc chung thì chắc chắn cùng giọng).
// Cách chọn: quét ngưỡng từ NGHIÊM tới NHẠY (giọng đọc liền mạch hay chỉ nghỉ 0,1-0,4s giữa
// câu); trong cửa sổ ±20% quanh vị trí kỳ vọng, CHẤM ĐIỂM = độ dài khoảng lặng trừ 0,08 × số giây
// lệch khỏi kỳ vọng (đo 21/8 trên file Leda: "dài nhất" chọn nhầm câu trước, chấm điểm chọn đúng).
// Không thấy gì thì cắt đúng vị trí kỳ vọng (gần đúng, vẫn dùng được).
export async function splitAtSilence(fullPath, firstOut, secondOut, firstShare) {
  const total = await probeDuration(fullPath);
  const expect = total * Math.min(0.95, Math.max(0.05, firstShare));
  const win = Math.max(1.0, total * 0.2);
  const tiers = [['-30dB', '0.14'], ['-27dB', '0.09'], ['-24dB', '0.07']];
  let best = null;
  let tierUsed = null;
  for (const [noise, d] of tiers) {
    const { stderr } = await run(FFMPEG, ['-i', fullPath, '-af', `silencedetect=noise=${noise}:d=${d}`, '-f', 'null', '-']);
    const starts = [];
    const ends = [];
    for (const line of String(stderr || '').split('\n')) {
      const a = line.match(/silence_start: ([\d.]+)/);
      if (a) starts.push(parseFloat(a[1]));
      const b = line.match(/silence_end: ([\d.]+)/);
      if (b) ends.push(parseFloat(b[1]));
    }
    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
      const sS = starts[i];
      const sE = ends[i];
      const mid = (sS + sE) / 2;
      const len = sE - sS;
      if (sS <= 0.5 || sE >= total - 0.5 || Math.abs(mid - expect) > win) continue;
      const score = len - 0.08 * Math.abs(mid - expect);
      if (!best || score > best.score) best = { mid, len, score };
    }
    if (best) { tierUsed = `${noise}/${d}s`; break; }
  }
  const cut = best ? best.mid : expect;
  await run(FFMPEG, ['-y', '-i', fullPath, '-t', cut.toFixed(3), '-c:a', 'libmp3lame', '-q:a', '4', firstOut]);
  await run(FFMPEG, ['-y', '-i', fullPath, '-ss', cut.toFixed(3), '-c:a', 'libmp3lame', '-q:a', '4', secondOut]);
  return { cut, total, expect, found: !!best, tier: tierUsed, silenceLen: best ? best.len : 0, first: await probeDuration(firstOut), second: await probeDuration(secondOut) };
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
