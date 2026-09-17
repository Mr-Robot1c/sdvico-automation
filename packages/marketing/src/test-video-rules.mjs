// test-video-rules.mjs — kiểm luật soát kịch bản video 17/9 (sau khi ChatGPT chấm 3 video theo prompt
// 10 tiêu chí): không nhắc sản phẩm khác, không phần trăm không nguồn, cụm sáo mới, outro 1 hành động,
// tách cảnh giá, phụ đề ngắn dòng. Chạy: npm run test:video. Không cần mạng, không cần GEMINI_API_KEY.
import {
  CROSS_PRODUCT_TERMS, crossProductTerms, crossProductViolations, percentNumbers, unsourcedPercents,
  stripSentencesWith, EXTRA_WORN, outroText, outroScreenKeyword, splitPriceScene, splitLongImageScenes, splitNarrationMiddle,
} from './video/rules.mjs';
import { buildBlocks, MAX_CHARS } from './video/srt.mjs';
import { PRICE_TEASER, outroKeyword, CONTENT_GROUP } from './products.mjs';
import { scanStyle } from './brand-voice-check.mjs';

const G9 = '9. Máy Lọc Dầu Diesel SD12-300';
const G2 = '2. Máy lọc nước biển SEA-40';
const cases = [];
const eq = (name, got, want) => cases.push({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
const ok = (name, cond, got) => cases.push({ name, ok: !!cond, got });

// 1. Sản phẩm khác (video lọc nước 7e9cab1a đọc "lọc dầu ngao ngán dưới khoang tàu").
eq('lọc nước: bắt "lọc dầu"', crossProductViolations('Lọc dầu ngao ngán lúc đứng dưới khoang tàu.', G2), ['lọc dầu']);
eq('lọc dầu: bắt "nước ngọt" (492313ac mở màn nước ngọt)', crossProductViolations('Lúc ra khơi đầy ắp nước ngọt, lúc về bến hầm chứa cạn khô', G9), ['nước ngọt']);
eq('lọc dầu: "tách nước trong dầu" KHÔNG bị bắt (tính năng SF300B)', crossProductViolations('Máy tách nước lẫn trong dầu, kim phun sạch.', G9), []);
eq('lọc dầu: bắt "ca nước" (492313ac dựng lại vẫn chia từng ca nước)', crossProductViolations('tàu mình loay hoay chia từng ca nước để rửa máy lọc', G9), ['ca nước']);
eq('lọc nước: câu sạch', crossProductViolations('Nước ngọt lọc ra dùng thoải mái cả chuyến.', G2), []);
eq('content: không có nhóm -> không bắt', crossProductViolations('lọc dầu lọc nước gì cũng nói', CONTENT_GROUP), []);
ok('SF-50 dùng chung luật với SD12-300', crossProductTerms('6. Thiết bị lọc dầu SF-50') === CROSS_PRODUCT_TERMS[G9]);

// 2. Phần trăm không nguồn (492313ac: "ngốn gần 40 phần trăm chi phí chuyến đi").
eq('bắt 40 phần trăm không nguồn', unsourcedPercents('Tiền dầu ngốn gần 40 phần trăm chi phí chuyến đi rồi!', ['Bài nói về dầu, không số']), ['40 phần trăm']);
eq('bắt 40% không nguồn', unsourcedPercents('ngốn 40% chi phí', []), ['40%']);
eq('cho qua khi bài nguồn có', unsourcedPercents('lọc sạch bớt 10% dầu', ['tài liệu: bớt 5 tới 10% (SF300B)']), []);
eq('khoảng "5 tới 10%" cho cả 2 số', [...percentNumbers('bớt 5 tới 10%')], ['5', '10']);
eq('không số -> rỗng', unsourcedPercents('Máy chạy êm, dầu sạch.', []), []);
eq('số điện thoại không bị coi là %', unsourcedPercents('gọi 0939 243 222 nha', []), []);

// 3. Cắt câu dự phòng.
eq('cắt câu chứa cụm', stripSentencesWith('Dầu bẩn hại máy. Nước ngọt đầy khoang! Lắp xong yên tâm.', ['nước ngọt']), 'Dầu bẩn hại máy. Lắp xong yên tâm.');
eq('không cụm -> giữ nguyên', stripSentencesWith('A. B.', []), 'A. B.');

// 4. Cụm sáo ChatGPT chỉ ra phải nằm trong EXTRA_WORN.
for (const p of ['thuận buồm xuôi gió', 'xót cả ruột', 'hại lắm nha', 'bảo vệ sức khỏe', 'lăn lộn', 'ngao ngán']) {
  ok(`EXTRA_WORN có "${p}"`, EXTRA_WORN.includes(p));
}
ok('EXTRA_WORN đều chữ thường', EXTRA_WORN.every((p) => p === p.toLowerCase()));

// 5. Outro một hành động (user 17/9): chỉ "bình luận", không nhắn Page, không đọc số, một "nha", một câu.
for (const g of [G9, G2, CONTENT_GROUP]) {
  const t = outroText(outroKeyword(g));
  ok(`outro ${g.slice(0, 2)} chỉ bình luận`, /^Bình luận /.test(t) && !/Page|gọi|0939|nhắn/i.test(t), t);
  ok(`outro ${g.slice(0, 2)} một câu một "nha"`, (t.match(/nha!/g) || []).length === 1 && (t.match(/[.!?]/g) || []).length === 1, t);
  ok(`outro ${g.slice(0, 2)} style sạch`, scanStyle(t).length === 0, scanStyle(t));
}
ok('outro lọc dầu đọc đúng từ khóa', outroText(outroKeyword(G9)).includes('Bình luận lọc dầu,'));
ok('outro lọc nước đọc đúng từ khóa', outroText(outroKeyword(G2)).includes('Bình luận lọc nước,'));
ok('outro ngắn (<= 16 từ, đọc ~4s)', outroText(outroKeyword(G2)).split(/\s+/).length <= 16, outroText(outroKeyword(G2)));
eq('chữ màn hình outro in hoa', outroScreenKeyword(outroKeyword(G9)), 'LỌC DẦU');

// 6. Tách cảnh giá (7e9cab1a: ảnh nền trắng 20 giây vì cảnh cuối gánh cả câu chốt + câu giá).
const teaser2 = PRICE_TEASER[G2];
const longLast = { narration: `Lắp một lần, nước ngọt dùng cả chuyến, anh em khỏi chia từng ca nữa nha! Máy chạy êm, ít hỏng vặt, thợ bên em lắp tận bến. ${teaser2.spoken}`, assetId: 'img-white', role: 'closing', visual: 'máy' };
const r1 = splitPriceScene([{ narration: 'Hook.', assetId: 'clip-a', role: 'hook' }, longLast], teaser2, { pickAsset: (prev) => (prev === 'img-white' ? 'clip-b' : null) });
ok('tách khi cảnh cuối dài', r1.split && r1.scenes.length === 3);
eq('cảnh giá = nguyên câu giá', r1.scenes[2].narration, teaser2.spoken);
eq('cảnh giá role price, tư liệu khác cảnh cuối', [r1.scenes[2].role, r1.scenes[2].assetId], ['price', 'clip-b']);
ok('cảnh cuối cũ chỉ còn phần chốt', !r1.scenes[1].narration.includes('3 X triệu') && r1.scenes[1].narration.endsWith('tận bến.'));
const shortLast = { narration: `Dầu sạch, máy khỏe! ${PRICE_TEASER[G9].spoken}`, assetId: 'img', role: 'closing' };
ok('không tách khi cảnh cuối ngắn', !splitPriceScene([shortLast], PRICE_TEASER[G9]).split);
ok('không tách khi không có teaser', !splitPriceScene([longLast], null).split);
ok('không tách khi thiếu câu giá', !splitPriceScene([{ narration: 'a '.repeat(40), assetId: 'x' }], teaser2).split);
ok('pickAsset null -> dùng lại tư liệu cảnh cuối', splitPriceScene([longLast], teaser2).scenes[1].assetId === 'img-white');
// Model viết lại câu giá kiểu "3X triệu" (không đúng nguyên văn): vẫn nhận ra theo spokenKey chuẩn hóa.
const rewritten = { narration: 'Lắp một lần, nước ngọt dùng cả chuyến, anh em khỏi chia từng ca nữa nha! Máy chạy êm, ít hỏng vặt, thợ bên em lắp tận bến. Máy cơ giảm từ 45 triệu chỉ còn 3X triệu, máy điện 56 triệu còn 4X triệu, gồm công lắp!', assetId: 'img', role: 'closing' };
const r2 = splitPriceScene([rewritten], teaser2);
ok('nhận câu giá viết lại "3X triệu"', r2.split && r2.scenes[1].narration.startsWith('Máy cơ giảm'), r2.scenes.map((s) => s.narration));

// 6b. Cảnh ảnh tĩnh dài tách đôi (bản dựng lại 492313ac: ảnh 17s + 19,5s).
const longImg = { narration: 'Đang đánh bắt xa bờ mà gặp cảnh này thì tiền bạc đội nón ra đi vì tốn kém tiền phụ tùng và tiền dầu mọc lên từng ngày. Thời gian thì trôi tuột đi trong lúc chờ đợi sửa chữa, lỡ hết cả chuyến biển dài ngày. Bạn ghe bên cạnh thì trúng mùa kéo lưới đều đều, còn mình đứng ngồi không yên!', assetId: 'img-1', role: 'empathy', visual: 'tàu' };
const kinds = { 'img-1': 'image', 'img-2': 'image', 'clip-1': 'video' };
const r3 = splitLongImageScenes([{ narration: 'Hook dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài dài. Hai.', assetId: 'clip-1', role: 'hook' }, longImg], { isImage: (id) => kinds[id] === 'image', pickAsset: (prev) => (prev === 'img-1' ? 'img-2' : null) });
ok('cảnh ảnh dài tách đôi, clip giữ nguyên', r3.split && r3.scenes.length === 3 && r3.scenes[0].assetId === 'clip-1');
eq('nửa sau đổi hình, giữ role', [r3.scenes[2].assetId, r3.scenes[2].role, r3.scenes[2].matchBy], ['img-2', 'empathy', 'rule-split']);
ok('tách ở ranh giới câu, nửa đầu kết bằng dấu câu', /[.!?]$/.test(r3.scenes[1].narration) && r3.scenes[1].narration.length < longImg.narration.length);
ok('ghép lại = nguyên văn', `${r3.scenes[1].narration} ${r3.scenes[2].narration}` === longImg.narration);
ok('không tư liệu thay thế -> không tách', !splitLongImageScenes([longImg], { isImage: () => true, pickAsset: () => 'img-1' }).split);
ok('cảnh ngắn -> không tách', !splitLongImageScenes([{ narration: 'Ngắn thôi. Hai câu.', assetId: 'img-1' }], { isImage: () => true, pickAsset: () => 'img-2' }).split);
ok('cảnh giá không tách', !splitLongImageScenes([{ ...longImg, role: 'price' }], { isImage: () => true, pickAsset: () => 'img-2' }).split);
eq('splitNarrationMiddle 1 câu -> null', splitNarrationMiddle('Một câu thôi.'), null);

// 7. Phụ đề ngắn dòng (ChatGPT: chữ leo lên giữa khung): mọi mẩu <= MAX_CHARS, MAX_CHARS <= 32.
ok('MAX_CHARS <= 32', MAX_CHARS <= 32, MAX_CHARS);
const blocks = buildBlocks('Sửa tới lần thứ ba trong tháng rồi mà máy vẫn cứ hỏng, anh thợ máy vừa lau mồ hôi trán vừa lắc đầu ngao ngán.', 9);
ok('mọi mẩu phụ đề <= MAX_CHARS', blocks.every((b) => b.text.length <= MAX_CHARS), blocks.map((b) => b.text.length));
ok('mẩu cuối kết đúng thời lượng', Math.abs(blocks[blocks.length - 1].end - 9) < 1e-9);

const failed = cases.filter((c) => !c.ok);
for (const c of cases) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : ` -> got ${JSON.stringify(c.got)}${c.want !== undefined ? ` want ${JSON.stringify(c.want)}` : ''}`}`);
console.log(`\n${cases.length - failed.length}/${cases.length} đạt`);
if (failed.length) process.exit(1);
