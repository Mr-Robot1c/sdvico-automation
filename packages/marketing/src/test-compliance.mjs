// test-compliance.mjs — kiểm thử hàng rào tuân thủ, chạy offline, không đụng mạng.
// Chạy: node packages/marketing/src/test-compliance.mjs
//
// Năm ca: sạch, chạm quy định (đỏ), bịa thông số lạ (amber), nhắc đối tác (amber),
// và dùng thông số TEST trong allowlist (amber, phải gắn cảnh báo test, không được sạch).

import { assessDraft } from './compliance.mjs';
import { PRODUCT_FACTS, knownFactValues, testFactValues } from './product-facts.mjs';

const known = knownFactValues(PRODUCT_FACTS);
const testVals = testFactValues(PRODUCT_FACTS);
const opts = { knownFactValues: known, testFactValues: testVals };

const cases = [
  {
    ten: 'Sạch, tin hậu mãi chung chung',
    text: 'Chào anh chị, SDVICO hỏi thăm sau một tháng lắp thiết bị giám sát hành trình. Gọi 1900 23 23 49 để được hỗ trợ.',
    mong: 'none',
  },
  {
    ten: 'Chạm quy định nhà nước',
    text: 'Tàu từ 15 mét phải lắp giám sát, mất kết nối có thể bị xử phạt theo nghị định. EU vẫn giữ thẻ vàng IUU, Cục Thủy sản đang siết.',
    mong: 'red',
  },
  {
    ten: 'Bịa model và thông số lạ chưa xác nhận',
    text: 'Máy lọc dầu SF-50 công suất 40 L/h, bo mạch định vị chuẩn kháng nước IP69.',
    mong: 'amber',
  },
  {
    ten: 'Nhắc phần mềm đối tác',
    text: 'SDVICO cung cấp phần mềm S-Tracking của Viettel giúp theo dõi tàu.',
    mong: 'amber',
  },
  {
    ten: 'Dùng thông số TEST trong allowlist (phải cảnh báo test)',
    text: 'Thiết bị GS-TEST-01 đạt chuẩn kháng nước IP67, pin 10000 mAh.',
    mong: 'amber',
  },
];

let pass = 0;
for (const c of cases) {
  const r = assessDraft(c.text, opts);
  const ok = r.risk === c.mong;
  if (ok) pass++;
  console.log(`[${ok ? 'ĐẠT' : 'SAI'}] ${c.ten}`);
  console.log(`   risk = ${r.risk} (mong đợi ${c.mong}), cần cấp quản lý: ${r.needsManagerApproval}`);
  const f = r.flags;
  if (f.regulation.length) console.log(`   quy định: ${f.regulation.join(', ')}`);
  if (f.partner.length) console.log(`   đối tác: ${f.partner.join(', ')}`);
  if (f.unverifiedSpecs.length) console.log(`   thông số lạ chưa xác nhận: ${f.unverifiedSpecs.join(', ')}`);
  if (f.testSpecs.length) console.log(`   thông số TEST (chưa xác nhận): ${f.testSpecs.join(', ')}`);
  console.log('');
}

console.log(`Kết quả: ${pass}/${cases.length} ca đạt.`);
process.exit(pass === cases.length ? 0 : 1);
