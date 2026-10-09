// test-clip-guard.mjs - kiem rao bai content theo clip (8/10). Chay: npm run test:clipguard
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  looksLikeInternalRnD, dropInternalRnDClips, buildClipContentTopic, cleanClipDescription,
  fabricatedWitnessSentences, stripFabricatedSentences, resolveWitnessBody,
  hasUsableClipDescription, filterContentClips, hasClosingQuestion, buildGenFlags, hasGenFlags,
  applyGenFlagsToTicket, safeContentType, safeContentChoice, SAFE_ENGAGE_TOPIC, contentTemperature,
} from './clip-guard.mjs';
import { scanPlaybook } from '../../../apps/approval-ui/lib/gen/compliance.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const cases = [];
const eq = (name, got, want) => cases.push({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });

// ---- looksLikeInternalRnD ----
const CLIP_638 = 'Thu nghiem phan mem dieu khien tau tu dong SDNavi. Quay màn hình máy tính trong văn phòng, phần mềm mô phỏng Gzweb Sim và QGroundControl, không có người, không có tàu thật.';
eq('RnD: mo ta clip 638c2e82', looksLikeInternalRnD(CLIP_638), true);
eq('RnD: tieu de khong dau SDNavi', looksLikeInternalRnD('Thu nghiem phan mem dieu khien tau tu dong SDNavi'), true);
eq('RnD: canh ngu dan ra khoi khong phai', looksLikeInternalRnD('Cảnh ngư dân chuẩn bị ra khơi ở cảng'), false);
eq('RnD: ky thuat vien lap may loc dau khong phai', looksLikeInternalRnD('Kỹ thuật viên lắp máy lọc dầu trong khoang máy'), false);
eq('RnD: Mo phong hanh trinh SDNavi', looksLikeInternalRnD('Mô phỏng hành trình SDNavi'), true);
eq('RnD: man hinh giam sat tren tau KHONG phai', looksLikeInternalRnD('Màn hình giám sát hành trình trên tàu hiển thị vị trí'), false);
eq('RnD: quay man hinh', looksLikeInternalRnD('Clip quay màn hình phần mềm'), true);
eq('RnD: bo mach', looksLikeInternalRnD('Cận cảnh bo mạch điều khiển'), true);
eq('RnD: USV', looksLikeInternalRnD('Thử USV tự hành'), true);
eq('RnD: ban thu', looksLikeInternalRnD('Bản thử nghiệm đầu tiên'), true);
eq('RnD: ban thuyen khong dinh oan', looksLikeInternalRnD('Hai bạn thuyền cùng sửa lưới'), false);
eq('RnD: rong', looksLikeInternalRnD(''), false);
eq('RnD: dropInternalRnDClips', dropInternalRnDClips([
  { id: 'x1', title: 'Lap may loc nuoc', description: 'Tho lap may tren tau' },
  { id: 'x2', title: 'Thu nghiem SDNavi', description: '' },
  { id: 'x3', title: 'Clip', description: 'Quay màn hình máy tính' },
]).map((a) => a.id), ['x1']);

// ---- buildClipContentTopic ----
const t1 = buildClipContentTopic('Tho lap may loc nuoc', 'Hai thợ đang lắp máy lọc nước trên boong. | Hợp cảnh: lap_dat | Từ khoá: loc nuoc, lap dat');
eq('topic: co mo ta clip', t1.includes('Hai thợ đang lắp máy lọc nước trên boong.'), true);
eq('topic: bo phan Tu khoa/Hop canh', /Từ khoá|Hợp cảnh/.test(t1), false);
eq('topic: co lenh cam xung chung kien', t1.includes('KHÔNG xưng người chứng kiến'), true);
eq('topic: cam ky uc', t1.includes('KHÔNG dựng ký ức'), true);
eq('topic: cam tuyet doi co dam', t1.includes('không dùng "tuyệt đối", "có dám"'), true);
const t2 = buildClipContentTopic('Tieu de clip', '');
eq('topic: khong description van kem cam', t2.includes('KHÔNG xưng người chứng kiến') && t2.includes('Tieu de clip'), true);
eq('topic: cat 600 ky tu', cleanClipDescription('a '.repeat(500)).length <= 604, true);

// ---- fabricatedWitnessSentences ----
const S1 = 'Hôm nay đứng trên boong nhìn anh em kỹ thuật thử nghiệm hệ thống lái tự động mới trên tàu, thấy biển khơi giờ hiện đại thật.';
const S2 = 'Nhớ lại mấy chục năm trước anh em mình toàn canh vô lăng mỏi nhừ tay giữa đêm giông bão.';
const S3 = 'Theo các bác, nếu chọn giữa việc canh lái thủ công quen thuộc và giao cho máy tự động lo, anh em mình có dám tin tưởng tuyệt đối không?';
const POST = `${S1} ${S2} ${S3}`;
eq('witness: cau 1 dinh', fabricatedWitnessSentences(S1).length, 1);
eq('witness: cau 2 dinh', fabricatedWitnessSentences(S2).length, 1);
eq('witness: cau 3 (ep chon) dinh', fabricatedWitnessSentences(S3).length, 1);
eq('witness: ca bai 3 cau', fabricatedWitnessSentences(POST).length, 3);
eq('witness: Hom nay doi ky thuat giao may KHONG dinh', fabricatedWitnessSentences('Hôm nay đội kỹ thuật SDVICO giao máy lọc nước ra đảo Phú Quý.'), []);
eq('witness: Ba con nhin thay KHONG dinh', fabricatedWitnessSentences('Bà con nhìn thấy nước ngọt chảy ra là yên tâm.'), []);
eq('witness: cau hoi binh thuong KHONG dinh', fabricatedWitnessSentences('Bác nào đã dùng rồi, chia sẻ thêm kinh nghiệm nhé?'), []);
eq('witness: toi dung tren boong dinh', fabricatedWitnessSentences('Tôi đứng trên boong nhìn đàn cá chạy.').length, 1);
eq('witness: anh em minh nhin KHONG dinh', fabricatedWitnessSentences('Anh em mình nhìn màn hình là biết tàu đang ở đâu.'), []);
eq('witness: hoi minh con tre dinh', fabricatedWitnessSentences('Hồi mình còn đi biển, nước ngọt quý như vàng.').length, 1);
eq('witness: ngay xua toi dinh', fabricatedWitnessSentences('Ngày xưa tôi đi tàu, dầu nhớt toàn đổ tay.').length, 1);
eq('witness: sang nay xuong tau dinh', fabricatedWitnessSentences('Sáng nay xuống tàu cùng đội kỹ thuật, thấy máy chạy êm.').length, 1);
eq('witness: cau hoi co dam nhung khong dau ? thi khong dinh', fabricatedWitnessSentences('Máy này dám chạy suốt chuyến biển dài.'), []);
eq('witness: moi ba con nho lai KHONG dinh', fabricatedWitnessSentences('Bác nào còn nhớ lại chuyến biển đầu tiên của mình không?'), []);
eq('witness: hashtag bo qua', fabricatedWitnessSentences('#nhớ lại #SDVICO'), []);
eq('witness: emoji dau cau van bat', fabricatedWitnessSentences('⚓ Hôm nay ngồi xem anh em thử máy.').length, 1);

// ---- stripFabricatedSentences / resolveWitnessBody ----
const BODY_OK = 'Clip cho thấy đội SDVICO thử phần mềm lái tự động ngay trên máy tính. Đây là bước chạy mô phỏng trước khi đưa xuống tàu thật. Bà con thấy việc thử trước như vậy có cần không?';
const mixed = `${BODY_OK} ${S2}\n\n#SDVICO #tauca`;
const cut = stripFabricatedSentences(mixed);
eq('strip: bo cau ky uc', cut.text.includes('Nhớ lại'), false);
eq('strip: giu hashtag', cut.text.includes('#SDVICO #tauca'), true);
eq('strip: giu than bai', cut.text.includes('Clip cho thấy đội SDVICO'), true);
const r1 = resolveWitnessBody(mixed);
eq('resolve: cat duoc, khong warn', r1.warn.length === 0 && !r1.body.includes('Nhớ lại'), true);
const r2 = resolveWitnessBody(POST);
eq('resolve: cat het than bai -> giu nguyen + warn', r2.body === POST && r2.warn.length === 3, true);
const r3 = resolveWitnessBody(BODY_OK);
eq('resolve: bai sach giu nguyen', r3.body === BODY_OK && r3.warn.length === 0, true);

// ---- C4b: vai SDVICO co dieu kien trong chu de bam clip ----
eq('topic: bo "noi ro SDVICO dang lam gi" (co mo ta)', /nói rõ SDVICO đang làm gì/.test(t1), false);
eq('topic: bo "noi ro SDVICO dang lam gi" (khong mo ta)', /nói rõ SDVICO đang làm gì/.test(t2), false);
eq('topic: co luat vai SDVICO co dieu kien', t1.includes('Chỉ nói người trong clip là đội SDVICO khi mô tả hoặc tên clip ghi rõ') && t2.includes('Chỉ nói người trong clip là đội SDVICO khi mô tả hoặc tên clip ghi rõ'), true);
eq('topic: cam tu them dia diem, khach hang, ket qua', t1.includes('không tự thêm địa điểm, khách hàng hay kết quả'), true);
eq('topic: khong khang dinh nguoi trong hinh', t1.includes('không khẳng định người trong hình là ai') && t1.includes("gọi chung là 'trong clip'"), true);

// ---- C3: hasUsableClipDescription / loc clip thieu mo ta ----
const DESC_OK = 'Hai thợ đang lắp máy lọc nước biển trên boong tàu cá, nước ngọt chảy ra từ vòi. | Hợp cảnh: lap_dat';
eq('desc: du dai (sau khi cat phan Hop canh)', hasUsableClipDescription(DESC_OK), true);
eq('desc: rong', hasUsableClipDescription(''), false);
eq('desc: null/undefined', hasUsableClipDescription(null) || hasUsableClipDescription(undefined), false);
eq('desc: ngan duoi 60', hasUsableClipDescription('Hai thợ lắp máy lọc nước trên boong tàu.'), false);
eq('desc: phan chinh ngan, phan Hop canh dai KHONG tinh', hasUsableClipDescription('Hai thợ lắp máy. | Hợp cảnh: lap_dat, tau_ca, khoang_may, ngu_dan, bien_xa_bo, nuoc_ngot'), false);
eq('desc: dung 60 ky tu dat', hasUsableClipDescription('a'.repeat(60)), true);
eq('desc: 59 ky tu khong dat', hasUsableClipDescription('a'.repeat(59)), false);
eq('desc: toan khoang trang', hasUsableClipDescription(' '.repeat(100)), false);
eq('filter: filterContentClips bo clip thieu mo ta va clip R&D', filterContentClips([
  { id: 'k1', title: 'Lap may loc nuoc', description: DESC_OK },
  { id: 'k2', title: 'Chi co ten clip', description: '' },
  { id: 'k3', title: 'Mo ta ngan', description: 'Thợ lắp máy.' },
  { id: 'k4', title: 'Quay man hinh', description: 'Clip quay màn hình máy tính trong văn phòng, phần mềm mô phỏng đang chạy thử nghiệm.' },
  { id: 'k5', title: 'Khong co truong description' },
]).map((a) => a.id), ['k1']);
eq('filter: danh sach rong/null', filterContentClips(null), []);

// ---- C1: genFlags, resolveWitnessBody mo rong, applyGenFlagsToTicket ----
const Q_BODY = 'Clip cho thấy đội SDVICO thử phần mềm lái tự động ngay trên máy tính, chạy mô phỏng trước khi đưa xuống tàu thật.';
const mixedQ = `${Q_BODY} Bà con thấy việc thử trước như vậy có cần không?\n\n#SDVICO`;
const lostQ = `${Q_BODY} ${S2}\n\n#SDVICO`;
const keepQ = resolveWitnessBody(lostQ);
eq('resolve: cat cau thi tra cut', keepQ.cut.length === 1 && keepQ.cut[0].includes('Nhớ lại'), true);
eq('resolve: cat xong mat cau hoi ket -> lostClosingQuestion', keepQ.lostClosingQuestion, true);
const withQ = resolveWitnessBody(`${Q_BODY} ${S2} Bà con thấy việc thử trước như vậy có cần không?\n\n#SDVICO`);
eq('resolve: con cau hoi ket -> khong mat', withQ.lostClosingQuestion === false && withQ.cut.length === 1, true);
const clean = resolveWitnessBody(mixedQ);
eq('resolve: bai sach khong co gi', clean.cut.length === 0 && clean.warn.length === 0 && clean.lostClosingQuestion === false, true);
const kept2 = resolveWitnessBody(POST);
eq('resolve: giu nguyen thi cut rong, warn day', kept2.cut.length === 0 && kept2.warn.length === 3 && kept2.lostClosingQuestion === false, true);
eq('genFlags: build tu cat + mat cau hoi', buildGenFlags(keepQ), { witness_kept: [], witness_cut: keepQ.cut, lost_closing_question: true });
eq('genFlags: build tu giu nguyen', buildGenFlags(kept2), { witness_kept: kept2.warn, witness_cut: [], lost_closing_question: false });
eq('genFlags: rong khong ghi', hasGenFlags(buildGenFlags(clean)), false);
eq('genFlags: null/undefined khong ghi', hasGenFlags(null) || hasGenFlags(undefined), false);
eq('genFlags: chi witness_cut van ghi', hasGenFlags({ witness_kept: [], witness_cut: ['x'], lost_closing_question: false }), true);
eq('genFlags: chi lost_closing_question van ghi', hasGenFlags({ witness_kept: [], witness_cut: [], lost_closing_question: true }), true);
const tk = applyGenFlagsToTicket({ title: '💬 Hỏi bà con X', risk: 'none', genFlags: buildGenFlags(kept2) });
eq('ticket: con cau bia -> tien to + amber', tk.title === '⚠️ Cần sửa: 💬 Hỏi bà con X' && tk.risk === 'amber' && tk.needsFix, true);
const tk2 = applyGenFlagsToTicket({ title: 'T', risk: 'none', genFlags: buildGenFlags(keepQ) });
eq('ticket: mat cau hoi ket -> tien to + amber', tk2.title.startsWith('⚠️ Cần sửa: ') && tk2.risk === 'amber', true);
const tk3 = applyGenFlagsToTicket({ title: 'T', risk: 'red', genFlags: buildGenFlags(kept2) });
eq('ticket: risk red giu nguyen', tk3.risk, 'red');
const tk4 = applyGenFlagsToTicket({ title: 'T', risk: 'none', genFlags: { witness_kept: [], witness_cut: ['x'], lost_closing_question: false } });
eq('ticket: chi da cat thi KHONG them tien to', tk4.title === 'T' && tk4.risk === 'none' && !tk4.needsFix, true);
eq('ticket: khong co genFlags giu nguyen', applyGenFlagsToTicket({ title: 'T', risk: 'none', genFlags: null }).title, 'T');
// hasClosingQuestion cung luat voi scanPlaybook (compliance.mjs ban Vercel).
const parityTexts = [mixedQ, lostQ, 'Một dòng.\n\nHai dòng?\n\n#tag', 'Câu hỏi ở đầu?\nA.\nB.\nC.\nD.', '', 'Không có gì cả', 'Hỏi gì đó?\n#SDVICO #tauca'];
eq('hasClosingQuestion khop scanPlaybook', parityTexts.map((t) => hasClosingQuestion(t)), parityTexts.map((t) => scanPlaybook(t, { kind: 'content' }).hasQuestionCTA));

// ---- C2: safeContentType / safeContentChoice ----
eq('safeType: portrait -> engage', safeContentType('portrait'), 'engage');
eq('safeType: cac loai khac giu nguyen', ['qa', 'checklist', 'glossary', 'tip', 'engage', 'news', 'viral', 'seeding'].map(safeContentType), ['qa', 'checklist', 'glossary', 'tip', 'engage', 'news', 'viral', 'seeding']);
eq('safeType: undefined giu nguyen', safeContentType(undefined), undefined);
const sc = safeContentChoice('portrait', 'chân dung một bác thuyền trưởng nhiều năm gắn bó với biển');
eq('safeChoice: portrait doi loai va bo chu de chan dung', sc.type === 'engage' && sc.swapped && sc.topicText === SAFE_ENGAGE_TOPIC, true);
eq('safeChoice: chu de thay khong chua chan dung', /chân dung|thuyền trưởng/.test(SAFE_ENGAGE_TOPIC), false);
const sc2 = safeContentChoice('tip', 'mẹo giữ máy bền');
eq('safeChoice: tip giu nguyen', sc2.type === 'tip' && !sc2.swapped && sc2.topicText === 'mẹo giữ máy bền', true);
eq('safeChoice: portrait + fromClip giu chu de bam clip', safeContentChoice('portrait', 'chu de clip', true).topicText, 'chu de clip');

// ---- C4c: temperature theo clip ----
eq('temperature: bai theo clip 0.7', contentTemperature({ type: 'tip', topic: 'x', fromClip: true }), 0.7);
eq('temperature: bai thuong 1.05', contentTemperature({ type: 'tip', topic: 'x' }), 1.05);
eq('temperature: string 1.05', contentTemperature('chu de'), 1.05);
eq('temperature: undefined 1.05', contentTemperature(undefined), 1.05);

// ---- C4a + C1 + C2 + C4c: hai ban social.mjs dung dung cac ham va prompt ----
const socialLocal = readFileSync(here('./social.mjs'), 'utf8');
const socialApp = readFileSync(here('../../../apps/approval-ui/lib/gen/social.mjs'), 'utf8');
for (const [label, src] of [['local', socialLocal], ['vercel', socialApp]]) {
  eq(`social ${label}: mo ta cong ty moi`, src.includes('cung cấp sản phẩm và giải pháp công nghệ cho ngành biển và thủy sản: tự phát triển một số sản phẩm (như máy lọc nước biển), đồng thời phân phối và lắp đặt thiết bị của các hãng.'), true);
  eq(`social ${label}: het cau cu nha phan phoi thiet bi hang hai`, src.includes('Bạn viết bài cộng đồng cho trang của Công ty SDVICO, nhà phân phối thiết bị hàng hải'), false);
  eq(`social ${label}: vai SDVICO co dieu kien`, src.includes('Nhắc SDVICO tối đa 1 lần; nếu chủ đề đã nêu rõ vai trò của SDVICO thì được nói tự nhiên vai trò đó, không thì không gán vai trò.'), true);
  eq(`social ${label}: het cau "tuyet doi khong nhac thuong hieu" cho moi bai`, src.includes('Chỉ nhắc SDVICO đồng hành nếu hợp cảnh'), false);
  eq(`social ${label}: dung safeContentChoice`, src.includes('safeContentChoice('), true);
  eq(`social ${label}: dung contentTemperature`, src.includes('temperature: contentTemperature(chosen)'), true);
  eq(`social ${label}: tra genFlags`, /return \{ text, body, headline, topic: topicText, contentType: type, hashtags: tags, assessment, genFlags \}/.test(src), true);
}
eq('social vercel: chay lai scanPlaybook sau khi cat', socialApp.includes("scanPlaybook(body, { kind: playbookKind }).violations.includes('no_question_cta')"), true);

// ---- Hai duong rotate: loc clip, portrait=0, gen_flags, gioi han video/ngay ----
const rotRun = readFileSync(here('./rotate-run.mjs'), 'utf8');
const rotRoute = readFileSync(here('../../../apps/approval-ui/app/api/rotate/route.ts'), 'utf8');
eq('rotate-run: portrait weight 0', /portrait: 0, news: 0/.test(rotRun), true);
eq('route: portrait weight 0', /portrait: 0, news: 0/.test(rotRoute), true);
eq('rotate-run: loc clip bang filterContentClips', rotRun.includes('pickFreshClips(filterContentClips('), true);
eq('route: loc clip bang filterContentClips', rotRoute.includes('pickFreshClips(filterContentClips('), true);
eq('rotate-run: gioi han 1 video content/ngay', rotRun.includes('contentVideoToday < 1'), true);
eq('route: gioi han 1 video content/ngay', rotRoute.includes('contentVideoToday < 1'), true);
eq('rotate-run: ghi gen_flags vao bai va phieu', (rotRun.match(/gen_flags: genFlags/g) || []).length === 2, true);
eq('route: ghi gen_flags vao bai va phieu', (rotRoute.match(/gen_flags: genFlags/g) || []).length === 2, true);
eq('rotate-run: tieu de phieu qua applyGenFlagsToTicket', rotRun.includes('title: ticket.title'), true);
eq('route: tieu de phieu qua applyGenFlagsToTicket', rotRoute.includes('title: ticket.title'), true);
eq('rotate-run: topic clip co fromClip', rotRun.includes('fromClip: true'), true);
eq('route: topic clip co fromClip', rotRoute.includes('fromClip: true'), true);

// ---- hai ban sao phai giong nhau ----
const a = readFileSync(here('./clip-guard.mjs'), 'utf8');
const b = readFileSync(here('../../../apps/approval-ui/lib/gen/clip-guard.mjs'), 'utf8');
eq('ban sao clip-guard.mjs giong nhau', a === b, true);

let fail = 0;
for (const c of cases) {
  if (!c.ok) { fail += 1; console.log(`X ${c.name}\n   got : ${JSON.stringify(c.got)}\n   want: ${JSON.stringify(c.want)}`); }
}
console.log(`${cases.length - fail}/${cases.length} ca dat`);
process.exit(fail ? 1 : 0);
