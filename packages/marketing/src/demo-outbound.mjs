// demo-outbound.mjs — chạy thử backend soạn tin Marketing.
//
// Mặc định DRY RUN: chỉ soạn và in ra, không đụng cơ sở dữ liệu.
//   node packages/marketing/src/demo-outbound.mjs
//
// Chế độ LIVE: đẩy thật vào approval_queue ở trạng thái pending, rồi đọc lại để kiểm chứng.
// Vẫn KHÔNG gửi cho ai. Chỉ tạo bản nháp chờ người duyệt.
//   node packages/marketing/src/demo-outbound.mjs --live
//
// Tự tạo Supabase client bằng SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong .env,
// không phụ thuộc biến thể core nào, nên chạy được trên cả hai schema.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import {
  buildAfterSalesMessage,
  buildB2cFollowup,
  queueOutbound,
  logInfo,
  OUTBOUND_KIND,
} from './outbound.mjs';

const LIVE = process.argv.includes('--live');

// Ba tin mẫu, đều tuân thủ: không nêu model, không bịa giá, không nhận vơ phần mềm đối tác.
const samples = [
  {
    channel: 'zalo',
    to: '090xxxxxxx',
    audience: 'b2c',
    ...buildAfterSalesMessage({ months: 1, customerName: 'chú Ba', province: 'Quảng Ngãi' }),
  },
  {
    channel: 'sms',
    to: '091xxxxxxx',
    audience: 'b2c',
    ...buildAfterSalesMessage({ months: 6, province: 'Bình Định' }),
  },
  {
    channel: 'zalo',
    to: '098xxxxxxx',
    audience: 'b2c',
    ...buildB2cFollowup({ customerName: 'anh Tư', province: 'Khánh Hòa' }),
  },
];

console.log(`=== DEMO backend soạn tin Marketing (${LIVE ? 'LIVE' : 'DRY RUN'}) ===\n`);

for (const s of samples) {
  console.log(`- [${s.channel}] ${s.title}`);
  console.log(`  gửi tới: ${s.to} (chỉ người đã đồng ý nhận)`);
  console.log('  nội dung:');
  for (const line of s.body.split('\n')) console.log('    ' + line);
  console.log('');
}

if (!LIVE) {
  console.log('Đây là DRY RUN, chưa ghi gì vào cơ sở dữ liệu.');
  console.log('Chạy lại với --live để đẩy vào approval_queue (vẫn chờ người duyệt, không gửi).');
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.');
  process.exit(1);
}
const client = createClient(url, key, { auth: { persistSession: false } });

const ids = [];
for (const s of samples) {
  const id = await queueOutbound(client, s);
  ids.push(id);
  console.log(`Đã đẩy vào hàng đợi duyệt: ${id} (${s.title})`);
}
await logInfo(client, 'mkt.demo_outbound', { queued: ids.length, ids });

// Đọc lại để kiểm chứng các mục đang chờ duyệt.
const { data: pending, error } = await client
  .from('approval_queue')
  .select('id, kind, title, status')
  .eq('kind', OUTBOUND_KIND)
  .eq('status', 'pending')
  .order('created_at', { ascending: false })
  .limit(10);
if (error) throw new Error('Đọc lại approval_queue lỗi: ' + error.message);

console.log(`\n=== ${pending.length} mục mkt_send_message đang chờ duyệt ===`);
for (const p of pending) console.log(`- [${p.status}] ${p.title} (${p.id})`);
console.log('\nCác mục này chờ người bấm Duyệt trong giao diện duyệt. Máy KHÔNG tự gửi.');
