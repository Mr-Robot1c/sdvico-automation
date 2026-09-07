// fb-inbox-import.mjs — nhập tin khách hỏi mua từ hộp thư Meta Business Suite (page chính SDVICO VN)
// do PHIÊN CLAUDE DESKTOP đọc bằng Chrome đã đăng nhập (giống phiên đọc Zalo 16:00) và ghi ra JSON.
//
// Vì sao (user 7/9: "không thể đọc được như chat.zalo.me à? ... đó chính là ý của tôi"): page chính
// chưa có Page Access Token nên lib/fb-inbox.ts (Graph API) chỉ kéo được page phụ. Cầu nối: phiên
// Claude mở business.facebook.com/latest/inbox trong Chrome thật, đọc hội thoại, ghi
// Facebook\inbox-run-YYYY-MM-DD-HHMM.json rồi gọi script này. CHỈ ĐỌC, không nhắn lại ai (điều cấm 1).
//
// Cách chạy: node packages/marketing/src/fb-inbox-import.mjs <file.json> [--dry]
// JSON: { page: "SDVICO VN", read_at: ISO, conversations: [ { name, messages: [ { from: "khach"|"page",
//   text, time } ] } ] }  — time là chuỗi giờ VN dạng "2026-09-07 14:03" hoặc mô tả ("Wed", "25 Aug");
//   không ép được thì để nguyên chuỗi, ghi vào raw_payload.
// Mỗi hội thoại -> tối đa 1 lead mỗi lượt: tin KHÁCH gửi gần nhất (bỏ tin page, tin tự động, sticker).
// Khử trùng: cùng tên khách + cùng câu đã có trong mkt_leads 30 ngày -> bỏ. Ghi run_log mkt.fb_inbox_chrome.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const file = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!file) { console.error('can duong dan file JSON'); process.exit(1); }

function rest(path, opts = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}
async function runLog(status, detail) {
  try { await rest('run_log', { method: 'POST', body: JSON.stringify({ task: 'mkt.fb_inbox_chrome', actor: 'phien-chrome', status, detail }) }); } catch { /* bo qua */ }
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const key = (name, text) => `${norm(name).toLowerCase()}||${norm(text).toLowerCase()}`;
// Tin tự động của page / tin hệ thống: không phải khách hỏi.
const AUTO = /cảm ơn bạn đã liên hệ|automated response|auto-label|lead stage set to/i;

const data = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const convs = Array.isArray(data.conversations) ? data.conversations : [];
const PAGE_URL = `https://business.facebook.com/latest/inbox/all/?asset_id=${env.FB_SUITE_ASSET_ID || '101052306114292'}&business_id=${env.FB_SUITE_BUSINESS_ID || '805150207595333'}`;

// Lead đã có 30 ngày (mọi nguồn) để khử trùng theo tên + câu.
const since = new Date(Date.now() - 30 * 86400e3).toISOString();
const exRes = await rest(`mkt_leads?select=fb_user_name,message,created_at&created_at=gte.${since}&limit=2000`);
const existing = exRes.ok ? await exRes.json() : [];
const seen = new Set(existing.map((r) => key(r.fb_user_name, r.message)));

const rows = [];
const skipped = [];
for (const c of convs) {
  const name = norm(c.name);
  if (!name) continue;
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  const khach = msgs.filter((m) => m && m.from === 'khach' && norm(m.text) && !AUTO.test(m.text));
  if (!khach.length) { skipped.push({ name, why: 'khong co tin khach' }); continue; }
  // Tin khách gần nhất CÓ NỘI DUNG (bỏ "ok", "dạ" cuối cuộc); không có thì lấy tin cuối.
  const last = [...khach].reverse().find((m) => norm(m.text).length >= 8) || khach[khach.length - 1];
  const k = key(name, last.text);
  if (seen.has(k)) { skipped.push({ name, why: 'da co lead cung cau' }); continue; }
  seen.add(k);
  rows.push({
    source: 'facebook_message',
    fb_user_id: null,
    fb_user_name: name.slice(0, 120),
    fb_profile_url: PAGE_URL,
    message: norm(last.text).slice(0, 2000),
    status: 'new',
    note: `Đọc từ hộp thư page SDVICO VN (phiên Chrome) ${String(data.read_at || '').slice(0, 10)}; tin khách gần nhất: ${last.time || '?'}; ${khach.length} tin khách`,
    raw_payload: {
      source: 'inbox_chrome', page_label: 'real', conversation: name, created_time: last.time || null,
      customer_messages: khach.length, all_customer_texts: khach.slice(-5).map((m) => norm(m.text).slice(0, 300)),
      read_at: data.read_at || null, run_file: basename(file),
    },
  });
}

console.log(`hoi thoai: ${convs.length} | lead moi: ${rows.length} | bo qua: ${skipped.length}`);
for (const r of rows) console.log('  +', r.fb_user_name, '|', r.message.slice(0, 70));
for (const s of skipped) console.log('  -', s.name, '|', s.why);
let inserted = 0; let err = null;
if (DRY) { console.log('(dry, khong ghi)'); }
else if (rows.length) {
  const r = await rest('mkt_leads', { method: 'POST', body: JSON.stringify(rows) });
  if (r.ok) inserted = rows.length; else err = `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`;
}
if (!DRY) {
  await runLog(err ? 'error' : 'ok', { file: basename(file), conversations: convs.length, inserted, skipped: skipped.length, error: err });
  console.log(err ? 'LOI ' + err : `da ghi ${inserted} lead`);
}
process.exitCode = err ? 1 : 0;
