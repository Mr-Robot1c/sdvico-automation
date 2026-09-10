// test-price-teaser.mjs — kiểm luật giá úp mở (Thanh chốt 8/9/2026): bài công khai không được có số
// tiền chính xác, chỉ mốc "9,X triệu"; cảnh cuối video có câu giá đọc được. Chạy: npm run test:price
// Không cần mạng, không cần GEMINI_API_KEY.
import { PRICE_TEASER, redactExactPrices, ensurePriceTeaser, ensureSpokenTeaser, publicName, isPhotoOnlyGroup, isDiscontinuedGroup, commentCta, ensureCommentCta, SHOPEE_LINK, shopeeLink, ensureShopeeLink } from './products.mjs';
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
ok('spoken không nối đôi', (ensureSpokenTeaser(PRICE_TEASER[G2].spoken, PRICE_TEASER[G2]).match(/3 X triệu/g) || []).length === 1);
ok('spoken chặn số', !/9\.900\.000/.test(ensureSpokenTeaser('Giá 9.900.000 đ nha.', PRICE_TEASER[G9])));
eq('tên công khai', publicName(G9), 'Máy lọc dầu SF300B');
// 10/9 (Thanh): câu giá cảnh cuối CHỈ nói giá; kêu bình luận / nhắn Page / gọi số nằm ở OUTRO (build-video.mjs).
for (const [g, t] of Object.entries(PRICE_TEASER)) {
  ok(`spoken chỉ nói giá ${g.slice(0, 2)}`, !/bình luận|nhắn Page|cmt|gọi số/i.test(t.spoken), t.spoken);
}
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
eq('compliance không cờ SF300B', assessDraft('Máy lọc dầu SF300B. Bộ lọc dầu từ 9,X triệu.', facts).flags.unverifiedSpecs.length, 0);
// 8/9 tối: chỉ SEA-40 và SF300B dựng video; SF-50 ngừng bán.
ok('SEA-40 có video', !isPhotoOnlyGroup(G2));
ok('SF300B có video', !isPhotoOnlyGroup(G9));
ok('Ắc quy bài ảnh', isPhotoOnlyGroup('7. Ắc quy Accu Nano SDViCo'));
ok('SF-50 ngừng bán', isDiscontinuedGroup('6. Thiết bị lọc dầu SF-50'));
// 9/9 (Thanh): câu cuối bài bán = kêu cmt từ khóa để Kinh doanh tư vấn.
eq('CTA chủ lực', commentCta(G9), 'Anh em cmt "lọc dầu" hay "lọc nước" để em tư vấn cho anh em nhé!');
eq('CTA SEA-40 dùng chung', commentCta(G2), commentCta(G9));
eq('CTA ắc quy', commentCta('7. Ắc quy Accu Nano SDViCo'), 'Anh em cmt "ắc quy" để em tư vấn cho anh em nhé!');
ok('CTA style sạch', scanStyle(commentCta(G9)).length === 0, scanStyle(commentCta(G9)));
ok('ensureCommentCta nối cuối', ensureCommentCta('Hook.\n\nThân bài.', commentCta(G9)).endsWith(commentCta(G9)));
ok('ensureCommentCta không nối đôi', (ensureCommentCta(`Hook.\n\n${commentCta(G9)}`, commentCta(G9)).match(/cmt "/g) || []).length === 1);
{
  const full = ensureCommentCta(ensurePriceTeaser('Hook.\n\nThân bài.\n\nAnh đi mấy ngày một chuyến?', PRICE_TEASER[G9]), commentCta(G9));
  const lines = full.trim().split('\n');
  eq('thứ tự: CTA là dòng cuối', lines[lines.length - 1], commentCta(G9));
  ok('thứ tự: câu giá đứng trước CTA', full.indexOf('9,X triệu') < full.indexOf('Anh em cmt'));
}

// 9/9 (Thanh): link Shopee trong bài bán, đứng trước CTA cmt, không chèn đôi, nhóm khác không có.
eq('shopee link lọc nước', shopeeLink(G2), 'https://shopee.vn/product/212723941/45017630539/');
eq('shopee link lọc dầu', shopeeLink(G9), 'https://shopee.vn/product/212723941/29945752663/');
eq('shopee không link ắc quy', shopeeLink('7. Ắc quy Accu Nano SDViCo'), null);
eq('shopee không link thì nguyên văn', ensureShopeeLink('Bài.', null), 'Bài.');
ok('shopee nối cuối', ensureShopeeLink('Hook.\n\nThân bài.', SHOPEE_LINK[G9]).endsWith(SHOPEE_LINK[G9]));
ok('shopee không nối đôi', (ensureShopeeLink(`Hook.\n\nĐặt trên Shopee: ${SHOPEE_LINK[G9]}`, SHOPEE_LINK[G9]).match(/shopee\.vn/g) || []).length === 1);
ok('shopee redact không đụng link', redactExactPrices(`Đặt: ${SHOPEE_LINK[G2]}`).includes(SHOPEE_LINK[G2]));
for (const l of Object.values(SHOPEE_LINK)) ok('shopee style sạch ' + l.slice(-12), scanStyle('Đặt trên Shopee, giao tận nơi: ' + l).length === 0, scanStyle('Đặt trên Shopee, giao tận nơi: ' + l));
{
  const full = ensureCommentCta(ensureShopeeLink(ensurePriceTeaser('Hook.\n\nThân bài.\n\nAnh đi mấy ngày một chuyến?', PRICE_TEASER[G9]), SHOPEE_LINK[G9]), commentCta(G9));
  const lines = full.trim().split('\n');
  eq('thứ tự: CTA vẫn là dòng cuối sau link', lines[lines.length - 1], commentCta(G9));
  ok('thứ tự: giá trước link trước CTA', full.indexOf('9,X triệu') < full.indexOf('shopee.vn') && full.indexOf('shopee.vn') < full.indexOf('Anh em cmt'));
  eq('shopee chạy lại không đổi', ensureShopeeLink(full, SHOPEE_LINK[G9]), full);
  const withCta = ensureShopeeLink(`Hook.\n\n${commentCta(G9)}`, SHOPEE_LINK[G9]).trim().split('\n');
  eq('shopee chèn trước CTA sẵn có', withCta[withCta.length - 1], commentCta(G9));
}

// 9/9 chiều (2) (Thanh chốt lại): câu giật tít có mốc neo 45 / 56 / 12 triệu, vẫn KHÔNG số chính xác 38/49/9,9.
ok('teaser lọc nước mốc neo', /giảm từ 45 triệu còn 3X triệu/.test(PRICE_TEASER[G2].text) && /giảm từ 56 triệu còn 4X triệu/.test(PRICE_TEASER[G2].text), PRICE_TEASER[G2].text);
ok('teaser lọc nước có công lắp + lõi lọc', /đã gồm công lắp/.test(PRICE_TEASER[G2].text) && /10 lõi lọc thô/.test(PRICE_TEASER[G2].text));
eq('teaser lọc dầu mốc neo', PRICE_TEASER[G9].text, 'Bộ lọc dầu giảm từ 12 triệu còn 9,X triệu');
eq('redact giữ mốc neo 45/56', redactExactPrices(PRICE_TEASER[G2].text), PRICE_TEASER[G2].text);
eq('redact giữ mốc neo 12', redactExactPrices(PRICE_TEASER[G9].text), PRICE_TEASER[G9].text);
for (const [g, tz] of Object.entries(PRICE_TEASER)) {
  for (const f of ['text', 'spoken', 'badge']) ok(`không số chính xác 38/49/9,9 ${g.slice(0, 2)} ${f}`, !/\b(38|49)\s*triệu|9[,.]9\s*triệu|\d{1,3}\.\d{3}\.\d{3}/i.test(tz[f]), tz[f]);
}
ok('spoken lọc nước đọc mốc neo nguyên văn', /giảm từ 45 triệu chỉ còn 3 X triệu/.test(PRICE_TEASER[G2].spoken) && /giảm từ 56 triệu chỉ còn 4 X triệu/.test(PRICE_TEASER[G2].spoken) && !/hơn 40 triệu|hơn 30 triệu/.test(PRICE_TEASER[G2].spoken));
ok('spoken lọc dầu đọc mốc neo nguyên văn', /giảm từ 12 triệu chỉ còn 9 phẩy X triệu/.test(PRICE_TEASER[G9].spoken));

let fail = 0;
for (const c of cases) {
  if (!c.ok) fail++;
  console.log(`${c.ok ? 'ĐẠT ' : 'SAI '} ${c.name}${c.ok ? '' : ' -> ' + JSON.stringify(c.got) + (c.want !== undefined ? ' (muốn ' + JSON.stringify(c.want) + ')' : '')}`);
}
console.log(`\nKết quả: ${cases.length - fail}/${cases.length} đạt.`);
process.exit(fail ? 1 : 0);
