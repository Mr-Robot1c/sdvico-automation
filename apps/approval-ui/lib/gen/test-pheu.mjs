// test-pheu.mjs — kiểm phễu khách hỏi đến chốt (24/9): phân loại câu hỏi, luật 3 chạm nhắc lại,
// nội dung tin nhắc, khung trả lời + tâm lý khách. Chạy: npm run test:pheu (không mạng, không API key).
import { guessIntent, INTENTS, INTENT_LABEL } from './lead-intent.mjs';
import { nextTouch, buildFollowupBody, followupNote, TOUCHES } from './followup-rules.mjs';
import { REPLY_FRAME, CUSTOMER_PSYCHOLOGY } from './reply-playbook.mjs';
import { PRICE_TEASER, PRODUCTS } from './products.mjs';
import { assessDraft } from './compliance.mjs';
import { PRODUCT_FACTS, knownFactValues, testFactValues } from './product-facts.mjs';

const cases = [];
const eq = (name, got, want) => cases.push({ name, ok: got === want, got, want });
const ok = (name, cond, got) => cases.push({ name, ok: !!cond, got });

// 1. Phân loại câu hỏi
eq('intent: giá bao nhiêu', guessIntent('máy này giá bao nhiêu vậy'), 'gia');
eq('intent: không dấu', guessIntent('gia bao nhieu v shop'), 'gia');
eq('intent: lắp ở', guessIntent('lắp ở Vũng Tàu được không'), 'lap_dat');
eq('intent: bảo hành', guessIntent('bảo hành mấy năm'), 'bao_hanh');
eq('intent: so sánh', guessIntent('so với hàng Nhật thì sao'), 'so_sanh');
eq('intent: kỹ thuật', guessIntent('tàu 15m máy 400cv xài được không'), 'ky_thuat');
eq('intent: "gia đình" không ra giá', guessIntent('gia đình tôi làm nghề biển'), 'khac');
eq('intent: chấm', guessIntent('.'), 'khac');
eq('intent: ưu tiên giá', guessIntent('giá bao nhiêu, chạy dầu gì'), 'gia');
eq('intent: rỗng', guessIntent(''), 'khac');
eq('intent: null', guessIntent(null), 'khac');
eq('intent: bao nhiêu lít là kỹ thuật', guessIntent('máy lọc được bao nhiêu lít một giờ'), 'ky_thuat');
ok('INTENTS 6 giá trị, đủ nhãn', INTENTS.length === 6 && INTENTS.every((i) => INTENT_LABEL[i]));

// 2. Luật 3 chạm
const NOW = new Date('2026-09-24T12:00:00Z');
const ago = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
const nt = (o) => nextTouch({ status: 'contacted', doneTouches: [], hasPending: false, now: NOW, ...o });
eq('touch: 25h chưa nháp -> 1', nt({ updatedAt: ago(25) }), 1);
eq('touch: 25h có pending -> null', nt({ updatedAt: ago(25), hasPending: true }), null);
eq('touch: 80h đã chạm 1 -> 2', nt({ updatedAt: ago(80), doneTouches: [1] }), 2);
eq('touch: 200h đã chạm 1+2 -> 3', nt({ updatedAt: ago(200), doneTouches: [1, 2] }), 3);
eq('touch: đủ 3 -> null', nt({ updatedAt: ago(500), doneTouches: [1, 2, 3] }), null);
eq('touch: 200h chưa chạm nào -> 1 (không dồn)', nt({ updatedAt: ago(200) }), 1);
eq('touch: won -> null', nt({ status: 'won', updatedAt: ago(200) }), null);
eq('touch: lost -> null', nt({ status: 'lost', updatedAt: ago(200) }), null);
eq('touch: new -> null', nt({ status: 'new', updatedAt: ago(200) }), null);
eq('touch: 10h -> null', nt({ updatedAt: ago(10) }), null);
eq('touch: 50h đã chạm 1 chưa tới mốc 72h -> null', nt({ updatedAt: ago(50), doneTouches: [1] }), null);
ok('TOUCHES đúng 3 mốc 24/72/168', TOUCHES.map((t) => t.afterHours).join() === '24,72,168');

// 3. Nội dung tin nhắc
const BAD = /[—–→•*#>]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const G9 = '9. Máy Lọc Dầu Diesel SD12-300';
const G2 = '2. Máy lọc nước biển SEA-40';
const G3 = '3. Thiết bị giám sát hành trình Viettel S-Tracking';
const groups = [null, ...PRODUCTS.map((p) => p.group)];
for (const g of groups) {
  for (const t of [1, 2, 3]) {
    const b = buildFollowupBody({ touch: t, customerName: 'Minh', group: g });
    const tag = `${g ? g.slice(0, 3) : 'null'} chạm ${t}`;
    ok(`follow-up ${tag}: không ký tự cấm`, !BAD.test(b), b);
    ok(`follow-up ${tag}: dưới 500 ký tự`, b.length < 500, b.length);
    ok(`follow-up ${tag}: không undefined/null`, !/undefined|null/.test(b), b);
    const a = assessDraft(b, { knownFactValues: knownFactValues(PRODUCT_FACTS), testFactValues: testFactValues(PRODUCT_FACTS) });
    ok(`follow-up ${tag}: qua quét tuân thủ`, a.risk === 'none', JSON.stringify(a.flags));
  }
}
ok('chạm 3 có tổng đài', buildFollowupBody({ touch: 3, group: null }).includes('1900 23 23 49'));
ok('chạm 2 chứa nguyên văn teaser (lọc dầu)', buildFollowupBody({ touch: 2, group: G9 }).includes(PRICE_TEASER[G9].text));
ok('chạm 2 chứa nguyên văn teaser (lọc nước)', buildFollowupBody({ touch: 2, group: G2 }).includes(PRICE_TEASER[G2].text));
ok('chạm 2 không group thì không có giá', !/triệu/.test(buildFollowupBody({ touch: 2, group: null })));
ok('chạm 1 gọi tên khách', buildFollowupBody({ touch: 1, customerName: 'Minh', group: null }).startsWith('Chào Minh,'));
ok('chạm 1 không tên thì "Chào anh chị,"', buildFollowupBody({ touch: 1, customerName: '', group: null }).startsWith('Chào anh chị,'));
ok('SF300B dùng tên công khai, không lộ SD12-300', !/SD12/.test(buildFollowupBody({ touch: 1, group: G9 })) && /SF300B/.test(buildFollowupBody({ touch: 1, group: G9 })));
ok('S-Tracking không gắn vào lời SDVICO', !/S-Tracking/.test(buildFollowupBody({ touch: 1, group: G3 })));
ok('ghi chú người gửi chạm 2 nhắc đính kèm clip', /clip/.test(followupNote(2)));

// 4. Khung trả lời + tâm lý khách
ok('REPLY_FRAME + CUSTOMER_PSYCHOLOGY dưới 6.000 ký tự', (REPLY_FRAME + CUSTOMER_PSYCHOLOGY).length < 6000, (REPLY_FRAME + CUSTOMER_PSYCHOLOGY).length);
ok('REPLY_FRAME không ký tự cấm', !BAD.test(REPLY_FRAME), REPLY_FRAME.match(BAD)?.[0]);
ok('CUSTOMER_PSYCHOLOGY không ký tự cấm', !BAD.test(CUSTOMER_PSYCHOLOGY), CUSTOMER_PSYCHOLOGY.match(BAD)?.[0]);
ok('CUSTOMER_PSYCHOLOGY ghi rõ không phải số liệu SDVICO', CUSTOMER_PSYCHOLOGY.includes('không phải số liệu SDVICO'));
ok('REPLY_FRAME có 3 nhịp', /1\. BẮT ĐÚNG Ý/.test(REPLY_FRAME) && /2\. NEO LỢI ÍCH/.test(REPLY_FRAME) && /3\. MỞ BƯỚC KẾ/.test(REPLY_FRAME));

const fail = cases.filter((c) => !c.ok);
for (const c of fail) console.log(`FAIL  ${c.name}  got=${JSON.stringify(c.got)}${'want' in c ? `  want=${JSON.stringify(c.want)}` : ''}`);
console.log(`${cases.length - fail.length}/${cases.length} test pheu ${fail.length ? 'CÓ LỖI' : 'xanh'}`);
process.exit(fail.length ? 1 : 0);
