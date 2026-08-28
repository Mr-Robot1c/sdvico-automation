// Bộ quét Meta Business Suite — lấy insight CẤP TRANG của page chính SDVICO VN.
//
// Vì sao tồn tại (28/8, user chốt "tự động hoá luôn phần đó"): FACEBOOK_REAL_PAGE_ACCESS_TOKEN
// chưa có (user không tạo được token page chính), nhưng tài khoản Facebook của user xem được
// Business Suite của page. Số từng bài đã đo qua Graph công khai; số CẤP TRANG (lượt xem 28
// ngày, người xem, ghé trang, tương tác, người theo dõi) chỉ có trong Business Suite -> quét
// bằng trình duyệt thật trên máy chủ local, ghi vào mkt_metrics cho Đo lường ngày + tuần đọc.
//
// Cách chạy (trên máy chủ local, không chạy trên Vercel):
//   node packages/marketing/src/fb-suite-scan.mjs            # quét 1 lần ngay
//   node packages/marketing/src/fb-suite-scan.mjs --loop     # vòng lặp: mỗi giờ kiểm, quét 1 lần/ngày (sau 8h)
// Đăng nhập 1 LẦN trước khi dùng: chạy C:\Users\ADMIN\sdvico-fb-scan\login-fb-scan.bat
// (mở Brave headed với profile riêng của bộ quét -> đăng nhập Facebook -> đóng).
//
// Kỹ thuật: Brave/Chromium `--headless=new --dump-dom` với --user-data-dir RIÊNG (không đụng
// Brave user đang mở) + --virtual-time-budget cho SPA render xong. Không cần Playwright/npm.
// Ghi mkt_metrics: source='facebook', entity_ref='__page_real__' (cùng chỗ follower cũ) với
// metrics.suite28 {views, viewers, visits, interactions, follows, netFollows} + followers.
// Điều cấm 5: chỉ ghi số đọc được thật; field nào không bóc được thì để null, không đoán.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const ASSET_ID = env.FB_SUITE_ASSET_ID || '101052306114292';      // page SDVICO VN
const BUSINESS_ID = env.FB_SUITE_BUSINESS_ID || '805150207595333';
const BROWSER = env.FB_SUITE_BROWSER || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const PROFILE = env.FB_SUITE_PROFILE || 'C:\\Users\\ADMIN\\sdvico-fb-scan-profile';
const STATE_DIR = 'C:\\Users\\ADMIN\\sdvico-fb-scan';
const OVERVIEW_URL = `https://business.facebook.com/latest/insights/overview/?asset_id=${ASSET_ID}&business_id=${BUSINESS_ID}`;
const AUDIENCE_URL = `https://business.facebook.com/latest/insights/audience/?asset_id=${ASSET_ID}&business_id=${BUSINESS_ID}`;

function rest(path, opts = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

async function runLog(status, msg, extra = {}) {
  try {
    await rest('run_log', { method: 'POST', body: JSON.stringify({ task: 'mkt.fb_suite_scan', actor: 'may-chu-local', status, detail: { msg, ...extra } }) });
  } catch { /* log lỗi thì thôi */ }
}

// Chụp DOM một URL bằng trình duyệt headless với profile đã đăng nhập.
function dumpDom(url, budgetMs = 25000) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--window-size=1500,1000', `--user-data-dir=${PROFILE}`,
      `--virtual-time-budget=${budgetMs}`, '--timeout=60000', '--dump-dom', url,
    ];
    const proc = spawn(BROWSER, args, { windowsHide: true });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    const killer = setTimeout(() => { try { proc.kill(); } catch { /* đã thoát */ } }, 90000);
    proc.on('close', () => { clearTimeout(killer); resolve({ html: out, err }); });
  });
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

// "54.1K" -> 54100, "23,729" -> 23729, "1.2M" -> 1200000; hỗ trợ cả "54,1 N"/"1,2 Tr" (UI Việt).
function parseNum(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^([\d.,]+)\s*(K|M|N|Tr)?$/i);
  if (!m) return null;
  let num = m[1];
  const suffix = (m[2] || '').toLowerCase();
  if (suffix) num = num.replace(',', '.'); // "54,1 N" kiểu Việt
  else num = num.replace(/,/g, '');        // "23,729" kiểu Anh
  const v = Number(num);
  if (Number.isNaN(v)) return null;
  if (suffix === 'k' || suffix === 'n') return Math.round(v * 1000);
  if (suffix === 'm' || suffix === 'tr') return Math.round(v * 1000000);
  return Math.round(v);
}

// Tìm SỐ đầu tiên đứng ngay sau một trong các nhãn (biên từ 2 đầu để "Views" không ăn vào
// "Viewers", "Follows" không ăn vào "Unfollows"; chỉ cho ký tự không phải chữ giữa nhãn và số).
function grab(text, labels) {
  for (const label of labels) {
    const re = new RegExp('\\b' + label + '\\b' + String.raw`\W{0,20}?([\d.,]+\s?(?:K|M|N|Tr)?)\b`, 'i');
    const m = text.match(re);
    if (m) {
      const v = parseNum(m[1]);
      if (v != null) return v;
    }
  }
  return null;
}

async function scanOnce() {
  if (!existsSync(BROWSER)) { await runLog('error', 'khong thay trinh duyet: ' + BROWSER); return false; }
  const t0 = Date.now();
  const ov = await dumpDom(OVERVIEW_URL);
  const ovText = htmlToText(ov.html);
  const loggedOut = /log in to facebook|log into facebook|đăng nhập facebook/i.test(ovText) || ovText.length < 3000;
  if (loggedOut) {
    await runLog('error', 'profile quet CHUA DANG NHAP Facebook — chay login-fb-scan.bat dang nhap 1 lan roi quet lai', { textLen: ovText.length });
    return false;
  }
  const suite28 = {
    views: grab(ovText, ['Views', 'Lượt xem']),
    viewers: grab(ovText, ['Viewers', 'Người xem']),
    visits: grab(ovText, ['Facebook visits', 'Lượt ghé thăm', 'Visits']),
    interactions: grab(ovText, ['Content interactions', 'Lượt tương tác', 'Interactions']),
    follows: grab(ovText, ['Follows', 'Lượt theo dõi']),
    netFollows: grab(ovText, ['Net follows', 'Theo dõi ròng']),
  };
  // Người theo dõi TỔNG từ tab Audience (điểm hiện tại, không phải cửa sổ 28 ngày).
  let followers = null;
  try {
    const au = await dumpDom(AUDIENCE_URL);
    const auText = htmlToText(au.html);
    followers = grab(auText, ['Facebook followers', 'Người theo dõi trên Facebook', 'Followers']);
  } catch { /* thiếu followers vẫn ghi phần còn lại */ }

  const got = Object.values(suite28).filter((v) => v != null).length;
  if (!got) {
    await runLog('error', 'khong boc duoc so nao tu Business Suite (UI doi layout?)', { excerpt: ovText.slice(0, 400) });
    return false;
  }
  const now = new Date();
  const day = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10); // ngày VN
  const row = {
    source: 'facebook',
    entity_ref: '__page_real__',
    metric_date: day,
    metrics: {
      followers, name: 'SDVICO VN', page: 'real', via: 'business-suite',
      suite28, scannedAt: now.toISOString(), window: '28d',
    },
  };
  const r = await rest('mkt_metrics', { method: 'POST', body: JSON.stringify(row) });
  if (!r.ok) { await runLog('error', 'ghi mkt_metrics loi HTTP ' + r.status, { suite28 }); return false; }
  await runLog('ok', `quet xong ${got}/6 chi so trong ${((Date.now() - t0) / 1000).toFixed(0)}s`, { suite28, followers });
  console.log('OK', JSON.stringify({ suite28, followers }));
  return true;
}

// --loop: mỗi giờ kiểm; quét 1 lần/ngày sau 8h sáng (máy bật trễ vẫn quét bù trong ngày).
async function loop() {
  mkdirSync(STATE_DIR, { recursive: true });
  const stateFile = join(STATE_DIR, 'last-scan.txt');
  for (;;) {
    const nowVN = new Date(Date.now() + 7 * 3600 * 1000);
    const today = nowVN.toISOString().slice(0, 10);
    let last = '';
    try { last = readFileSync(stateFile, 'utf8').trim(); } catch { /* lần đầu */ }
    if (last !== today && nowVN.getUTCHours() >= 8) {
      const ok = await scanOnce();
      if (ok) writeFileSync(stateFile, today);
    }
    await new Promise((r) => setTimeout(r, 60 * 60 * 1000));
  }
}

if (process.argv.includes('--loop')) loop();
else scanOnce().then((ok) => process.exit(ok ? 0 : 1));
