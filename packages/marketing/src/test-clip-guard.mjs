// test-clip-guard.mjs - kiem rao bai content theo clip (8/10). Chay: npm run test:clipguard
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  looksLikeInternalRnD, dropInternalRnDClips, buildClipContentTopic, cleanClipDescription,
  fabricatedWitnessSentences, stripFabricatedSentences, resolveWitnessBody,
} from './clip-guard.mjs';

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

// ---- hai ban sao phai giong nhau ----
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const a = readFileSync(here('./clip-guard.mjs'), 'utf8');
const b = readFileSync(here('../../../apps/approval-ui/lib/gen/clip-guard.mjs'), 'utf8');
eq('ban sao clip-guard.mjs giong nhau', a === b, true);

let fail = 0;
for (const c of cases) {
  if (!c.ok) { fail += 1; console.log(`X ${c.name}\n   got : ${JSON.stringify(c.got)}\n   want: ${JSON.stringify(c.want)}`); }
}
console.log(`${cases.length - fail}/${cases.length} ca dat`);
process.exit(fail ? 1 : 0);
