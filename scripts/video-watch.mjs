#!/usr/bin/env node
// Watcher dựng video, đa nền (30/8) — thay vòng lặp trong video-watch.bat để chạy được cả
// trên Windows, macOS, Linux. Gọi build-video-all.mjs ở chế độ --watch (tự lặp bên trong),
// bọc thêm vòng restart phòng tiến trình con chết bất ngờ.
//
// Chạy:  npm run video:watch          (mọi hệ điều hành)
//        node scripts/video-watch.mjs
// Dừng:  Ctrl+C.
// Tự chạy nền: Windows dùng scripts/cai-tu-dong-video.bat; macOS dùng launchd; Linux dùng
// systemd --user hoặc pm2 (xem packages/marketing/src/video/README.md mục "Chạy nền đa nền").
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, '..', 'packages', 'marketing', 'src', 'video', 'build-video-all.mjs');
const INTERVAL = process.env.VIDEO_WATCH_INTERVAL || '60';
const RESTART_DELAY_MS = 10_000;

let stopping = false;
process.on('SIGINT', () => { stopping = true; process.exit(0); });
process.on('SIGTERM', () => { stopping = true; process.exit(0); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runOnce() {
  return new Promise((resolve) => {
    // process.execPath = chính node đang chạy (không phụ thuộc 'node' có trong PATH hay không).
    const proc = spawn(process.execPath, [TARGET, '--requested', '--watch', '--interval', INTERVAL], { stdio: 'inherit' });
    proc.on('error', (e) => { console.error('[watcher] khong chay duoc build-video-all:', e.message); resolve(1); });
    proc.on('close', (code) => resolve(code ?? 1));
  });
}

console.log('[SDVICO] Watcher video: theo doi bai da bam "Lam video", quet moi ' + INTERVAL + ' giay. Ctrl+C de dung.');
for (;;) {
  const code = await runOnce();
  if (stopping) break;
  console.error(`[watcher] tien trinh thoat (ma ${code}). Chay lai sau ${RESTART_DELAY_MS / 1000} giay...`);
  await sleep(RESTART_DELAY_MS);
}
