// seed-keywords.mjs — nạp kho từ khóa vào bảng mkt_keywords.
// Chạy: npm run seed:keywords
//
// Idempotent: chạy lại nhiều lần không tạo dòng trùng. Cách làm: đọc trước các keyword
// đã có trong bảng, chỉ chèn những keyword còn thiếu. An toàn để chạy lại khi bổ sung.
//
// Ghi một dòng run_log để có vết theo đúng nguyên tắc "mọi thao tác ghi run_log".
//
// GHI CHÚ VỀ SCHEMA: bảng mkt_keywords của repo này dùng cột landing_url và ràng buộc
// intent chỉ nhận bốn mã: thong_tin, thuong_mai, dieu_huong, giao_dich. Kho từ khóa
// (keywords.mjs) phân theo bốn nhóm ngữ nghĩa info, compare, transaction, service để
// dễ đọc, rồi ánh xạ sang bốn mã trên khi nạp. Nhóm service (mất kết nối, gia hạn cước,
// sửa, thay) là hành động có chủ đích nên xếp vào giao_dich, và ưu tiên cao để làm trước.

import { getServiceClient, logRun } from '@sdvico/core';
import { buildKeywords, countByIntent } from './keywords.mjs';

// Ánh xạ nhóm ngữ nghĩa sang mã intent hợp lệ của bảng.
const INTENT_MAP = {
  info: 'thong_tin',
  compare: 'thuong_mai',
  transaction: 'giao_dich',
  service: 'giao_dich',
};

// Ưu tiên sản xuất nội dung: số lớn làm trước. Bám chiến lược "service và transaction
// ra tiền nhanh, ít rào duyệt; quy định (info) làm sau vì cần duyệt".
const PRIORITY_MAP = {
  service: 3,
  transaction: 2,
  compare: 1,
  info: 0,
};

const client = getServiceClient();
const rows = buildKeywords();

console.log(`Kho từ khóa dựng được: ${rows.length} mục.`);
console.log('Phân theo nhóm ngữ nghĩa:', countByIntent(rows));

// Lấy toàn bộ keyword đã có để khử trùng lặp trước khi chèn.
const existing = new Set();
{
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('mkt_keywords')
      .select('keyword')
      .range(from, from + pageSize - 1);
    if (error) throw new Error('Không đọc được mkt_keywords: ' + error.message);
    for (const r of data) existing.add(r.keyword);
    if (!data || data.length < pageSize) break;
  }
}

// Chỉ giữ dòng mới, ánh xạ sang đúng cột và mã của bảng.
// Bỏ cờ needsReview vì bảng không có cột đó (nó chỉ dùng ở tầng nội dung khi viết bài).
const toInsert = rows
  .filter((r) => !existing.has(r.keyword))
  .map((r) => ({
    keyword: r.keyword,
    intent: INTENT_MAP[r.intent],
    landing_url: r.target_page,
    source: r.source,
    priority: PRIORITY_MAP[r.intent] ?? 0,
  }));

if (toInsert.length === 0) {
  console.log('Không có từ khóa mới. Bảng đã đầy đủ.');
  await logRun(client, {
    task: 'mkt.seed_keywords',
    status: 'ok',
    detail: { built: rows.length, inserted: 0, already: existing.size },
  });
  process.exit(0);
}

// Chèn theo lô để tránh gói tin quá lớn.
let inserted = 0;
const batch = 200;
for (let i = 0; i < toInsert.length; i += batch) {
  const chunk = toInsert.slice(i, i + batch);
  const { error } = await client.from('mkt_keywords').insert(chunk);
  if (error) throw new Error('Chèn mkt_keywords lỗi: ' + error.message);
  inserted += chunk.length;
  console.log(`Đã chèn ${inserted}/${toInsert.length}...`);
}

console.log(`Xong. Chèn mới ${inserted} từ khóa, đã có sẵn ${existing.size}.`);

await logRun(client, {
  task: 'mkt.seed_keywords',
  status: 'ok',
  detail: { built: rows.length, inserted, already: existing.size },
});
