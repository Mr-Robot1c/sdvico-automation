// test-price-teaser.mjs — kiểm luật giá úp mở (Thanh chốt 8/9/2026): bài công khai không được có số
// tiền chính xác, chỉ mốc "9,X triệu"; cảnh cuối video có câu giá đọc được. Chạy: npm run test:price
// Không cần mạng, không cần GEMINI_API_KEY.
import { PRICE_TEASER, redactExactPrices, ensurePriceTeaser, ensureSpokenTeaser, publicName, isPhotoOnlyGroup, isDiscontinuedGroup } from './products.mjs';
import { scanStyle } from './brand-voice-check.mjs';
import { guardViolations } from './product-guard.mjs';
import { assessDraft } from './compliance.mjs';
import { PRODUCT_FACTS, knownFactValues, testFactValues } from './product-facts.mjs';

const G9 = '9. Máy Lọc Dầu Diesel SD12-300';
const G2 = '2. Máy lọc nước biển SEA-40';
const cases = [];
const eq = (name, got, want) => cases.push({ name, ok: got === want, got, want });
const ok = (name, cond, got) => cases.push({ name, ok: !!cond, got });

eq('redact 9.900.000', redactExactPrices('còn 9.900.000 đ'), 'còn 9,X triệu');
eq('redact 42 triệu', redactExactPrices('máy điện 42 triệu'), 'máy điện 4X triệu');
eq('redact 9,9 triệu', redactExactPrices('chỉ 9,9 triệu'), 'chỉ 9,X triệu');
eq('giữ 12 triệu', redactExactPrices('từ 12 triệu'), 'từ 12 triệu');
eq('giữ 7 triệu', redactExactPrices('giảm 7 triệu'), 'giảm 7 triệu');
eq('giữ số điện thoại', redactExactPrices('gọi 1900 23 23 49'), 'gọi 1900 23 23 49');
ok('ensure chèn khi thiếu', ensurePriceTeaser('Hook.\n\nThân bài.\n\nAnh đi mấy ngày một chuyến?', PRICE_TEASER[G9]).includes('9,X triệu'));
ok('ensure không chèn đôi', (ensurePriceTeaser(`Hook. ${PRICE_TEASER[G9].text}. Hỏi?`, PRICE_TEASER[G9]).match(/9,X triệu/g) || []).length === 1);
eq('ensure không teaser', ensurePriceTeaser('Bài content.', null), 'Bài content.');
ok('spoken nối cảnh cuối', ensureSpokenTeaser('Dầu sạch, máy khỏe!', PRICE_TEASER[G9]).endsWith(PRICE_TEASER[G9].spoken));
ok('spoken không nối đôi', (ensureSpokenTeaser(PRICE_TEASER[G2].spoken, PRICE_TEASER[G2]).match(/hơn 30 triệu/g) || []).length === 1);
ok('spoken chặn số', !/9\.900\.000/.test(ensureSpokenTeaser('Giá 9.900.000 đ nha.', PRICE_TEASER[G9])));
eq('tên công khai', publicName(G9), 'Máy lọc dầu SF300B');
for (const [g, t] of Object.entries(PRICE_TEASER)) {
  for (const f of ['text', 'spoken', 'badge']) {
    ok(`style sạch ${g.slice(0, 2)} ${f}`, scanStyle(t[f]).length === 0, scanStyle(t[f]));
    ok(`không số chính xác ${g.slice(0, 2)} ${f}`, !/\d{1,3}(\.\d{3}){2,}/.test(t[f]));
  }
}
ok('guard bắt 9.900.000 công khai', guardViolations('Máy lọc dầu SF300B giá 9.900.000 đ', 'lọc dầu').length > 0);
ok('guard bắt 42 triệu', guardViolations('SEA-40 máy điện 42 triệu', 'lọc nước').length > 0);
ok('guard tha 9,X triệu', guardViolations('Máy lọc dầu SF300B còn 9,X triệu', 'lọc dầu').length === 0);
const facts = { knownFactValues: knownFactValues(PRODUCT_FACTS), testFactValues: testFactValues(PRODUCT_FACTS) };
eq('compliance không cờ SF300B', assessDraft('Máy lọc dầu SF300B. Tháng 9 từ 12 triệu giảm còn 9,X triệu.', facts).flags.unverifiedSpecs.length, 0);
// 8/9 tối: chỉ SEA-40 và SF300B dựng video; SF-50 ngừng bán.
ok('SEA-40 có video', !isPhotoOnlyGroup(G2));
ok('SF300B có video', !isPhotoOnlyGroup(G9));
ok('Ắc quy bài ảnh', isPhotoOnlyGroup('7. Ắc quy Accu Nano SDViCo'));
ok('SF-50 ngừng bán', isDiscontinuedGroup('6. Thiết bị lọc dầu SF-50'));

let fail = 0;
for (const c of cases) {
  if (!c.ok) fail++;
  console.log(`${c.ok ? 'ĐẠT ' : 'SAI '} ${c.name}${c.ok ? '' : ' -> ' + JSON.stringify(c.got) + (c.want !== undefined ? ' (muốn ' + JSON.stringify(c.want) + ')' : '')}`);
}
console.log(`\nKết quả: ${cases.length - fail}/${cases.length} đạt.`);
process.exit(fail ? 1 : 0);
