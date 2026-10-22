// test-direction-dedupe.mjs — kiểm 22/10: hướng đi trùng ý bị bắt bằng code (tiêu đề thật của kế hoạch 12-25/10).
// Chạy: npm run test:dedupe (không mạng).
import { sameAngle, duplicateOf } from './direction-dedupe.mjs';

const cases = [];
const ok = (name, cond) => cases.push({ name, ok: !!cond });
const same = (a, b) => ok(`TRÙNG: ${a} ~ ${b}`, sameAngle(a, b));
const diff = (a, b) => ok(`KHÁC: ${a} ~ ${b}`, !sameAngle(a, b));

// S-Tracking: cùng ý "hậu quả khi giấu / ngắt / mất sóng VMS" (đăng 19/10 rồi lại ra 22/10).
same('Hậu quả nặng nề khi giấu thiết bị giám sát hành trình', 'Hậu quả nặng khi ngắt kết nối VMS');
same('Hậu quả nặng khi ngắt kết nối VMS', 'Hậu quả mất sóng VMS và bài học đắt giá');
same('Cảnh báo hậu quả pháp lý khi tự ý ngắt kết nối VMS', 'Hậu quả nặng khi ngắt kết nối VMS');
diff('Hậu quả nặng khi ngắt kết nối VMS', 'Chằng chống tàu cá và kiểm tra VMS trước bão số 6');
// Lọc dầu SF300B: mọi hướng đều có chữ "lọc dầu", không được coi là trùng chỉ vì thế.
same('Chuyện thực tế thợ máy SDVICO lắp lọc dầu tận bến', 'Chuyện thợ máy bám cảng lắp đặt bộ lọc dầu cho tàu lớn');
same('Tận dụng giá dầu hạ nhiệt để tối ưu chi phí chuyến biển', 'Bài toán giá dầu giảm và cơ hội tối ưu nhiên liệu');
same('Checklist vệ sinh túi lọc dầu trước chuyến biển dài ngày', 'Checklist bốn bước lọc sạch cặn dầu trước khi nhổ neo');
diff('Bình lọc dầu đôi inox hay lọc cơ xả tay tiện hơn', 'Chuyện thực tế thợ máy SDVICO lắp lọc dầu tận bến');
diff('Kinh nghiệm chọn vị trí lắp đặt bình lọc dầu buồng máy', 'Chuyện thực tế thợ máy SDVICO lắp lọc dầu tận bến');
diff('Bài toán hoàn vốn nhanh từ bình lọc dầu inox', 'Tận dụng giá dầu hạ nhiệt để tối ưu chi phí chuyến biển');
diff('Checklist vệ sinh túi lọc dầu trước chuyến biển dài ngày', 'Kinh nghiệm chọn vị trí lắp đặt bình lọc dầu buồng máy');
diff('Treo cờ đỏ thắm vươn khơi cùng tinh thần tự hào biển đảo', 'Hậu quả mất sóng VMS và bài học đắt giá');
// duplicateOf trả tiêu đề bị trùng, hoặc null
ok('duplicateOf tìm ra bài cũ', duplicateOf('Hậu quả mất sóng VMS và bài học đắt giá', ['Mẹo xả e đường ống lọc dầu tàu cá', 'Hậu quả nặng khi ngắt kết nối VMS']) === 'Hậu quả nặng khi ngắt kết nối VMS');
ok('duplicateOf không trùng -> null', duplicateOf('Chằng chống tàu cá và kiểm tra VMS trước bão số 6', ['Hậu quả nặng khi ngắt kết nối VMS']) === null);
ok('tiêu đề rỗng không trùng', !sameAngle('', 'Hậu quả nặng khi ngắt kết nối VMS'));

const fail = cases.filter((c) => !c.ok);
for (const c of fail) console.log(`FAIL  ${c.name}`);
console.log(`${cases.length - fail.length}/${cases.length} test dedupe ${fail.length ? 'CÓ LỖI' : 'xanh'}`);
process.exit(fail.length ? 1 : 0);
