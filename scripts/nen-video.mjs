// Nen video bang ffmpeg (co san qua @ffmpeg-installer) - dua ve <50MB de vua han muc Supabase.
// Chien luoc: H.264 CRF 28 + scale 720p + AAC 128k. Neu van > 45MB thi thu lai CRF 32 + 540p.
import { spawn } from 'node:child_process';
import { statSync, existsSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const FFMPEG = ffmpegInstaller.path;
const TARGET_MB = 45; // an toan, chua buffer duoi 50MB
const MB = 1024 * 1024;

const inPath = process.argv[2];
if (!inPath || !existsSync(inPath)) {
  console.error('Khong tim thay file:', inPath);
  process.exit(1);
}

function mb(bytes) { return (bytes / MB).toFixed(1); }

async function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-500)))));
  });
}

async function compress(input, output, { crf, width }) {
  console.log(`Nen: CRF ${crf}, rong ${width}px...`);
  await run([
    '-y', '-i', input,
    '-vf', `scale='min(${width},iw)':-2`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    output,
  ]);
}

const dir = dirname(inPath);
const stem = basename(inPath, extname(inPath));
const outPath = join(dir, `${stem}_nen.mp4`);

const inSize = statSync(inPath).size;
console.log(`Video goc: ${mb(inSize)}MB -> ${outPath}`);
console.log();

if (inSize <= TARGET_MB * MB) {
  console.log(`Video goc da <${TARGET_MB}MB, khong can nen. Cu tai truc tiep len /tu-lieu.`);
  process.exit(0);
}

// Lan 1: CRF 28 + 720p (chat luong tot)
await compress(inPath, outPath, { crf: 28, width: 1280 });
let outSize = statSync(outPath).size;
console.log(`Sau nen lan 1: ${mb(outSize)}MB`);

// Neu van qua lon, lan 2: nen manh hon
if (outSize > TARGET_MB * MB) {
  console.log(`Van > ${TARGET_MB}MB, nen manh hon...`);
  await compress(inPath, outPath, { crf: 32, width: 960 });
  outSize = statSync(outPath).size;
  console.log(`Sau nen lan 2: ${mb(outSize)}MB`);
}

if (outSize > TARGET_MB * MB) {
  console.log(`Van > ${TARGET_MB}MB, thu lan 3 (chat luong thap hon)...`);
  await compress(inPath, outPath, { crf: 34, width: 720 });
  outSize = statSync(outPath).size;
  console.log(`Sau nen lan 3: ${mb(outSize)}MB`);
}

console.log();
if (outSize <= 50 * MB) {
  console.log(`XONG: ${outPath} (${mb(outSize)}MB) - tai duoc len kho.`);
} else {
  console.log(`CANH BAO: File van ${mb(outSize)}MB, VUOT 50MB. Video qua dai/nang - hay cat ngan bang HandBrake hoac Adobe Premiere.`);
}
