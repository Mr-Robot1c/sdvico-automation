// kiem-search-console.mjs — KIỂM một lệnh xem Search Console đã nối được chưa (B2 bàn giao 16/9).
// Chạy: npm run gsc:kiem
// Trả lời 3 câu: (1) API đã bật trong dự án Google chưa, (2) tài khoản dịch vụ đã được thêm vào
// property sdvico.vn chưa (việc của anh Thành), (3) GSC_SITE_URL nên đặt giá trị nào.
// Chỉ ĐỌC, không ghi gì. Không in bí mật.
import { loadRealEnv } from './video/env.mjs';
import { googleAccessToken, loadServiceAccount } from './google-sa.mjs';

const env = loadRealEnv();
const sa = loadServiceAccount(env);
if (!sa) { console.error('Chưa đặt GOOGLE_SA_JSON trong .env'); process.exit(1); }
console.log('Tài khoản dịch vụ:', sa.email);

let token;
try { token = await googleAccessToken(['https://www.googleapis.com/auth/webmasters.readonly'], env); }
catch (e) { console.error('Lấy token lỗi:', e.message); process.exit(1); }
const H = { Authorization: `Bearer ${token}` };

// 1. API đã bật chưa? sites.list trả 403 "has not been used / disabled" nghĩa là CHƯA bật.
const sl = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: H, cache: 'no-store' });
const sj = await sl.json().catch(() => ({}));
if (sl.status === 403 && /has not been used|disabled/i.test(String(sj.error?.message || ''))) {
  console.log('\nCHƯA BẬT Search Console API trong dự án Google sdvico-youtube.');
  console.log('Thanh mở link này bằng Edge (tài khoản Google công ty) rồi bấm nút Enable / Bật:');
  console.log('  https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=sdvico-youtube');
  console.log('Bật xong chờ 2 phút rồi chạy lại lệnh này.');
  process.exit(2);
}
if (!sl.ok) { console.error('sites.list lỗi', sl.status, String(sj.error?.message || '').slice(0, 200)); process.exit(1); }

// 2. Đã được thêm vào property nào?
const sites = (sj.siteEntry || []).map((s) => `${s.siteUrl} (${s.permissionLevel})`);
if (!sites.length) {
  console.log('\nAPI đã bật, nhưng tài khoản dịch vụ CHƯA được thêm vào property nào.');
  console.log('Chờ anh Thành thêm email trên vào Search Console sdvico.vn (Cài đặt -> Người dùng và quyền).');
  process.exit(2);
}
console.log('\nĐược quyền các property:');
for (const s of sites) console.log('  -', s);

// 3. Thử truy vấn để chốt GSC_SITE_URL.
const to = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const from = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
let picked = null;
for (const site of ['sc-domain:sdvico.vn', 'https://sdvico.vn/']) {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ startDate: from, endDate: to, dimensions: ['page'], rowLimit: 3 }),
  });
  const j = await r.json().catch(() => ({}));
  console.log(`Thử ${site}: ${r.ok ? `OK, ${(j.rows || []).length} dòng mẫu` : `lỗi ${r.status} ${String(j.error?.message || '').slice(0, 120)}`}`);
  if (r.ok && !picked) picked = site;
}
if (picked) {
  console.log(`\nNỐI ĐƯỢC. Đặt biến (Vercel sdvico-mktit -> Settings -> Environment Variables, và .env máy này):`);
  console.log(`  GSC_SITE_URL=${picked}`);
  if ((env.GSC_SITE_URL || '').trim() === picked) console.log('  (.env máy này đã đặt đúng)');
  console.log('Xong redeploy, cron /api/mkt-metrics-pull sau 6h sáng sẽ tự kéo số về trang SEO.');
} else {
  console.log('\nCó quyền property nhưng truy vấn sdvico.vn chưa được — xem lại property anh Thành thêm là dạng nào.');
  process.exit(2);
}
