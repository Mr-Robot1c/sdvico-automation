// test-catalog-rules.mjs — kiểm 21/10: bài Facebook đọc catalog product_facts, luật kết bài bán không còn tự mâu
// thuẫn, máy kiểm không gắn cờ tên sản phẩm, sản phẩm ngừng bán không sinh bài. Chạy: npm run test:catalog
// (không mạng, không API key).
import { scanPlaybook, scanUnverifiedSpecs, assessDraft } from './compliance.mjs';
import { knownFactValues, testFactValues, factsForGroup, loadProductFacts, PRODUCT_FACTS } from './product-facts.mjs';
import { generateSocialPost } from './social.mjs';

const cases = [];
const ok = (name, cond, got) => cases.push({ name, ok: !!cond, got });

// Mẫu catalog như bảng product_facts (Catalog SDVICO 2026, Thanh giao).
const CATALOG = [
  { category: '2. Máy lọc nước biển SEA-40', model: 'SEA-40', attribute: 'công suất lọc', value: 'Khoảng 250 lít/giờ, màng lọc 4040', verified: true },
  { category: '2. Máy lọc nước biển SEA-40', model: 'SEA-40', attribute: 'cụm motor', value: '2,2 kW, 1 pha 220 V hoặc 3 pha 380 V', verified: true },
  { category: '3. Thiết bị giám sát hành trình Viettel S-Tracking', model: 'S-Tracking', attribute: 'tính năng', value: 'Chống nước chuẩn IP67', verified: true },
  { category: 'Thiết bị giám sát hành trình Vifish.24', model: 'Vifish.24', attribute: 'tính năng', value: 'Định vị GPS', verified: true },
  { category: 'giam_sat_hanh_trinh', model: 'GS-TEST-01', attribute: 'khang_nuoc', value: 'IP67', verified: false },
];
const known = knownFactValues(CATALOG);

// 1. Luật kết bài bán
const sale = 'Nước cạn giữa chuyến, 10 ngày.\nMáy lọc 250 lít/giờ.\nMáy cơ tầm 3X triệu.\nAnh em cmt "lọc nước" để em tư vấn cho anh em nhé!';
ok('bài bán kết bằng câu mời cmt: không lỗi thiếu câu hỏi', !scanPlaybook(sale, { kind: 'sales' }).violations.includes('no_question_cta'));
ok('bài bán không câu mời, không câu hỏi: vẫn báo lỗi', scanPlaybook('Hook 5 lít.\nThân bài.\nGiá 3X triệu.', { kind: 'sales' }).violations.includes('no_question_cta'));
ok('bài content vẫn bắt câu hỏi kết', scanPlaybook(sale, { kind: 'content' }).violations.includes('no_question_cta'));

// 2. Máy kiểm thông số
ok('thông số đúng catalog không bị cờ', scanUnverifiedSpecs('SEA-40 làm 250 lít/giờ, màng 4040, motor 2,2 kW', known).length === 0, scanUnverifiedSpecs('SEA-40 làm 250 lít/giờ, màng 4040, motor 2,2 kW', known));
ok('IP67 của S-Tracking đúng catalog', scanUnverifiedSpecs('S-Tracking chống nước IP67', known).length === 0);
ok('tên sản phẩm danh mục không bị cờ (MNB-01, MNB01, SD12-300, SF300B, XT-Pro)', scanUnverifiedSpecs('Thuraya MNB-01, MNB01, SD12-300, SF300B, XT-Pro', known).length === 0, scanUnverifiedSpecs('Thuraya MNB-01, MNB01, SD12-300, SF300B, XT-Pro', known));
ok('thông số bịa vẫn bị cờ', scanUnverifiedSpecs('máy 999 W, chuẩn IP68', known).length === 2, scanUnverifiedSpecs('máy 999 W, chuẩn IP68', known));
ok('dòng TEST vẫn bị cờ test', assessDraft('chuẩn IP67', { knownFactValues: known, testFactValues: testFactValues(CATALOG) }).flags.testSpecs.length === 1);

// 3. Lọc catalog theo nhóm: bỏ STT, chỉ verified
ok('factsForGroup khớp có/không STT', factsForGroup(CATALOG, 'Máy lọc nước biển SEA-40').length === 2 && factsForGroup(CATALOG, '2. Máy lọc nước biển SEA-40').length === 2);
ok('factsForGroup không lấy dòng TEST', factsForGroup(CATALOG, 'giam_sat_hanh_trinh').length === 0);
ok('factsForGroup không lẫn nhóm khác', factsForGroup(CATALOG, '3. Thiết bị giám sát hành trình Viettel S-Tracking').every((f) => f.model === 'S-Tracking'));

// 4. Đọc catalog từ DB
const fakeClient = (data, error = null) => ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data, error }) }) }) }) });
ok('loadProductFacts đọc bảng', (await loadProductFacts(fakeClient(CATALOG))).length === CATALOG.length);
ok('bảng rỗng -> lùi mảng tĩnh', (await loadProductFacts(fakeClient([]))) === PRODUCT_FACTS);
ok('lỗi DB -> lùi mảng tĩnh', (await loadProductFacts(fakeClient(null, { message: 'x' }))) === PRODUCT_FACTS);
ok('không client -> mảng tĩnh', (await loadProductFacts(null)) === PRODUCT_FACTS);

// 5. Sản phẩm ngừng bán: chặn trước khi gọi model (không cần mạng)
let threw = '';
try { await generateSocialPost({ productGroup: '6. Thiết bị lọc dầu SF-50', productName: 'SF-50', channel: 'facebook', hasVideo: false }); }
catch (e) { threw = String(e?.message || e); }
ok('SF-50 ngừng bán -> không sinh bài', /ngừng bán/.test(threw), threw);

const fail = cases.filter((c) => !c.ok);
for (const c of fail) console.log(`FAIL  ${c.name}  got=${JSON.stringify(c.got)}`);
console.log(`${cases.length - fail.length}/${cases.length} test catalog ${fail.length ? 'CÓ LỖI' : 'xanh'}`);
process.exit(fail.length ? 1 : 0);
