// test-video-rules.mjs — kiểm luật soát kịch bản video 17/9 (sau khi ChatGPT chấm 3 video theo prompt
// 10 tiêu chí): không nhắc sản phẩm khác, không phần trăm không nguồn, cụm sáo mới, outro 1 hành động,
// tách cảnh giá, phụ đề ngắn dòng. Chạy: npm run test:video. Không cần mạng, không cần GEMINI_API_KEY.
import {
  CROSS_PRODUCT_TERMS, crossProductTerms, crossProductViolations, percentNumbers, unsourcedPercents,
  stripSentencesWith, EXTRA_WORN, outroText, outroScreenKeyword, splitPriceScene, splitLongImageScenes, splitNarrationMiddle, mustUseRoleFor, hookProductTerm, wordsBeforeSolution, trimEarlyScenes,
  breakLongSentences, imageryDriftSentences, cutImageryDrift, selfProductFaultPhrases, inventedDetailSentences, sbChatterSentences,
} from './video/rules.mjs';
import { buildBlocks, MAX_CHARS } from './video/srt.mjs';
import { PRICE_TEASER, outroKeyword, CONTENT_GROUP } from './products.mjs';
import { scanStyle } from './brand-voice-check.mjs';
import { applySemanticRewrites, semanticRecheck } from './video/script.mjs';
import { storyboardDrift } from './video/scene-match.mjs';

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
// 17/9 vòng 2: video cộng đồng bình luận SDVICO, không nhắc sản phẩm (ChatGPT: CTA sản phẩm lạc vai cộng đồng).
const tCom = outroText('SDVICO');
ok('outro cộng đồng kêu bình luận SDVICO', tCom.includes('bình luận SDVICO') && !/lọc dầu|lọc nước|Page|gọi/i.test(tCom), tCom);
ok('outro cộng đồng một câu một "nha"', (tCom.match(/nha!/g) || []).length === 1 && (tCom.match(/[.!?]/g) || []).length === 1, tCom);
ok('outro cộng đồng style sạch', scanStyle(tCom).length === 0, scanStyle(tCom));

// Cụm sáo vòng 2 + vòng 3 (ChatGPT: "May mà có" mở cảnh giải pháp ở cả 2 video bán hàng; vòng 3 thêm
// "sương chưa tan", "kiên cường", "lau mồ hôi" lặp 3 vòng liền).
for (const p of ['may mà có', 'trọn gói từ a tới z', 'lướt sóng', 'tiếc nuối', 'sương chưa tan', 'kiên cường', 'lau mồ hôi', 'khúc ruột']) {
  ok(`EXTRA_WORN có "${p}"`, EXTRA_WORN.includes(p));
}
// Outro và câu giá không được dính chính danh sách cấm (worn quét toàn lời thoại).
for (const t of [outroText(outroKeyword(G9)), outroText('SDVICO'), PRICE_TEASER[G9].spoken, PRICE_TEASER[G2].spoken]) {
  ok(`văn cố định sạch cụm cấm: "${t.slice(0, 30)}..."`, !EXTRA_WORN.some((p) => t.toLowerCase().includes(p)), EXTRA_WORN.filter((p) => t.toLowerCase().includes(p)));
}

// Hook phải lộ sản phẩm sớm (vòng 2).
eq('hookProductTerm lọc nước', hookProductTerm(G2), 'nước');
eq('hookProductTerm lọc dầu', hookProductTerm(G9), 'dầu');
eq('hookProductTerm SF-50', hookProductTerm('6. Thiết bị lọc dầu SF-50'), 'dầu');
eq('hookProductTerm content', hookProductTerm(CONTENT_GROUP), null);

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
// 17/9 vòng 2: cảnh CLIP dài cũng tách khi videoToo (video lọc nước clip tàu sửa đứng 12s), trừ clip bắt buộc.
const longClip = { ...longImg, assetId: 'clip-x' };
const kinds2 = { 'clip-x': 'video', 'img-2': 'image' };
const rv = splitLongImageScenes([longClip], { isImage: (id) => kinds2[id] === 'image', videoToo: true, pickAsset: () => 'img-2' });
ok('videoToo: cảnh clip 43 từ tách đôi', rv.split && rv.scenes.length === 2 && rv.scenes[1].assetId === 'img-2');
ok('không videoToo: cảnh clip giữ nguyên', !splitLongImageScenes([longClip], { isImage: (id) => kinds2[id] === 'image', pickAsset: () => 'img-2' }).split);
ok('clip bắt buộc (matchBy must) không tách', !splitLongImageScenes([{ ...longClip, matchBy: 'must' }], { isImage: () => true, videoToo: true, pickAsset: () => 'img-2' }).split);
// 17/9 vòng 3: ảnh tách sớm hơn clip (ảnh >= 30 từ, clip >= 40 từ).
const img35 = { narration: 'Một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn năm sáu bảy tám chín mười. Một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn.', assetId: 'img-1', role: 'empathy', visual: 'tàu' };
ok('ảnh 34 từ tách (ngưỡng 30)', splitLongImageScenes([img35], { isImage: () => true, pickAsset: () => 'img-2' }).split);
ok('clip 34 từ KHÔNG tách (ngưỡng 36)', !splitLongImageScenes([{ ...img35, assetId: 'clip-x' }], { isImage: (id) => id !== 'clip-x', videoToo: true, pickAsset: () => 'img-2' }).split);

// 6c. Clip bắt buộc nằm ở cảnh nào (7e9cab1a: máy SEA-40 đang chạy bị gán cảnh "thợ máy sửa lần thứ ba").
eq('clip máy đang chạy -> cảnh giải pháp', mustUseRoleFor({ title: 'Máy lọc nước biển SDVICO hoạt động trên tàu cá Bình Thuận', description: 'Cận cảnh máy lọc nước đang chạy, đồng hồ áp suất' }, false), 'solution');
eq('clip xử lý sự cố -> cảnh 1', mustUseRoleFor({ title: 'Xử lý sự cố kỹ thuật máy lọc dầu SD12-300', description: 'Thợ máy kiểm tra máy trong khoang' }, false), 'hook');
eq('clip kỹ thuật viên lắp đặt -> cảnh giải pháp', mustUseRoleFor({ title: 'Ky thuat vien lap dat may loc nuoc bien SDVICO', description: 'lap dat tren tau' }, false), 'solution');
eq('video content luôn cảnh 1', mustUseRoleFor({ title: 'Máy lọc nước biển SDVICO hoạt động' }, true), 'hook');
eq('không clip -> cảnh 1', mustUseRoleFor(null, false), 'hook');

// 6e. Hình sản phẩm phải ra trước ~15 giây (vòng 6: lọc dầu gọi tên ở giây 8 nhưng hình máy giây 23).
const earlyScenes = [
  { role: 'hook', narration: 'Một hai ba bốn năm sáu bảy tám chín mười. Một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn năm!' },
  { role: 'empathy', narration: 'Một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn năm. Một hai ba bốn năm sáu bảy tám chín mười!' },
  { role: 'solution', narration: 'Cảnh máy.' },
];
eq('wordsBeforeSolution đếm đúng', wordsBeforeSolution(earlyScenes), 50);
const rt = trimEarlyScenes(earlyScenes, 45);
ok('tách bớt câu cho hình máy vào sớm', rt.trimmed && wordsBeforeSolution(rt.scenes) <= 45, wordsBeforeSolution(rt.scenes));
ok('cắt câu cuối empathy trước, hook giữ nguyên', rt.scenes[0].narration === earlyScenes[0].narration && rt.scenes[1].narration.split(/(?<=[.!?])\s+/).length === 1);
ok('cảnh giải pháp không bị đụng', rt.scenes[2].narration === 'Cảnh máy.');
ok('đã đạt thì không cắt', !trimEarlyScenes([{ role: 'hook', narration: 'Ngắn.' }, { role: 'solution', narration: 'Máy.' }], 58).trimmed);
// Cụm claim tuyệt đối vòng 6.
for (const p of ['tuyệt đối', 'giòn tan', 'đội nón', 'sạch bóng', 'vững tâm']) {
  ok(`EXTRA_WORN vòng 6 có "${p}"`, EXTRA_WORN.includes(p));
}

// 7. Phụ đề trọn ý (vòng 1: chữ leo giữa khung -> trần 40; vòng 5: cắt greedy đứt cụm "trên boong hôi" /
// "rình với đục ngầu" -> chia theo câu, vế, rồi chia đều).
ok('MAX_CHARS <= 40', MAX_CHARS <= 40, MAX_CHARS);
const blocks = buildBlocks('Sửa tới lần thứ ba trong tháng rồi mà máy vẫn cứ hỏng, anh thợ máy vừa lắc đầu vừa than.', 9);
ok('mọi mẩu phụ đề <= MAX_CHARS', blocks.every((b) => b.text.length <= MAX_CHARS), blocks.map((b) => b.text.length));
ok('mẩu cuối kết đúng thời lượng', Math.abs(blocks[blocks.length - 1].end - 9) < 1e-9);
ok('ghép mẩu = nguyên văn', blocks.map((b) => b.text).join(' ') === 'Sửa tới lần thứ ba trong tháng rồi mà máy vẫn cứ hỏng, anh thợ máy vừa lắc đầu vừa than.');
// 17/9 vòng 7 (ChatGPT: "tuyệt đối không cắt giữa từ ghép"): miệt mài, trực tiếp phải liền nhau.
const bMiet = buildBlocks('Anh em kỹ thuật đang miệt mài thao tác dữ lắm nha anh em ơi!', 6).map((b) => b.text);
ok('không cắt giữa "miệt mài"', bMiet.every((t) => !t.endsWith('miệt')), bMiet);
const bTruc = buildBlocks('Nhớ lại những ngày trực tiếp ra cảng hỗ trợ bà con mình.', 6).map((b) => b.text);
ok('không cắt giữa "trực tiếp"', bTruc.every((t) => !t.endsWith('trực')), bTruc);
const bTk = buildBlocks('Máy giúp bảo vệ bơm cao áp và tiết kiệm đáng kể chi phí nhiên liệu cho anh em!', 8).map((b) => b.text);
ok('không cắt giữa "tiết kiệm đáng kể"', bTk.every((t) => !t.endsWith('tiết kiệm') && !t.endsWith('tiết')), bTk);

// Câu 7e9cab1a từng bị cắt "trên boong hôi" / "rình với...": chia đều phải giữ "hôi rình" liền nhau.
const b2 = buildBlocks('Thùng nước trên boong hôi rình với đục ngầu rồi anh ơi!', 6).map((b) => b.text);
ok('không đứt cụm "hôi rình"', b2.some((t) => t.includes('hôi rình')), b2);
// Câu ngắn vừa 1 mẩu thì giữ nguyên câu.
eq('câu <= 40 ký tự = 1 mẩu nguyên câu', buildBlocks('Đã có máy lọc dầu SF300B.', 3).map((b) => b.text), ['Đã có máy lọc dầu SF300B.']);
// Nhiều câu: mỗi câu 1 mẩu, không dính sang nhau.
const b3 = buildBlocks('Máy nổ êm hơn. Kỹ thuật lắp tận bến cho anh em!', 6).map((b) => b.text);
eq('2 câu ngắn = 2 mẩu theo câu', b3, ['Máy nổ êm hơn.', 'Kỹ thuật lắp tận bến cho anh em!']);
// Câu dài có vế: cắt tại dấu phẩy, không cắt giữa vế.
const b4 = buildBlocks('Máy cơ giảm từ 45 triệu chỉ còn 3 X triệu, máy điện giảm từ 56 triệu chỉ còn 4 X triệu, đã gồm công lắp!', 8).map((b) => b.text);
ok('vế giá không bị đứt giữa chừng', b4.every((t) => t.length <= MAX_CHARS) && b4.some((t) => t.startsWith('Máy cơ giảm')) && b4.some((t) => t.startsWith('máy điện giảm')), b4);

// 17/9 vòng 9 — (a) câu trích kết thúc !" làm regex tách câu bó tay, "thốt lên" lọt vào video 7e9cab1a.
eq('cắt được câu sau câu trích đóng bằng !"',
  stripSentencesWith('"Thùng chứa cạn sạch rồi anh em ơi!" Câu nói đó anh thợ máy vừa nói giữa trưa.', ['giữa trưa']),
  '"Thùng chứa cạn sạch rồi anh em ơi!"');
// (b) câu 40 từ nối 4 vế bằng phẩy (cảnh giải pháp 492313ac) — bẻ thành câu ngắn để cắt được từng cụm cấm.
const MEGA = 'May mà có Máy lọc dầu SF300B giữ dầu sạch bong, với độ lọc từ 1 tới 10 micromet giúp tách sạch nước, bảo vệ kim phun và bơm cao áp, đồng thời tiết kiệm 5 tới 10% nhiên liệu cho anh em yên tâm bám biển!';
const broken = breakLongSentences(MEGA);
ok('câu 40 từ bẻ thành nhiều câu', broken.split(/(?<=[.!?…])\s+/).length >= 3, broken);
ok('mỗi câu sau khi bẻ <= 20 từ', broken.split(/(?<=[.!?…])\s+/).every((s) => s.split(/\s+/).length <= 20), broken);
const cutMega = stripSentencesWith(broken, ['may mà có', 'sạch bong', 'yên tâm bám biển']);
ok('bẻ xong cắt cụm cấm còn giữ được thông tin', cutMega.includes('kim phun') && !cutMega.includes('sạch bong') && !cutMega.includes('yên tâm bám biển'), cutMega);
eq('câu ngắn giữ nguyên', breakLongSentences('Máy nổ êm hơn. Kỹ thuật lắp tận bến!'), 'Máy nổ êm hơn. Kỹ thuật lắp tận bến!');
eq('số thập phân "1,5" không bị bẻ', breakLongSentences('Máy tiết kiệm 1,5 lít mỗi giờ.'), 'Máy tiết kiệm 1,5 lít mỗi giờ.');
// (c) lời trôi khỏi hình: "mâm cơm trên boong" đọc trên clip văn phòng (8c8347a4), "thùng inox" trên ảnh hội thảo (7e9cab1a).
const OFFICE = 'Nữ nhân viên văn phòng SDVICO ngồi làm việc trước màn hình máy tính, người rõ từ đầu';
eq('bắt câu mâm cơm trên boong trên hình văn phòng',
  imageryDriftSentences('Nhìn anh em thao tác máy móc qua màn hình. Đã lắm những lúc quây quần bên mâm cơm nóng trên boong!', OFFICE),
  ['Đã lắm những lúc quây quần bên mâm cơm nóng trên boong!']);
eq('hình có boong thì không bắt', imageryDriftSentences('Bữa cơm trên boong tàu vui lắm.', 'Ngư dân ăn cơm trên boong tàu cá'), []);
eq('bắt "ở cảng" trên hình văn phòng (nguyên từ, không dính "cảnh")', imageryDriftSentences('Chiều muộn ở cảng, nhìn anh em thao tác.', 'Cảnh quay nhân viên văn phòng'), ['Chiều muộn ở cảng, nhìn anh em thao tác.']);
eq('cắt giữ câu khớp hình', cutImageryDrift('Nhìn anh em qua màn hình. Nhớ mâm cơm trên boong!', OFFICE), 'Nhìn anh em qua màn hình.');
// 1/10 (Thanh xem 22452d7f: "vệt dầu bám trên con ốc gỉ sét" đọc trên clip thợ lắp THIẾT BỊ MỚI):
// chi tiết cận cảnh ốc vít gỉ sét, vệt dầu không có trong mô tả clip phải bị coi là trôi khỏi hình.
const NEW_INSTALL = 'Khoang máy chật chội trên tàu cá, thợ đang thao tác lắp đặt thiết bị mới';
eq('bắt "con ốc gỉ sét, vệt dầu" trên clip lắp máy mới',
  imageryDriftSentences('Từng vệt dầu bám chặt trên con ốc gỉ sét nè!', NEW_INSTALL),
  ['Từng vệt dầu bám chặt trên con ốc gỉ sét nè!']);
eq('hình có rỉ sét thì không bắt', imageryDriftSentences('Con ốc gỉ sét bám đầy dầu.', 'Cận cảnh con ốc rỉ sét, gỉ sét bám vệt dầu trên máy cũ'), []);
// 1/10 (2): bản dựng lần 2 cảnh 2 đọc "chòng chành sóng nước" trên hình CẢNG CÁ TRÊN BỜ.
eq('bắt "chòng chành sóng nước" trên hình cảng cá trên bờ',
  imageryDriftSentences('Mồ hôi vã ra giữa không gian chòng chành sóng nước.', 'Cảnh ngư dân chuẩn bị ra khơi tại bến cảng cá, tàu neo đậu trên bờ'),
  ['Mồ hôi vã ra giữa không gian chòng chành sóng nước.']);
eq('hình có sóng nước thì không bắt', imageryDriftSentences('Giữa không gian chòng chành sóng nước.', 'Thợ sửa máy trên tàu, sóng nước chòng chành'), []);
eq('cắt hết thì trả rỗng để người gọi giữ bản gốc', cutImageryDrift('Nhớ mâm cơm nóng trên boong!', OFFICE), '');
eq('không trôi thì giữ nguyên', cutImageryDrift('Máy khục khặc vì cặn bẩn.', OFFICE), 'Máy khục khặc vì cặn bẩn.');
// (d) cụm sáo vòng 9 phải nằm trong EXTRA_WORN.
for (const p of ['nhớ quá', 'đã lắm', 'quây quần', 'mâm cơm', 'cạn đáy', 'một giọt nước', 'không còn lo', 'loay hoay']) {
  ok(`EXTRA_WORN vòng 9 có "${p}"`, EXTRA_WORN.includes(p));
}
// 18/9 vòng 10 — (f) câu tả NGƯỜI trên hình không có người ("bạn ghe nhìn cười trừ" trên cabin trống).
const CABIN = 'Không gian buồng lái tàu cá có ghế lái bằng gỗ, bảng điều khiển, không có người';
eq('bắt "cười trừ" trên hình không người', imageryDriftSentences('Bạn ghe nhìn cười trừ mà rầu!', CABIN), ['Bạn ghe nhìn cười trừ mà rầu!']);
eq('hình có thợ máy thì câu bàn tay được giữ', imageryDriftSentences('Đôi bàn tay thợ bám đầy dầu nhớt!', 'Thợ máy đang sửa động cơ trên tàu cá'), []);
eq('"cuối" không bị nhầm thành "cười"', imageryDriftSentences('Cuối chuyến biển máy vẫn chạy tốt.', CABIN), []);
// 12. Bịa thêm chi tiết (23/9 bài 1f608ee3: "anh nhân viên xách vali dụng cụ bước xuống mạn" trên clip
// chị nhân viên cầm điện thoại trước trung tâm quản lý cảng).
const CLIP_CANG = 'Nhân viên SDVICO mặc áo đồng phục gặp gỡ khách hàng cầm hồ sơ tại cảng cá Cà Ná, xung quanh là tàu cá neo đậu';
eq('bắt "xách vali" không có trong mô tả', inventedDetailSentences('Anh nhân viên SDVICO vừa nói, vừa xách vali dụng cụ.', CLIP_CANG), ['Anh nhân viên SDVICO vừa nói, vừa xách vali dụng cụ.']);
eq('bắt "xuống mạn" không có trong mô tả', inventedDetailSentences('Bước thật nhanh xuống mạn.', CLIP_CANG), ['Bước thật nhanh xuống mạn.']);
eq('bắt gán giới tính khi mô tả không ghi', inventedDetailSentences('Anh nhân viên ra cảng sớm.', CLIP_CANG), ['Anh nhân viên ra cảng sớm.']);
eq('mô tả có "chị" thì "chị nhân viên" được giữ', inventedDetailSentences('Chị nhân viên cầm điện thoại quay lại.', 'Chị nhân viên SDVICO cầm điện thoại đi trước trung tâm quản lý cảng'), []);
eq('mô tả có "anh thợ" thì "anh thợ" được giữ', inventedDetailSentences('Anh thợ máy cúi xuống kiểm tra.', 'Anh thợ máy đang tháo bầu lọc trong khoang máy'), []);
eq('gọi trung tính thì không bắt', inventedDetailSentences('Nhân viên SDVICO ra cảng gặp khách.', CLIP_CANG), []);
eq('mô tả có "xách" thì "xách" được giữ', inventedDetailSentences('Tay xách túi đồ đi dọc cầu cảng.', 'Ngư dân xách túi đồ, túi đồ nặng, đi dọc cầu cảng'), []);
// (g) cảnh nỗi đau trỏ "máy ... này" vào sự cố (vòng 10: câu mở lọc nước gây lẫn máy đang bán với máy hỏng).
eq('bắt "máy lọc nước này sửa"', selfProductFaultPhrases('"Máy lọc nước này sửa tới lần thứ ba rồi đấy!"'), ['máy lọc nước này']);
eq('bắt "máy này hỏng"', selfProductFaultPhrases('Máy này hỏng hoài chịu sao thấu?'), ['máy này hỏng']);
eq('"máy lọc cũ" không bị bắt', selfProductFaultPhrases('Bộ máy lọc cũ trên tàu nghẹt cặn.'), []);
// (h) cụm sáo vòng 10 nằm trong EXTRA_WORN.
for (const p of ['ruột gan', 'gan ruột', 'cười trừ', 'tinh mơ', 'hoàn thiện từng con máy']) {
  ok(`EXTRA_WORN vòng 10 có "${p}"`, EXTRA_WORN.includes(p));
}
// (e) phụ đề: câu trích đóng bằng !" tách thành mẩu riêng, không dính câu sau.
const bQuote = buildBlocks('"Hết nước rồi anh em ơi!" Anh thợ máy vừa nói vậy đó.', 6).map((b) => b.text);
ok('phụ đề tách sau câu trích !"', bQuote[0] === '"Hết nước rồi anh em ơi!"', bQuote);
// (i) 18/9 (user: "giây 0:11-0:13 khựng 1 nhịp, giọng và phụ đề không đi kịp"): cảnh mang 0,26s đệm
// thở cuối khúc tiếng — phụ đề phải kết ở thời gian ĐỌC (speechSec), không đứng thêm hết cả đệm.
const bPad = buildBlocks('Cặn bẩn lọt vào làm kim phun nghẹt cứng, tiền sửa tốn cả chục triệu bạc!', 5.43, { speechSec: 5.17 });
ok('mẩu chót kết tại speechSec (không ăn vào đệm thở)', Math.abs(bPad[bPad.length - 1].end - 5.17) < 1e-9, bPad[bPad.length - 1]);
const bNoPad = buildBlocks('Máy nổ êm hơn.', 3);
ok('không truyền speechSec thì như cũ (kết tại durationSec)', Math.abs(bNoPad[bNoPad.length - 1].end - 3) < 1e-9);

// 29/9 nhịp điệu voice: padSecOf 0,30/0,42, tidyWav truyền --maxgap (build-video chạy main() khi import nên đọc mã nguồn)
import { readFileSync } from 'node:fs';
const bvSrc = readFileSync(new URL('./video/build-video.mjs', import.meta.url), 'utf8');
const padFn = new Function(`${bvSrc.match(/export function padSecOf[\s\S]*?\r?\n\}/)[0].replace('export ', '')}; return padSecOf;`)();
ok('padSecOf câu thường 0,30', padFn('Máy chạy êm.') === 0.30, padFn('Máy chạy êm.'));
ok('padSecOf câu ? 0,42', padFn('Bà con thấy sao?') === 0.42);
ok('padSecOf câu ! 0,42', padFn('Ra khơi an tâm!') === 0.42);
ok('tidyWav truyền --maxgap 0,55', /'--maxgap'/.test(bvSrc) && /TTS_PAUSE_MAXGAP \|\| 0\.55/.test(bvSrc));

// 1/10 vòng 2 (Thanh, bài 22452d7f): soát NGHĨA lời-hình bằng model + viết lại lời cảnh lệch theo mô tả hình.
// Test phần thuần applySemanticRewrites và nối semanticRecheck bằng model giả (không mạng).
{
  const quiet = { warn() {}, log() {} };
  const pump = { id: 'v-pump', kind: 'video', title: 'Máy bơm ở cầu cảng', description: 'Máy bơm đặt ngoài trời ở cầu cảng, ngư dân đứng trên bờ nhìn tàu neo' };
  const assetById = new Map([[pump.id, pump]]);
  const OLD = 'Đứng dưới hầm máy, siết từng vòng gen giữa chòng chành sóng nước.';
  const mkScenes = () => [{ role: 'story', narration: OLD }, { role: 'empathy', narration: 'Tiền sửa chữa cứ chồng lên.' }];
  const mkPicks = () => [{ assetId: 'v-pump', fit: 7, why: 'model', by: 'model' }, { assetId: 'v-pump', fit: 7, why: 'model', by: 'model' }];

  // Ca 1: lời mới sạch -> nhận, ghi dấu 'semantic'.
  { const sc = mkScenes(); const pk = mkPicks();
    const r = applySemanticRewrites(sc, pk, [{ scene: 1, loi_moi: 'Máy bơm đặt ngoài trời ở cầu cảng. Ngư dân đứng trên bờ nhìn tàu neo.' }], { assetById, log: quiet });
    ok('soát nghĩa: lời mới sạch thì nhận', sc[0].narration.startsWith('Máy bơm đặt ngoài trời') && r.applied.join() === '0', sc[0].narration);
    ok('soát nghĩa: ghi by semantic + why cho người duyệt', pk[0].by === 'semantic' && pk[0].why.includes('soát nghĩa 1/10'), pk[0]);
    ok('soát nghĩa: cảnh không có rewrite không đổi', sc[1].narration === 'Tiền sửa chữa cứ chồng lên.' && pk[1].by === 'model'); }

  // Ca 2: lời mới vẫn trôi khỏi hình -> giữ lời cũ + CẢNH BÁO.
  { const sc = mkScenes(); const pk = mkPicks();
    const r = applySemanticRewrites(sc, pk, [{ scene: 1, loi_moi: 'Anh em siết ốc giữa chòng chành sóng nước.' }], { assetById, log: quiet });
    ok('soát nghĩa: lời mới vẫn drift thì giữ lời cũ', sc[0].narration === OLD && r.kept.join() === '0' && !r.applied.length, sc[0].narration);
    ok('soát nghĩa: drift ghi CẢNH BÁO, giữ by cũ', pk[0].why.includes('CẢNH BÁO') && pk[0].by === 'model', pk[0]); }

  // Ca 3: cảnh trong skip (must / hookPin) không đổi dù có rewrite.
  { const sc = mkScenes(); const pk = mkPicks();
    const r = applySemanticRewrites(sc, pk, [{ scene: 1, loi_moi: 'Máy bơm đặt ngoài trời ở cầu cảng.' }], { skip: [0], assetById, log: quiet });
    ok('soát nghĩa: cảnh skip không đổi', sc[0].narration === OLD && pk[0].by === 'model' && !r.applied.length && !r.kept.length); }

  // Ca 4: lời mới dính giá chính xác -> redact trước khi nhận.
  { const sc = mkScenes(); const pk = mkPicks();
    applySemanticRewrites(sc, pk, [{ scene: 1, loi_moi: 'Máy bơm đặt ngoài trời ở cầu cảng. Giá chỉ 9.900.000 đồng thôi.' }], { assetById, log: quiet });
    ok('soát nghĩa: giá chính xác bị redact', !sc[0].narration.includes('9.900.000') && sc[0].narration.includes('9,X triệu'), sc[0].narration); }

  // Ca 5: cụm cấm/mòn và hàm extraBad cắt câu chứa trước khi nhận; cắt rỗng thì giữ lời cũ.
  { const sc = mkScenes(); const pk = mkPicks();
    applySemanticRewrites(sc, pk, [{ scene: 1, loi_moi: 'Máy bơm đặt ngoài trời ở cầu cảng. Suốt hành trình dài, ai cũng mệt. Nhìn cái máy này là hết hồn.' }],
      { assetById, banned: ['suốt hành trình dài'], extraBad: () => ['máy này'], log: quiet });
    ok('soát nghĩa: cắt câu cụm mòn + extraBad', sc[0].narration === 'Máy bơm đặt ngoài trời ở cầu cảng.', sc[0].narration);
    const sc2 = mkScenes(); const pk2 = mkPicks();
    const r2 = applySemanticRewrites(sc2, pk2, [{ scene: 1, loi_moi: 'Suốt hành trình dài, ai cũng mệt.' }], { assetById, banned: ['suốt hành trình dài'], log: quiet });
    ok('soát nghĩa: cắt rỗng thì giữ lời cũ + CẢNH BÁO', sc2[0].narration === OLD && r2.kept.join() === '0' && pk2[0].why.includes('CẢNH BÁO'), pk2[0]); }

  // Ca 6: semanticRecheck với model giả: chấm 2 cảnh, cảnh 1 lệch -> viết lại; đúng 2 lời gọi.
  { const sc = mkScenes(); const pk = mkPicks(); let calls = 0;
    const gen = async (_ai, p) => {
      calls += 1;
      if (String(p.contents).includes('LỜI CŨ')) return { text: JSON.stringify({ scenes: [{ scene: 1, loi_moi: 'Máy bơm đặt ngoài trời ở cầu cảng.' }] }) };
      return { text: JSON.stringify({ picks: [{ scene: 1, fit: 2, vi_sao: 'lời hầm máy, hình ngoài trời' }, { scene: 2, fit: 9, vi_sao: 'ổn' }] }) };
    };
    const r = await semanticRecheck({ ai: null, rawScenes: sc, picks: pk, assets: [pump], generate: gen, model: 'x', log: quiet });
    ok('semanticRecheck: viết lại cảnh chấm <= 4, giữ cảnh ổn', sc[0].narration === 'Máy bơm đặt ngoài trời ở cầu cảng.' && sc[1].narration === 'Tiền sửa chữa cứ chồng lên.' && r.applied.join() === '0', sc[0].narration);
    ok('semanticRecheck: đúng 2 lời gọi model', calls === 2, calls); }

  // Ca 7: mọi cảnh đạt -> chỉ 1 lời gọi, không đổi gì.
  { const sc = mkScenes(); const pk = mkPicks(); let calls = 0;
    const gen = async () => { calls += 1; return { text: JSON.stringify({ picks: [{ scene: 1, fit: 8 }, { scene: 2, fit: 10 }] }) }; };
    await semanticRecheck({ ai: null, rawScenes: sc, picks: pk, assets: [pump], generate: gen, model: 'x', log: quiet });
    ok('semanticRecheck: không cảnh lệch thì dừng sau 1 lời gọi, lời giữ nguyên', calls === 1 && sc[0].narration === OLD); }

  // Ca 8: model lỗi (429) / trả JSON hỏng -> bỏ qua bước, KHÔNG ném lỗi.
  { const sc = mkScenes(); const pk = mkPicks();
    const boom = async () => { throw new Error('429 RESOURCE_EXHAUSTED'); };
    const r = await semanticRecheck({ ai: null, rawScenes: sc, picks: pk, assets: [pump], generate: boom, model: 'x', log: quiet });
    ok('semanticRecheck: model 429 thì bỏ qua, build không chết', sc[0].narration === OLD && !r.applied.length);
    const junk = async () => ({ text: 'không phải json' });
    await semanticRecheck({ ai: null, rawScenes: sc, picks: pk, assets: [pump], generate: junk, model: 'x', log: quiet });
    ok('semanticRecheck: JSON hỏng thì coi như mọi cảnh đạt', sc[0].narration === OLD); }

  // Ca 9: cảnh bị chấm lệch nhưng model không trả bản viết lại -> ghi CẢNH BÁO, giữ lời.
  { const sc = mkScenes(); const pk = mkPicks();
    const gen = async (_ai, p) => (String(p.contents).includes('LỜI CŨ')
      ? { text: JSON.stringify({ scenes: [] }) }
      : { text: JSON.stringify({ picks: [{ scene: 1, fit: 3, vi_sao: 'lệch' }] }) });
    const r = await semanticRecheck({ ai: null, rawScenes: sc, picks: pk, assets: [pump], generate: gen, model: 'x', log: quiet });
    ok('semanticRecheck: chấm lệch mà không viết lại được thì CẢNH BÁO', sc[0].narration === OLD && r.flagged.join() === '0' && pk[0].why.includes('CẢNH BÁO'), pk[0]); }

  // Ca 10: cảnh skip không bị đưa lên model chấm / viết lại.
  { const sc = mkScenes(); const pk = mkPicks(); const seen = [];
    const gen = async (_ai, p) => { seen.push(String(p.contents)); return { text: JSON.stringify({ picks: [{ scene: 1, fit: 1 }, { scene: 2, fit: 9 }] }) }; };
    await semanticRecheck({ ai: null, rawScenes: sc, picks: pk, assets: [pump], skip: [0], generate: gen, model: 'x', log: quiet });
    ok('semanticRecheck: cảnh skip không vào prompt chấm, không viết lại', !seen[0].includes('CẢNH 1 ') && seen.length === 1 && sc[0].narration === OLD, seen); }
}

// 1/10: storyboardDrift (video content storyboard-first) — soát lời từng cảnh với mô tả đúng hình đã chốt.
{
  const hinhCang = { id: 'sb-1', kind: 'video', title: 'Cảnh ngư dân chuẩn bị ra khơi ở cảng', folder: 'Content', description: 'Cảnh nhộn nhịp tại cảng cá trên bờ, tàu neo đậu, ngư dân chuẩn bị ra khơi' };
  const hinhMay = { id: 'sb-2', kind: 'video', title: 'Cận cảnh động cơ', folder: 'Content', description: 'Cận cảnh động cơ tàu cá trong khoang máy, không thấy người' };
  const hinhTau = { id: 'sb-3', kind: 'video', title: 'Tàu cá neo ở cảng', folder: 'Content', description: 'Tàu cá neo đậu ở cảng buổi chiều, ngư dân đứng trên boong' };
  const sbSet = [hinhCang, hinhMay, hinhTau];
  const clean = [
    { narration: 'Tàu neo đậu ở cảng, ngư dân chuẩn bị ra khơi.' },
    { narration: 'Động cơ nằm trong khoang máy, tiếng máy đều đều.' },
    { narration: 'Tàu của bà con thì sao?' },
  ];
  eq('storyboardDrift: lời bám đúng hình thì không cảnh nào lệch', storyboardDrift(clean, sbSet).map((m) => m.scene), []);
  const drifted = [clean[0], { narration: 'Mồ hôi vã ra giữa không gian chòng chành sóng nước.' }, clean[2]];
  const d1 = storyboardDrift(drifted, sbSet);
  ok('storyboardDrift: lời biển động trên hình khoang máy bị bắt (cảnh 2, drift)', d1.length === 1 && d1[0].scene === 2 && d1[0].reason === 'drift' && d1[0].asset.id === 'sb-2', d1);
  const noOv = [clean[0], { narration: 'Bình lặng một buổi mai.' }, clean[2]];
  const d2 = storyboardDrift(noOv, sbSet);
  ok('storyboardDrift: lời không chung từ nào với mô tả hình (cảnh giữa) bị bắt no-overlap', d2.length === 1 && d2[0].scene === 2 && d2[0].reason === 'no-overlap', d2);
  const lastFree = [clean[0], clean[1], { narration: 'Bà con nghĩ sao về chuyện này?' }];
  eq('storyboardDrift: cảnh cuối (câu hỏi giao lưu) không bị bắt no-overlap', storyboardDrift(lastFree, sbSet), []);
  const person = [{ narration: 'Anh thợ máy cười nói với chúng tôi.' }, clean[1], clean[2]];
  const d3 = storyboardDrift(person, sbSet);
  ok('storyboardDrift: chi tiết người không có trong mô tả (anh thợ máy) bị bắt cảnh 1', d3.some((m) => m.scene === 1 && (m.reason === 'invented' || m.reason === 'drift')), d3);
  eq('storyboardDrift: số cảnh ít hơn bộ hình chỉ soát phần có, không lỗi', storyboardDrift([clean[0]], sbSet), []);
  eq('storyboardDrift: đầu vào rỗng không lỗi', [storyboardDrift([], sbSet), storyboardDrift(null, null)], [[], []]);
}

// 2/10: sbChatterSentences — câu hỏi giao lưu kiểu "...phải không?" ở cảnh giữa storyboard-first bị bắt.
{
  eq('sbChatter: bắt "phải không"', sbChatterSentences('Thợ máy đang lắp thiết bị phải không?'), ['Thợ máy đang lắp thiết bị phải không?']);
  eq('sbChatter: bắt "có thấy vậy không"', sbChatterSentences('Bà con có thấy vậy không?'), ['Bà con có thấy vậy không?']);
  eq('sbChatter: bắt "đúng không nào"', sbChatterSentences('Đúng không nào anh em?'), ['Đúng không nào anh em?']);
  eq('sbChatter: bắt biến thể không dấu, hoa thường', sbChatterSentences('MAY NAY TOT DUNG KHONG ban?'), ['MAY NAY TOT DUNG KHONG ban?']);
  eq('sbChatter: bắt "thấy hông" và "phải hông"', sbChatterSentences('Bà con thấy hông? Chuyến này khó phải hông?').length, 2);
  eq('sbChatter: chỉ trả câu dính, giữ câu sạch', sbChatterSentences('Tiếng máy nổ đều. Anh em nghe đúng không? Ngủ ngon rồi.'), ['Anh em nghe đúng không?']);
  eq('sbChatter: không bắt câu cảm "Nhẹ cả người!"', sbChatterSentences('Nhẹ cả người!'), []);
  eq('sbChatter: không bắt câu kể "Tiếng máy nổ đều, mình mới ngủ ngon."', sbChatterSentences('Tiếng máy nổ đều, mình mới ngủ ngon.'), []);
  eq('sbChatter: không bắt câu hỏi tu từ "Sao dầu xuống nhanh vậy?"', sbChatterSentences('Sao dầu xuống nhanh vậy?'), []);
  eq('sbChatter: câu kể thường không có cụm hỏi thì không bắt', sbChatterSentences('Kho máy luôn thông thoáng.'), []);
  eq('sbChatter: chuỗi rỗng và null không lỗi', [sbChatterSentences(''), sbChatterSentences(null)], [[], []]);
}

const failed = cases.filter((c) => !c.ok);
for (const c of cases) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : ` -> got ${JSON.stringify(c.got)}${c.want !== undefined ? ` want ${JSON.stringify(c.want)}` : ''}`}`);
console.log(`\n${cases.length - failed.length}/${cases.length} đạt`);
if (failed.length) process.exit(1);
