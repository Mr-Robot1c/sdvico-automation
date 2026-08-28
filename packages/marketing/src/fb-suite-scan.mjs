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
//   node packages/marketing/src/fb-suite-scan.mjs --loop     # quét mỗi 2h (FB_SUITE_EVERY_HOURS)
// Phiên đăng nhập: MƯỢN từ Brave hằng ngày (syncSession bên dưới) — không cần login riêng.
// Brave đang mở thì file cookie bị khoá (và CDP profile chính bị Chromium >=136 chặn), nên:
// chưa có bản cookie -> loop rình 5 phút/lần chộp đúng lúc Brave tắt (thường là lúc khởi động
// máy); có bản rồi -> quét thẳng mỗi 2h DÙ Brave đang mở, mỗi lần quét thử làm tươi bản cookie.
//
// Kỹ thuật: Brave/Chromium `--headless=new --dump-dom` với --user-data-dir RIÊNG (không đụng
// Brave user đang mở) + --virtual-time-budget cho SPA render xong. Không cần Playwright/npm.
// Ghi mkt_metrics: source='facebook', entity_ref='__page_real__' (cùng chỗ follower cũ) với
// metrics.suite28 {views, viewers, visits, interactions, follows, netFollows} + followers.
// Điều cấm 5: chỉ ghi số đọc được thật; field nào không bóc được thì để null, không đoán.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
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

// 28/8 đêm: profile TRẮNG đăng nhập mới bị Facebook coi là thiết bị lạ ("không có trang đó")
// -> MƯỢN phiên của Brave hằng ngày: copy Local State (giữ khoá giải mã cookie, DPAPI theo
// user Windows nên cùng máy đọc được) + Network\Cookies sang profile quét TRƯỚC mỗi lần quét.
// Chỉ ĐỌC profile thật, không ghi gì vào đó; Brave đang mở vẫn copy được.
const LIVE_UD = env.FB_SUITE_LIVE_UD || join(process.env.LOCALAPPDATA || 'C:\\Users\\ADMIN\\AppData\\Local', 'BraveSoftware', 'Brave-Browser', 'User Data');
const LIVE_PROFILE_NAME = env.FB_SUITE_LIVE_PROFILE_NAME || 'Default';
function syncSession() {
  try {
    const srcState = join(LIVE_UD, 'Local State');
    const srcCookies = join(LIVE_UD, LIVE_PROFILE_NAME, 'Network', 'Cookies');
    if (!existsSync(srcState) || !existsSync(srcCookies)) return 'khong thay profile Brave song';
    mkdirSync(join(PROFILE, 'Default', 'Network'), { recursive: true });
    copyFileSync(srcState, join(PROFILE, 'Local State'));
    copyFileSync(srcCookies, join(PROFILE, 'Default', 'Network', 'Cookies'));
    return null;
  } catch (e) {
    return String(e?.message || e);
  }
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
  const syncErr = syncSession();
  if (syncErr) console.log('sync session:', syncErr, '- dung ban cookie cu (neu co)');
  const ov = await dumpDom(OVERVIEW_URL);
  const ovText = htmlToText(ov.html);
  const loggedOut = /log in to facebook|log into facebook|đăng nhập facebook/i.test(ovText) || ovText.length < 3000;
  if (loggedOut) {
    await runLog('error', 'phien Facebook khong dung — kiem tra Brave hang ngay con dang nhap Facebook khong (bo quet muon cookie tu do)', { textLen: ovText.length });
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

// --loop (user 29/8: "cứ 1-2h cho cron chạy quét thẳng lúc máy đang mở"): quét mỗi 2h.
// Chưa có bản cookie thì rình 5 phút/lần để chộp khoảnh khắc Brave tắt; chộp được là quét ngay.
async function loop() {
  mkdirSync(STATE_DIR, { recursive: true });
  const everyMs = Math.max(1, Number(env.FB_SUITE_EVERY_HOURS || 2)) * 3600 * 1000;
  const snapshot = join(PROFILE, 'Default', 'Network', 'Cookies');
  for (;;) {
    if (!existsSync(snapshot)) {
      const err = syncSession();
      if (err) { await new Promise((r) => setTimeout(r, 5 * 60 * 1000)); continue; }
      console.log('da chop duoc cookie tu Brave, quet ngay');
    }
    await scanOnce(); // tự thử làm tươi cookie mỗi lần (Brave mở thì dùng bản cũ)
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

if (process.argv.includes('--loop')) loop();
else {
  // Không dùng process.exit(): trên Windows giết ngang handle mạng đang đóng làm node
  // crash "Assertion failed ... UV_HANDLE_CLOSING". Đặt exitCode rồi để node tự thoát.
  scanOnce().then((ok) => { process.exitCode = ok ? 0 : 1; }).catch((e) => { console.error(String(e?.message || e)); process.exitCode = 1; });
}
