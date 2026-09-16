// google-oauth-drive.mjs — LẤY REFRESH TOKEN Google Drive bằng tài khoản Google của công ty (16/9).
// Lý do: Google không cho TÀI KHOẢN DỊCH VỤ giữ file trên My Drive nữa ("Service Accounts do not have
// storage quota", trừ Shared Drive của Workspace). Cách chuẩn: OAuth như YouTube đang dùng — file up lên
// nằm trong Drive của tài khoản đã đồng ý, tài khoản dịch vụ chỉ còn dùng cho Search Console.
//
// Chạy: node packages/marketing/src/google-oauth-drive.mjs
//   1. Script in ra 1 đường link, mở bằng trình duyệt đang đăng nhập Google công ty, bấm Cho phép.
//   2. Google chuyển về http://localhost:8765, script nhận mã, đổi lấy refresh token, ghi vào .env gốc
//      (GDRIVE_REFRESH_TOKEN). Không in token ra màn hình.
// Cần GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (OAuth client kiểu Desktop app, cùng client với YouTube).
// Scope drive.file: chỉ đụng file do chính app này tạo (không đọc file khác trong Drive).
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const CLIENT_ID = env.GOOGLE_CLIENT_ID || env.YOUTUBE_CLIENT_ID; const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET || env.YOUTUBE_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('Thiếu YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET trong .env (lấy từ Vercel: vercel env pull).'); process.exit(1); }
const PORT = Number(process.env.OAUTH_PORT || 8765);
const REDIRECT = `http://localhost:${PORT}/`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent' });
const envPath = (() => { let d = process.cwd(); for (let i = 0; i < 5; i++) { const p = `${d}/.env`; if (existsSync(p)) return p; d = `${d}/..`; } return `${process.cwd()}/.env`; })();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  // /start: chuyển thẳng sang trang đồng ý của Google (mở http://localhost:8765/start là khỏi chép link dài).
  if (u.pathname === '/start') { res.writeHead(302, { Location: url }); res.end(); return; }
  const code = u.searchParams.get('code');
  if (!code) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<p>Chờ mã từ Google...</p>'); return; }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
    const j = await r.json();
    if (!j.refresh_token) throw new Error('Google không trả refresh_token: ' + JSON.stringify(j).slice(0, 200));
    let s = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    s = /^GDRIVE_REFRESH_TOKEN=/m.test(s) ? s.replace(/^GDRIVE_REFRESH_TOKEN=.*$/m, `GDRIVE_REFRESH_TOKEN=${j.refresh_token}`) : s + `\n# 16/9 Drive kho tu lieu qua OAuth tai khoan cong ty (google-oauth-drive.mjs)\nGDRIVE_REFRESH_TOKEN=${j.refresh_token}\n`;
    writeFileSync(envPath, s, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Xong. Đã ghi GDRIVE_REFRESH_TOKEN vào .env — đóng tab này được rồi.</h2>');
    console.log('\n✓ Đã ghi GDRIVE_REFRESH_TOKEN vào', envPath);
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Lỗi: ' + (e?.message || e));
    console.error('Lỗi đổi mã:', e?.message || e); setTimeout(() => process.exit(1), 500);
  }
});
server.listen(PORT, () => {
  console.log('Mở link này bằng trình duyệt đang đăng nhập Google của công ty, bấm Cho phép:\n');
  console.log(url + '\n');
  console.log(`Hoặc mở ngắn gọn: http://localhost:${PORT}/start
(đang chờ Google gọi về ${REDIRECT} ...)`);
});
