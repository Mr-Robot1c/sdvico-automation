// test-pick-image.mjs — kiểm tầng ảnh kho của pickImageForContent (21/10: bài "dầu diesel bẩn"
// dính ảnh tiệc kỷ niệm vì tầng Content lấy ngẫu nhiên). Chạy: npm run test:pickimg (không mạng,
// không API key: gọi model chấm sẽ lỗi, đúng nhánh "chấm lỗi" cần kiểm).
for (const k of ['GEMINI_API_KEY', 'GOOGLE_CSE_API_KEY', 'PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY']) delete process.env[k];
const { rankHouseImages, pickImageForContent } = await import('./pick-image.mjs');

const cases = [];
const ok = (name, cond, got) => cases.push({ name, ok: !!cond, got });

const party = { id: 'party', product_group: 'Content', title: 'Hội nghị kỷ niệm sự kiện và trưng bày thiết bị doanh nghiệp', description: 'Nhiều người ngồi dự tiệc tại hội trường lớn có màn hình LED. | Hợp cảnh: doi_song | Từ khoá: su kien, hoi nghi, ky niem' };
const filter = { id: 'filter', product_group: 'Content', title: 'Nhãn dán thiết bị lọc dầu diesel SDVICO', description: 'Cận cảnh bình lọc dầu diesel trên tàu cá, cặn dầu bám đáy. | Từ khoá: loc dau, dau diesel, can dau' };
const rust = { id: 'rust', product_group: 'Content', title: 'Bồn chứa rỉ sét', description: 'Bình chứa dầu bị rỉ sét trong khoang máy tàu.' };
const noDesc = { id: 'nodesc', product_group: 'Content', title: 'Dầu diesel bẩn', description: '' };
const post = 'Cách nhận biết dầu diesel bẩn để tránh mất tiền oan. Bình chứa dầu bị rỉ sét, đóng cặn lâu ngày. Nên lắp bộ lọc tách nước.';

// 1. Lọc thô theo mô tả
const r = rankHouseImages([party, filter, rust, noDesc], post);
ok('ảnh tiệc không vào danh sách ứng viên', !r.some((x) => x.id === 'party'), r.map((x) => x.id));
ok('ảnh lọc dầu diesel có mặt', r.some((x) => x.id === 'filter'), r.map((x) => x.id));
ok('ảnh rỉ sét có mặt', r.some((x) => x.id === 'rust'));
ok('ảnh không mô tả bị bỏ', !r.some((x) => x.id === 'nodesc'));
ok('chỉ cặp chữ chung chung -> không ứng viên', rankHouseImages([filter], 'bà con ngư dân tàu cá').length === 0);
const used = new Map([['filter', '2026-10-20']]);
const twin = { ...filter, id: 'filter2' };
ok('cùng điểm thì ảnh chưa dùng lên trước', rankHouseImages([filter, twin], post, used)[0]?.id === 'filter2');

// 2. Không chấm được (không key) + chỉ có ảnh Content -> KHÔNG lấy ngẫu nhiên, để trống kèm cảnh báo
const folders = new Map([['Content', { images: [party, filter, rust], videos: [] }]]);
const p1 = await pickImageForContent(null, folders, post, null, post);
ok('tầng Content chấm lỗi -> không gắn ảnh', !p1.id && !p1.url, p1);
ok('có cảnh báo cho người duyệt', !!p1.warn, p1);

// 3. Kho rỗng
const p2 = await pickImageForContent(null, new Map(), post, null, post);
ok('kho rỗng -> không ảnh, có cảnh báo', !p2.id && !!p2.warn, p2);

const fail = cases.filter((c) => !c.ok);
for (const c of fail) console.log(`FAIL  ${c.name}  got=${JSON.stringify(c.got)}`);
console.log(`${cases.length - fail.length}/${cases.length} test pick-image ${fail.length ? 'CÓ LỖI' : 'xanh'}`);
process.exit(fail.length ? 1 : 0);
