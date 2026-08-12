// run-content.mjs — chạy cỗ máy nội dung một lượt.
// Chạy: npm run content:run           (sinh mặc định 3 bài)
//       node packages/marketing/src/run-content.mjs 5
//
// Luồng: chọn từ khóa ưu tiên cao chưa có bài -> sinh brief và draft -> quét tuân thủ ->
// lưu mkt_content (status draft, cờ needs_gov_review nếu chạm quy định) -> đẩy approval_queue.
// Không đăng gì. Người duyệt bấm Duyệt thì worker mới đăng (viết sau).

import { getServiceClient, logRun } from '@sdvico/core';
import { generateAllFormats, INTENT_LABEL } from './content.mjs';
import { assessDraft } from './compliance.mjs';
import { knownFactValues, testFactValues } from './product-facts.mjs';
import { loadFacts } from './facts.mjs';

const limit = Number(process.argv[2]) || 3;
const client = getServiceClient();
const facts = await loadFacts(client); // nguồn dữ kiện từ bảng product_facts
const known = knownFactValues(facts);
const testVals = testFactValues(facts);

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

console.log(`Sẽ viết ${chosen.length} từ khóa, mỗi từ khóa 3 định dạng (website, Facebook, video).\n`);

// Ba định dạng và kênh đích tương ứng.
const FORMATS = [
  { key: 'article', kind: 'article', channel: 'website', label: 'Website' },
  { key: 'social', kind: 'social', channel: 'facebook', label: 'Facebook' },
  { key: 'video', kind: 'video', channel: 'youtube', label: 'Video' },
];

const results = [];
for (const kw of chosen) {
  const all = await generateAllFormats(kw, { facts });
  const flags = [];

  for (const fmt of FORMATS) {
    const piece = all[fmt.key]; // { title, draft }
    const assess = assessDraft(`${piece.title}\n${piece.draft}`, { knownFactValues: known, testFactValues: testVals });
    const briefFull = { ...all.brief, format: fmt.key, risk: assess.risk, compliance: assess.flags };

    const { data: inserted, error: e1 } = await client
      .from('mkt_content')
      .insert({
        kind: fmt.kind,
        title: piece.title,
        brief: briefFull,
        draft: piece.draft,
        status: assess.risk === 'red' ? 'review' : 'draft',
        needs_gov_review: assess.risk === 'red',
      })
      .select('id')
      .single();
    if (e1) throw new Error('Lưu mkt_content lỗi: ' + e1.message);

    const { error: e2 } = await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `[${fmt.label}] ${piece.title}`,
      payload: {
        content_id: inserted.id,
        format: fmt.key,
        channel: fmt.channel,
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

    results.push({ title: piece.title, format: fmt.key, risk: assess.risk });
    if (assess.risk !== 'none') flags.push(`${fmt.label}:${assess.risk}`);
  }

  const gen = all.brief?.generator === 'gemini' ? 'Gemini' : 'bản mẫu';
  const co = flags.length ? ' (' + flags.join(', ') + ')' : '';
  console.log(`- [${INTENT_LABEL[kw.intent] || kw.intent}] ${kw.keyword} -> 3 bản bằng ${gen}${co}`);
}

await logRun(client, {
  task: 'mkt.content_run',
  status: 'ok',
  detail: { generated: results.length, items: results },
});

console.log(`\nXong. ${results.length} bản (${chosen.length} từ khóa x 3 định dạng) đã vào hàng đợi duyệt.`);
