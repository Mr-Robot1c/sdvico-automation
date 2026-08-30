#!/usr/bin/env node
// Khởi động server giọng Mỹ Duyên (VieNeu), đa nền (30/8) — thay start-server.bat/.vbs của
// Windows để chạy được cả macOS, Linux.
//
// Chạy:  npm run voice:server
//        PYTHON=/duong/den/venv/python npm run voice:server   (dùng Python trong venv)
// Cổng mặc định 8199 (đổi bằng env SDVICO_TTS_PORT). Giọng đổi bằng SDVICO_TTS_VOICE.
// Cần cài trước: pip install vieneu flask librosa soundfile
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pythonCmd } from '../packages/marketing/src/platform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..', 'packages', 'marketing', 'src', 'voice', 'local-tts-server-vieneu.py');
const py = pythonCmd();

console.log(`[SDVICO] Bat server giong (${py}) — cong ${process.env.SDVICO_TTS_PORT || '8199'}. Ctrl+C de dung.`);
const proc = spawn(py, [SERVER], { stdio: 'inherit' });
proc.on('error', (e) => {
  console.error(`[voice] khong chay duoc '${py}': ${e.message}`);
  console.error("  -> Kiem tra Python da cai + 'pip install vieneu flask librosa soundfile', hoac dat env PYTHON.");
  process.exit(1);
});
proc.on('close', (code) => process.exit(code ?? 1));
process.on('SIGINT', () => proc.kill('SIGINT'));
process.on('SIGTERM', () => proc.kill('SIGTERM'));
