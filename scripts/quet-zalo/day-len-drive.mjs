// day-len-drive.mjs — đẩy DATA/drive/zalo-*.md lên Google Drive (thư mục "SDVICO - Lưu trữ Zalo") rồi XOÁ bản trên máy.
// Thanh 19/10/2026: "quét xong tự up lên drive để lưu trữ, khi cần kéo qua làm video; file trên máy tự xoá cho trống ổ".
// Dùng OAuth client của công ty (GOOGLE_CLIENT_ID/SECRET, cùng client YouTube) + GDRIVE_REFRESH_TOKEN lấy bằng
// packages/marketing/src/google-oauth-drive.mjs, scope drive.file. KHÔNG dùng uploadToDrive của gdrive.mjs: hàm đó đặt
// quyền "ai có link cũng xem" cho ảnh/video đăng bài; tin nhắn nội bộ phải để riêng tư.
// Chạy: node scripts/quet-zalo/day-len-drive.mjs   (không có cấu hình Drive thì báo và để nguyên file, lần sau đẩy lại)
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadRealEnv } from '../../packages/marketing/src/video/env.mjs';
import { oauthClient } from '../../packages/marketing/src/gdrive.mjs';

const env = loadRealEnv();
const DATA = process.env.ZALO_DATA_DIR || join(homedir(), 'Desktop', 'SDVICO', 'ZALO-Data');
const DRIVE_DIR = join(DATA, 'drive');
const FOLDER_CACHE = join(DATA, 'kho', 'drive-folder.json');
const FOLDER_NAME = 'SDVICO - Lưu trữ Zalo';
const API = 'https://www.googleapis.com/drive/v3';

async function token() {
  const c = oauthClient(env);
  if (!c || !String(env.GDRIVE_REFRESH_TOKEN || '').trim()) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: env.GDRIVE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Drive OAuth lỗi ${r.status}: ${String(j.error_description || j.error || '').slice(0, 160)}`);
  return j.access_token;
}

// Thư mục lưu trữ: env ZALO_DRIVE_FOLDER_ID > id đã nhớ > tạo mới (scope drive.file chỉ thấy thư mục do chính app tạo).
async function folderId(tok) {
  if (env.ZALO_DRIVE_FOLDER_ID) return env.ZALO_DRIVE_FOLDER_ID;
  if (existsSync(FOLDER_CACHE)) return JSON.parse(readFileSync(FOLDER_CACHE, 'utf8')).id;
  const r = await fetch(`${API}/files?fields=id`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`Không tạo được thư mục Drive: ${r.status} ${String(j.error?.message || '').slice(0, 160)}`);
  mkdirSync(join(DATA, 'kho'), { recursive: true });
  writeFileSync(FOLDER_CACHE, JSON.stringify({ id: j.id, name: FOLDER_NAME }));
  console.log(`Tạo thư mục Drive "${FOLDER_NAME}" (${j.id})`);
  return j.id;
}

async function upload(tok, parent, name, buf) {
  const boundary = 'sdvicozalo' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id || Number(j.size) !== buf.length) throw new Error(`Đẩy ${name} lỗi ${r.status}: ${String(j.error?.message || `size ${j.size}/${buf.length}`).slice(0, 160)}`);
  return j.id;
}

const files = existsSync(DRIVE_DIR) ? readdirSync(DRIVE_DIR).filter((f) => /^zalo-.*\.md$/.test(f)).sort() : [];
if (!files.length) { console.log('Drive: không có file chờ đẩy.'); process.exit(0); }
const tok = await token();
if (!tok) { console.log(`Drive: chưa cấu hình (GOOGLE_CLIENT_ID/SECRET + GDRIVE_REFRESH_TOKEN trong .env), giữ ${files.length} file trong ${DRIVE_DIR}.`); process.exit(0); }
const parent = await folderId(tok);
for (const f of files) {
  const buf = readFileSync(join(DRIVE_DIR, f));
  const id = await upload(tok, parent, f, buf);
  unlinkSync(join(DRIVE_DIR, f)); // chỉ xoá khi Drive đã nhận đủ số byte
  console.log(`Drive: ✓ ${f} (${Math.round(buf.length / 1024)} KB, id ${id}), đã xoá bản trên máy`);
}
