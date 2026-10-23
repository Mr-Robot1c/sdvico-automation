// test-rank-products.mjs — kiểm 22/10: luật xếp bậc BOSS dùng chung (4 tuần gộp, không thắng khi 0 tương tác).
// Chạy: npm run test:rank (không mạng).
import { rankProducts, mergeProductWeeks, MIN_POSTS_4W } from './rank-products.mjs';

const cases = [];
const ok = (name, cond, got) => cases.push({ name, ok: !!cond, got });
const tierOf = (rows, name) => rows.find((r) => r.product === name)?.tier;

// 1. Trường hợp thật 18/10: lọc dầu 2 bài 0 tương tác từng được xếp "thắng"
const zero = rankProducts([{ product: 'Máy Lọc Dầu Diesel SD12-300', count: 4, totalEng: 0, conversions: 0, avgScore: 5, avgEng: 0 }]);
ok('0 tương tác, 0 đơn -> không thắng', tierOf(zero, 'Máy Lọc Dầu Diesel SD12-300') === 'watch', zero);
ok('0 tương tác -> trọng số không phải 3', zero[0].weight !== 3);

// 2. Có tương tác thì thắng
const two = rankProducts([
  { product: 'A', count: 5, totalEng: 20, conversions: 0, avgScore: 10, avgEng: 4 },
  { product: 'B', count: 5, totalEng: 2, conversions: 0, avgScore: 2, avgEng: 0 },
  { product: 'C', count: 5, totalEng: 5, conversions: 0, avgScore: 5, avgEng: 1 },
]);
ok('sản phẩm dẫn đầu có tương tác -> thắng', tierOf(two, 'A') === 'winner', two);
ok('sản phẩm đáy chưa đơn -> đuối', tierOf(two, 'B') === 'weak', two);
ok('ở giữa -> theo dõi', tierOf(two, 'C') === 'watch', two);

// 3. Có đơn mà 0 tương tác vẫn được thắng (đơn quan trọng hơn like)
const conv = rankProducts([{ product: 'A', count: 3, totalEng: 0, conversions: 2, avgScore: 1, avgEng: 0 }, { product: 'B', count: 3, totalEng: 9, conversions: 0, avgScore: 9, avgEng: 3 }]);
ok('có đơn -> xếp trên và thắng', tierOf(conv, 'A') === 'winner', conv);

// 4. Ngưỡng bài 4 tuần, loại "Bài content" và "Khác"
const few = rankProducts([{ product: 'A', count: MIN_POSTS_4W - 1, totalEng: 50, conversions: 0, avgScore: 50, avgEng: 25 }, { product: 'Bài content', count: 9, totalEng: 40, conversions: 0, avgScore: 9, avgEng: 4 }, { product: 'Khác', count: 9, totalEng: 9, conversions: 0, avgScore: 1, avgEng: 1 }]);
ok('dưới ngưỡng bài -> chưa đủ số liệu', tierOf(few, 'A') === 'insufficient', few);
ok('Bài content và Khác không vào bảng', !few.some((r) => r.product === 'Bài content' || r.product === 'Khác'));

// 5. Một sản phẩm duy nhất không có tương tác: theo dõi, không bị đánh đuối
ok('một sản phẩm 0 tương tác -> theo dõi, không đuối', tierOf(rankProducts([{ product: 'A', count: 6, totalEng: 0, conversions: 0, avgScore: 0, avgEng: 0 }]), 'A') === 'watch');

// 5b. Chỉ một sản phẩm đủ bài thì không có gì để so: không thắng dù có tương tác
const solo = rankProducts([{ product: 'Máy Lọc Dầu Diesel SD12-300', count: 16, totalEng: 9, conversions: 0, avgScore: 3, avgEng: 1 }, { product: 'S-Tracking', count: 2, totalEng: 12, conversions: 0, avgScore: 9, avgEng: 6 }]);
ok('một sản phẩm đủ bài (dữ liệu thật 4 tuần tới 25/10) -> theo dõi', tierOf(solo, 'Máy Lọc Dầu Diesel SD12-300') === 'watch', solo);

// 6. Gộp 4 tuần: cộng dồn rồi chia lại trung bình
const merged = mergeProductWeeks([
  [{ product: 'A', count: 2, totalScore: 10, totalEng: 4, totalViews: 100, conversions: 0, avgScore: 5, avgEng: 2 }],
  [{ product: 'A', count: 1, totalScore: 2, totalEng: 0, totalViews: 10, conversions: 1, avgScore: 2, avgEng: 0 }, { product: 'B', count: 1, totalScore: 1, totalEng: 1, totalViews: 5, conversions: 0, avgScore: 1, avgEng: 1 }],
  [],
]);
const a = merged.find((p) => p.product === 'A');
ok('gộp: số bài cộng dồn', a.count === 3 && a.totalEng === 4 && a.conversions === 1, a);
ok('gộp: trung bình tính lại', Math.abs(a.avgScore - 4) < 1e-9 && a.avgEng === 1, a);
ok('gộp: sản phẩm chỉ có ở một tuần vẫn giữ', merged.some((p) => p.product === 'B'));

const fail = cases.filter((c) => !c.ok);
for (const c of fail) console.log(`FAIL  ${c.name}  got=${JSON.stringify(c.got)}`);
console.log(`${cases.length - fail.length}/${cases.length} test rank ${fail.length ? 'CÓ LỖI' : 'xanh'}`);
process.exit(fail.length ? 1 : 0);
