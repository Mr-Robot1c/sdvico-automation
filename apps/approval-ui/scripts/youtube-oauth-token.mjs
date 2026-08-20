// scripts/youtube-oauth-token.mjs — lay refresh_token YouTube mot lan cho SDVICO.
//
// CACH CHAY (local, MOT LAN):
//   1. Da tao Google Cloud project + enable "YouTube Data API v3" + OAuth Desktop app.
//   2. Xuat 2 bien moi truong local:
//        export YOUTUBE_CLIENT_ID=<client_id>
//        export YOUTUBE_CLIENT_SECRET=<client_secret>
//      (PowerShell: $env:YOUTUBE_CLIENT_ID=... ; $env:YOUTUBE_CLIENT_SECRET=...)
//   3. Chay:  node apps/approval-ui/scripts/youtube-oauth-token.mjs
//   4. Script mo trinh duyet toi Google login. Chon dung TAI KHOAN CHU KENH YOUTUBE SDVICO
//      (khong phai Gmail ca nhan sep). Bam "Cho phep" (Allow).
//   5. Script in refresh_token ra terminal. Copy va paste vao Vercel:
//        Vercel > Project sdvico-approval-ui > Settings > Environment Variables
//        YOUTUBE_CLIENT_ID       (chung 3 environment: Production, Preview, Development)
//        YOUTUBE_CLIENT_SECRET
//        YOUTUBE_REFRESH_TOKEN
//   6. Redeploy Vercel de env vars co hieu luc.
//
// LUU Y: Google OAuth Testing app -> refresh_token het han sau 7 NGAY. Muon lau, publish app
// (Google Cloud Console > OAuth consent screen > Publish App). Xem docs/runbook-youtube-setup.md.

import http from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';

const PORT = 3939;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'];

const clientId = (process.env.YOUTUBE_CLIENT_ID || '').trim();
const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || '').trim();

if (!clientId || !clientSecret) {
  console.error('\n[!] Thieu YOUTUBE_CLIENT_ID hoac YOUTUBE_CLIENT_SECRET trong env local.');
  console.error('    Dat 2 bien nay (tu file OAuth credentials.json ban tai ve tu Google Cloud) roi chay lai.\n');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (u.pathname !== '/callback') {
    res.writeHead(404).end('Not found');
    return;
  }
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  if (err || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      .end(`<h1>Loi</h1><p>${err || 'Khong nhan duoc code'}</p>`);
    console.error('[!] OAuth loi:', err);
    server.close();
    process.exit(1);
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(`<h1>Loi doi code -> token</h1><pre>${JSON.stringify(j, null, 2)}</pre>`);
      console.error('\n[!] Doi code that bai:', j);
      server.close();
      process.exit(1);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      `<h1>Da lay refresh_token!</h1><p>Xem terminal de copy. Co the dong tab nay.</p>`
    );
    console.log('\n=================================================================');
    console.log('  ✓ THANH CONG. Copy 3 dong sau vao Vercel Environment Variables:');
    console.log('=================================================================\n');
    console.log(`YOUTUBE_CLIENT_ID=${clientId}`);
    console.log(`YOUTUBE_CLIENT_SECRET=${clientSecret}`);
    console.log(`YOUTUBE_REFRESH_TOKEN=${j.refresh_token}`);
    console.log('\n=================================================================');
    console.log('  Buoc tiep: Vercel > Settings > Environment Variables, luu, redeploy.');
    console.log('=================================================================\n');
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('\n[!] Loi:', e?.message || e);
    res.writeHead(500).end('Loi: ' + (e?.message || e));
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\n[i] Mo trinh duyet: ${authUrl.toString()}\n`);
  console.log('[i] Neu khong tu mo, copy URL tren vao trinh duyet.\n');
  // Thu tu mo (Windows/Mac/Linux)
  const cmd = process.platform === 'win32' ? `start "" "${authUrl.toString()}"` :
              process.platform === 'darwin' ? `open "${authUrl.toString()}"` :
              `xdg-open "${authUrl.toString()}"`;
  exec(cmd, () => { /* im lang neu loi */ });
});
