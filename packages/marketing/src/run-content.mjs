// run-content.mjs — chạy cỗ máy nội dung một lượt.
// Chạy: npm run content:run           (sinh mặc định 3 bài)
//       node packages/marketing/src/run-content.mjs 5
//
// Luồng: chọn từ khóa ưu tiên cao chưa có bài -> sinh brief và draft -> quét tuân thủ ->
// lưu mkt_content (status draft, cờ needs_gov_review nếu chạm quy định) -> đẩy approval_queue.
// Không đăng gì. Người duyệt bấm Duyệt thì worker mới đăng (viết sau).

import { getServiceClient, logRun } from '@sdvico/core';
import { generateContentAsync, INTENT_LABEL } from './content.mjs';
import { assessDraft } from './compliance.mjs';
import { PRODUCT_FACTS, knownFactValues, testFactValues } from './product-facts.mjs';

const limit = Number(process.argv[2]) || 3;
const client = getServiceClient();
const known = knownFactValues(PRODUCT_FACTS);
const testVals = testFactValues(PRODUCT_FACTS);

// Các từ khóa đã có bài, để không làm trùng. Lưu keyword trong brief jsonb.
const { data: existingContent } = await client.from('mkt_content').select('brief');
const done = new Set((existingContent || []).map((r) => r?.brief?.keyword).filter(Boolean));

// Chọn từ khóa: ưu tiên cao trước, và cố lấy thêm một từ nhóm thông tin để thấy cờ đỏ.
const { data: topKw } = await client
  .from('mkt_keywords')
  .select('keyword,intent,landing_url,priority,source')
  .order('priority', { ascending: false })
  .limit(limit * 3);
const { data: infoKw } = await client
  .from('mkt_keywords')
  .select('keyword,intent,landing_url,priority,source')
  .eq('intent', 'thong_tin')
  .limit(2);

const pool = [...(infoKw || []), ...(topKw || [])];
const chosen = [];
const picked = new Set();
for (const kw of pool) {
  if (done.has(kw.keyword) || picked.has(kw.keyword)) continue;
  picked.add(kw.keyword);
  chosen.push(kw);
  if (chosen.length >= limit) break;
}

if (chosen.length === 0) {
  console.log('Không còn từ khóa nào để viết (đều đã có bài). Xong.');
  process.exit(0);
}

console.log(`Sẽ viết ${chosen.length} bài từ các từ khóa ưu tiên cao.\n`);

const results = [];
for (const kw of chosen) {
  const { title, brief, draft } = await generateContentAsync(kw, { facts: PRODUCT_FACTS });
  const assess = assessDraft(`${title}\n${draft}`, { knownFactValues: known, testFactValues: testVals });

  // Lưu bài vào mkt_content. Gắn cờ duyệt cấp quản lý (needs_gov_review) nếu chạm quy định.
  const briefFull = { ...brief, risk: assess.risk, compliance: assess.flags };
  const { data: inserted, error: e1 } = await client
    .from('mkt_content')
    .insert({
      kind: 'article',
      title,
      brief: briefFull,
      draft,
      status: assess.risk === 'red' ? 'review' : 'draft',
      needs_gov_review: assess.risk === 'red',
    })
    .select('id')
    .single();
  if (e1) throw new Error('Lưu mkt_content lỗi: ' + e1.message);

  // Đẩy vào hàng đợi duyệt, kèm cờ tuân thủ để người duyệt thấy ngay.
  const { error: e2 } = await client.from('approval_queue').insert({
    kind: 'mkt_publish_content',
    title,
    payload: {
      content_id: inserted.id,
      keyword: kw.keyword,
      intent: kw.intent,
      landing_url: kw.landing_url,
      risk: assess.risk,
      needs_manager_approval: assess.needsManagerApproval,
      compliance: assess.flags,
    },
    ref_table: 'mkt_content',
    ref_id: inserted.id,
    status: 'pending',
  });
  if (e2) throw new Error('Đẩy approval_queue lỗi: ' + e2.message);

  results.push({ title, intent: kw.intent, risk: assess.risk });
  const co = assess.risk === 'red' ? ' (CỜ ĐỎ, cấp quản lý duyệt)' : assess.risk === 'amber' ? ' (amber, cần rà)' : '';
  console.log(`- [${INTENT_LABEL[kw.intent] || kw.intent}] ${title}${co}`);
}

await logRun(client, {
  task: 'mkt.content_run',
  status: 'ok',
  detail: { generated: results.length, items: results },
});

console.log(`\nXong. ${results.length} bài đã vào mkt_content và hàng đợi duyệt, chờ người bấm Duyệt.`);
