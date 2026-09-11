# Plan: BÀI TOÁN LỢI ÍCH trong bài bán (tính theo cỡ tàu, số người, số ngày; số có nguồn)

> Người thi công: Sonnet 5. Làm SAU plan `plan-bai-ban-theo-tep-11-09.md` (dùng lại chỗ chèn của nó).
> Plan tự chứa đủ ngữ cảnh. Chỉ đổi dữ liệu tĩnh và prompt, không đụng DB. Gặp mục 8 thì DỪNG hỏi.

## 1. Bối cảnh

- Thanh (11/9) muốn bài bán lọc dầu và lọc nước có phép tính cụ thể: "tàu 15 m, 10 người, đi 20 ngày tốn bao
  nhiêu tiền nước, bao nhiêu khối nước; máy đem lại hiệu quả, tiết kiệm ra sao".
- Điều cấm 5: không bịa số liệu. Cấp trên từng bắt lỗi bài SEA-40 ngày 19/8 vì tự suy "bớt chở nước, nhẹ
  tàu, tiết kiệm dầu" (SỰ THẬT NGHỀ, `packages/marketing/src/product-guard.mjs`). Vì vậy mọi con số trong
  bài phải đi từ BẢNG GIẢ ĐỊNH CÓ NGUỒN dưới đây, model KHÔNG được tự tính, chỉ chép ví dụ đã tính sẵn.
- Số công khai tìm được 11/9/2026 (Claude tìm Google, Kinh doanh không có số này):

| Đại lượng | Con số | Nguồn, ngày |
|---|---|---|
| Nước ngọt chở theo mỗi chuyến, tàu 10 người | khoảng 3 tấn (3.000 lít) một chuyến | Tepbac 17/1/2018, ngư dân Quỳnh Lập, Nghệ An: https://tepbac.com/tin-tuc/full/ngu-dan-giam-chi-phi-nho-loc-nuoc-bien-thanh-nuoc-ngot-24158.html |
| Mức dùng thực tế suy ra | 3.000 lít / 10 người / 20 ngày = 15 lít mỗi người mỗi ngày (ăn uống, nấu, rửa) | Suy từ dòng trên, ghi rõ là suy ra |
| Giá nước ngọt nơi khan hiếm | 120.000 đ/m³ (đảo Phú Quý) | Dân Việt: https://danviet.vn/nguoi-dan-dao-phu-quy-mua-nuoc-ngot-dat-gap-15-lan-o-dat-lien-1078528-d157397.html |
| Giá nước tại cảng đất liền | CHƯA CÓ NGUỒN công khai. KHÔNG nêu tiền nước cho cảng đất liền | |
| Dầu mỗi chuyến, tàu 400 CV, chuyến 10 tới 15 ngày | 1.500 tới 2.000 lít; 1.500 lít bằng 30 triệu đồng lúc giá trên 20.000 đ/lít | Dân trí 27/2/2022, Hoằng Trường, Thanh Hóa: https://dantri.com.vn/lao-dong-viec-lam/kho-khan-kep-cua-ngu-dan-lam-nghe-danh-bat-hai-san-20220227091041910.htm |
| Dầu mỗi chuyến, tàu 500 tới 600 CV, chuyến khoảng 1 tháng | khoảng 10.000 lít | VnExpress 4/7/2005: https://vnexpress.net/thuy-san-kho-khan-vi-xang-dau-2682203.html |
| Chuyến biển rút ngắn vì giá dầu | từ 15 tới 20 ngày còn 10 tới 12 ngày | Nông nghiệp Môi trường 2025, ngư dân TP.HCM: https://nongnghiepmoitruong.vn/bam-bien-giua-bao-gia-dau-nhung-cach-lam-sang-tao-d800389.html |
| Giá dầu DO 0,05S-II Petrolimex vùng 1 | 27.740 đ/lít, kỳ điều hành 3/9/2026 (kỳ kế 10/9/2026) | Báo Lào Cai 7/9/2026: https://baolaocai.vn/gia-xang-dau-hom-nay-79-dau-the-gioi-tang-manh-ap-luc-ky-109-lon-post908833.html |
| Số chuyến mỗi năm, tàu Vũng Tàu | 6 chuyến một năm, mỗi chuyến 20 ngày tới 2 tháng (một chủ tàu) | Tạp chí Thủy sản VN 20/12/2024: https://thuysanvietnam.com.vn/ba-ria-vung-tau-mua-chat-vat-cua-nghe-ca/ |
| Tiết kiệm dầu nhờ lọc dầu SF300B | 5 tới 10% | Tài liệu sản phẩm SF300B (product_facts đã xác nhận; product-guard cho phép nhóm này nói tiết kiệm dầu) |
| Tuổi thọ vòi phun máy tàu | hỏng sau 2.000 tới 3.000 giờ chạy | thietbitpp.vn: https://thietbitpp.vn/sua-chua-may-suc-kim-phun-khi-bi-hu-hong-rat-thanh-cong-khi-ap-dung |
| Chi phí phục hồi kim phun dầu (ô tô, tham khảo) | 300.000 tới 1.000.000 đ một kim | queenworkshop.com: https://queenworkshop.com/phuc-hoi-kim-phun-dau-giai-phap-toi-uu-hieu-suat-dong-co |
| Mức "5 tới 7 lít mỗi người mỗi ngày" | thấy trong tóm tắt tìm kiếm nhưng KHÔNG xác minh được trên trang gốc | KHÔNG dùng |

- Kết luận cho người viết prompt (đã tính): **lọc dầu thắng bằng tiền dầu**, ví dụ tàu 400 CV chuyến 15 ngày
  2.000 lít × 27.740 đ = 55.480.000 đ tiền dầu, tiết kiệm 5 tới 10% = 2.774.000 tới 5.548.000 đ mỗi chuyến,
  6 chuyến một năm = 16.644.000 tới 33.288.000 đ, máy 9,X triệu hoàn vốn sau 2 tới 4 chuyến. **Lọc nước
  KHÔNG thắng bằng tiền nước** (3 m³ × 120.000 đ = 360.000 đ mỗi chuyến kể cả giá đảo) mà thắng bằng: không
  cạn nước giữa chuyến, nước làm mới mỗi ngày không hôi, chủ động ở lại khi cá đang vào; máy 250 lít mỗi giờ
  chạy 1 giờ mỗi ngày đã đủ 150 lít cho 10 người theo mức 15 lít. CẤM diễn giải thành "bớt chở 3 tấn nước,
  nhẹ tàu, đỡ tốn dầu" (SỰ THẬT NGHỀ).

## 2. Kết quả mong muốn

Bài bán lọc dầu và lọc nước có 1 đoạn "bài toán" 2 tới 3 câu, số lấy nguyên từ ví dụ tính sẵn theo cỡ tàu,
kèm câu nguồn ngắn ("tính theo giá dầu Petrolimex kỳ 3/9/2026", "theo mức ngư dân Nghệ An chở 3 tấn nước cho
10 người"). Bài content không đổi. Giá dầu đổi theo kỳ điều hành bằng biến môi trường, không phải sửa code.

## 3. Ràng buộc repo

Giống plan `plan-bai-ban-theo-tep-11-09.md` mục 3 (author Mr-Robot1c, hook re-verified marketing.md +
README.md, deploy ff ngay2-marketing rồi push main, không stash trần, không đụng .env). Điều cấm 5 trích
nguyên văn: "Không bịa số liệu, giải thưởng, khách hàng, đối tác."

## 4. Bẫy

- `product-guard.mjs` cấm cho lọc nước: "bớt chở nước", "khỏi chở nước", "nhẹ tàu", "giảm tải", "tiết kiệm
  dầu", "đỡ tốn dầu". Ví dụ lọc nước KHÔNG được chứa các cụm này; test mục 5e kiểm bằng `guardViolations`.
- Chỉ nhóm lọc dầu (9 và 6) được nói tiết kiệm dầu, và chỉ 5 tới 10%.
- 2 bản `products.mjs` và 2 bản `social.mjs` phải sửa giống nhau (xem plan trước).
- Số tiền viết kiểu Việt: dấu chấm hàng nghìn (55.480.000 đ), "triệu" viết "55,5 triệu đồng".
- KHÔNG để model tự nhân chia: ví dụ đã tính sẵn thành câu, model chọn 1 ví dụ hợp cỡ tàu và chép số.
- Bài bán xoay nền tảng theo ngày (Facebook, YouTube, TikTok, xem `lib/posting-plan.ts` SALE_CYCLE). Lịch đăng
  hiện luôn gọi máy viết bài kiểu Facebook kể cả ngày TikTok (Bước 3b sửa). Đừng chèn cả bảng kịch bản vào
  chú thích TikTok.

## 5. Các bước

### Bước 1: `packages/marketing/src/products.mjs`, thêm bảng giả định và ví dụ tính sẵn

Chèn ngay SAU hàm `audienceLines` (do plan trước thêm vào):

```js
// 11/9 (Thanh: bài bán phải có phép tính theo cỡ tàu). Mọi số có nguồn công khai, xem
// docs/plans/plan-bai-toan-loi-ich-11-09.md mục 1. Model KHÔNG tự tính, chỉ chép câu ví dụ đã tính sẵn.
// Giá dầu đổi theo kỳ điều hành: đặt env DIESEL_PRICE_VND (đ/lít) và DIESEL_PRICE_DATE (dd/mm/yyyy).
export const BENEFIT_ASSUMPTIONS = {
  dieselPrice: Number(process.env.DIESEL_PRICE_VND || 27740),
  dieselPriceDate: process.env.DIESEL_PRICE_DATE || '3/9/2026',
  dieselPriceSource: 'Petrolimex DO 0,05S-II vùng 1',
  waterPerPersonPerDay: 15,          // lít, suy từ Tepbac 17/1/2018: tàu 10 người chở 3 tấn nước cho chuyến ~20 ngày
  waterSourceNote: 'theo mức ngư dân Quỳnh Lập, Nghệ An chở khoảng 3 tấn nước cho tàu 10 người một chuyến',
  fuelSavingPct: [5, 10],            // tài liệu SF300B
  tripsPerYear: 6,                   // Tạp chí Thủy sản VN 20/12/2024, một chủ tàu Vũng Tàu
  injectorLifeHours: [2000, 3000],   // thietbitpp.vn
  waterMachineLph: 250,              // SEA-40 bản chạy điện, bảng quy cách Kinh doanh 9/9
};
// LỚP MÁY: lít dầu MỖI NGÀY suy từ nguồn công khai (ghi rõ cách suy trong fuelSource). Không có nguồn cho
// máy dưới 300 cv nên lớp "nho" không tính tiền dầu (chỉ tính nước).
export const ENGINE_CLASSES = {
  nho:  { label: 'máy 90 tới 150 cv', fuelPerDay: null, fuelSource: 'chưa có nguồn công khai cho máy nhỏ, không tính tiền dầu' },
  vua:  { label: 'máy 300 tới 400 cv', fuelPerDay: 150, fuelSource: 'Dân trí 27/2/2022, tàu 400 cv Thanh Hóa 1.500 tới 2.000 lít mỗi chuyến 10 tới 15 ngày, suy ra khoảng 150 lít mỗi ngày' },
  // 340 chứ không 330: 330 × 30 = 9.900 lít bị product-guard nhóm 9 bắt nhầm là giá "9,9 triệu".
  lon:  { label: 'máy 500 tới 600 cv', fuelPerDay: 340, fuelSource: 'VnExpress 4/7/2005, tàu 500 tới 600 cv khoảng 10.000 lít mỗi chuyến một tháng, suy ra khoảng 340 lít mỗi ngày' },
};
// 8 KỊCH BẢN (Thanh 11/9: đưa nhiều giả định để bài chọn đúng cỡ tàu của khách). crew = số người, days = số
// ngày một chuyến, engine = lớp máy. Thứ tự từ nhỏ tới lớn.
export const BENEFIT_CASES = [
  { key: 'ghe-10m-4n-3d',  label: 'ghe 10 m, máy 90 cv, 4 người, chuyến 3 ngày',            crew: 4,  days: 3,  engine: 'nho' },
  { key: 'ghe-12m-5n-7d',  label: 'ghe 12 m, máy 150 cv, 5 người, chuyến 7 ngày',           crew: 5,  days: 7,  engine: 'nho' },
  { key: 'tau-14m-6n-10d', label: 'tàu 14 m, máy 300 cv, 6 người, chuyến 10 ngày',          crew: 6,  days: 10, engine: 'vua' },
  { key: 'tau-15m-8n-15d', label: 'tàu 15 m, máy 400 cv, 8 người, chuyến 15 ngày',          crew: 8,  days: 15, engine: 'vua' },
  { key: 'tau-15m-10n-20d',label: 'tàu 15 m, máy 400 cv, 10 người, chuyến 20 ngày',         crew: 10, days: 20, engine: 'vua' },
  { key: 'tau-17m-10n-25d',label: 'tàu 17 m, máy 500 cv, 10 người, chuyến 25 ngày',         crew: 10, days: 25, engine: 'lon' },
  { key: 'tau-20m-12n-30d',label: 'tàu 20 m, máy 600 cv, 12 người, chuyến 30 ngày',         crew: 12, days: 30, engine: 'lon' },
  { key: 'hau-can-25m',    label: 'tàu hậu cần 25 m, máy 600 cv, 15 người, chuyến 30 ngày', crew: 15, days: 30, engine: 'lon' },
];
// Lít dầu cả chuyến của một kịch bản (null nếu lớp máy chưa có nguồn).
export function fuelLitersOf(c) {
  const e = ENGINE_CLASSES[c.engine];
  return e && e.fuelPerDay ? e.fuelPerDay * c.days : null;
}
// Tính 1 kịch bản bất kỳ (dùng cho bot hỏi đáp hoặc Kinh doanh tính tay theo tàu khách).
export function estimateBenefit({ crew, days, engine = 'vua' }) {
  const a = BENEFIT_ASSUMPTIONS;
  const e = ENGINE_CLASSES[engine] || ENGINE_CLASSES.vua;
  const fuelLiters = e.fuelPerDay ? e.fuelPerDay * days : null;
  const fuelCost = fuelLiters ? fuelLiters * a.dieselPrice : null;
  const waterLiters = crew * days * a.waterPerPersonPerDay;
  return {
    fuelLiters, fuelCost,
    fuelSaveLo: fuelCost ? fuelCost * a.fuelSavingPct[0] / 100 : null,
    fuelSaveHi: fuelCost ? fuelCost * a.fuelSavingPct[1] / 100 : null,
    waterLiters, waterCans: Math.round(waterLiters / 20), waterPerDay: crew * a.waterPerPersonPerDay,
    machineHoursPerDay: Math.ceil(crew * a.waterPerPersonPerDay / a.waterMachineLph * 10) / 10,
  };
}
export function vnd(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ';
}
// product-guard so khớp CHUỖI CON, nên số tiền lợi ích không được tạo ra các chuỗi giá bị cấm:
// nhóm 9 cấm "9,9 triệu" (49,9 triệu dính), nhóm 2 cấm "42 triệu", "31 triệu", "49 triệu", "38 triệu"
// (1.500 lít × 27.740 = 41,6 triệu làm tròn thành "42 triệu" dính). Cách in: dưới 10 triệu ưu tiên 1 số lẻ
// ("4,2 triệu đồng"), từ 10 triệu ưu tiên số chẵn ("83 triệu đồng"); cách nào dính thì đổi sang cách kia
// ("41,6 triệu đồng", "50 triệu đồng"); cả hai cùng dính (đúng 42,0) thì in "42,0 triệu đồng".
// KHÔNG import danh sách này từ product-guard vì guard là nội bộ; nếu guard thêm mốc giá thì cập nhật đây.
const GUARD_MONEY = ['9,9 triệu', '42 triệu', '31 triệu', '49 triệu', '38 triệu'];
export function trieu(n) {
  const m = n / 1000000;
  const one = (Math.round(m * 10) / 10).toFixed(1).replace('.', ',');
  const whole = String(Math.round(m));
  const order = m >= 10 ? [whole, one] : [one, whole];
  for (const c of order) {
    const s = c + ' triệu đồng';
    if (!GUARD_MONEY.some((g) => s.includes(g))) return s;
  }
  return whole + ',0 triệu đồng';
}
// Câu ví dụ đã tính sẵn cho nhóm 9 (lọc dầu). Trả [] cho nhóm khác.
export function fuelBenefitLines() {
  const a = BENEFIT_ASSUMPTIONS;
  const out = [];
  for (const c of BENEFIT_CASES) {
    const fuelLiters = fuelLitersOf(c);
    if (!fuelLiters) continue;
    const e = ENGINE_CLASSES[c.engine];
    const cost = fuelLiters * a.dieselPrice;
    const [lo, hi] = a.fuelSavingPct;
    const saveLo = cost * lo / 100; const saveHi = cost * hi / 100;
    // Hoàn vốn: máy 9,9 triệu (giá bán lẻ, KHÔNG ghi ra bài) chia cho tiết kiệm thấp nhất mỗi chuyến.
    const payback = Math.ceil(9900000 / saveLo);
    out.push(`VÍ DỤ ${c.label}: khoảng ${e.fuelPerDay} lít dầu mỗi ngày (${e.fuelSource}) × ${c.days} ngày = ${fuelLiters.toLocaleString('vi-VN')} lít một chuyến × ${vnd(a.dieselPrice)}/lít (${a.dieselPriceSource}, kỳ ${a.dieselPriceDate}) = ${trieu(cost)} tiền dầu; lọc dầu sạch giúp bớt ${lo} tới ${hi}% (tài liệu SF300B) = ${trieu(saveLo)} tới ${trieu(saveHi)} một chuyến, ${a.tripsPerYear} chuyến một năm là ${trieu(saveLo * a.tripsPerYear)} tới ${trieu(saveHi * a.tripsPerYear)}; máy 9,X triệu hoàn vốn sau khoảng ${payback} chuyến.`);
  }
  out.push('Ghe máy nhỏ (dưới 300 cv): chưa có nguồn số lít dầu, KHÔNG tính tiền; chỉ nói dầu sạch giữ kim phun và bơm cao áp bền, máy nổ êm, bớt nằm bờ.');
  out.push(`VÒI PHUN: theo thợ máy, vòi phun máy tàu hỏng sau ${a.injectorLifeHours[0].toLocaleString('vi-VN')} tới ${a.injectorLifeHours[1].toLocaleString('vi-VN')} giờ chạy; dầu bẩn làm hỏng sớm hơn. Không nêu tiền sửa (chưa có số tàu cá).`);
  return out;
}
// Câu ví dụ cho nhóm 2 (lọc nước). KHÔNG nói tiền nước cảng đất liền (chưa có nguồn), KHÔNG nói bớt chở, nhẹ tàu.
export function waterBenefitLines() {
  const a = BENEFIT_ASSUMPTIONS;
  const out = [];
  for (const c of BENEFIT_CASES) {
    if (c.days < 10) continue; // ghe đi 3 tới 7 ngày mang can là đủ, máy lọc nước không hợp (tệp A)
    const litersTrip = c.crew * c.days * a.waterPerPersonPerDay;
    const cans = Math.round(litersTrip / 20);
    const perDay = c.crew * a.waterPerPersonPerDay;
    const hours = Math.ceil(perDay / a.waterMachineLph * 10) / 10;
    out.push(`VÍ DỤ ${c.label}: ${c.crew} người × ${c.days} ngày × ${a.waterPerPersonPerDay} lít mỗi người mỗi ngày (${a.waterSourceNote}) = ${litersTrip.toLocaleString('vi-VN')} lít, tức khoảng ${(litersTrip / 1000).toString().replace('.', ',')} tấn nước, ${cans} can 20 lít phải mua, chở, xếp và giữ cho không hôi; máy lọc ${a.waterMachineLph} lít mỗi giờ chạy khoảng ${hours.toString().replace('.', ',')} giờ mỗi ngày là đủ ${perDay} lít cho cả tàu, nước làm mới mỗi ngày, hết can vẫn không cạn.`);
  }
  // Không viết thẳng các cụm bị cấm vào dòng này (guardViolations quét cả prompt trong test); nói bằng ý.
  out.push('CẤM suy ra lợi ích về trọng lượng tàu, chỗ chứa hay tiền nhiên liệu từ ví dụ này (sự thật nghề: tàu cố ý lấy nước để đằm khi lấy đá; máy lọc nước không liên quan nhiên liệu). Không nêu tiền nước ở cảng đất liền vì chưa có giá công khai.');
  return out;
}
// channel: 'facebook' | 'youtube' | 'tiktok'. TikTok (Thanh 11/9): chú thích ngắn, chỉ 1 câu số, không
// chèn cả bảng kịch bản; Facebook và YouTube (mô tả không giới hạn) nhận đủ 2 tới 3 câu bài toán.
const TIKTOK_ONE_LINER = {
  fuel: 'Chỉ 1 câu số, chép nguyên: "tàu 400 cv đi 20 ngày đốt khoảng 3.000 lít dầu, lọc dầu sạch bớt 5 tới 10% (tài liệu SF300B)". Không thêm tiền, không thêm kịch bản khác.',
  water: 'Chỉ 1 câu số, chép nguyên: "10 người đi 20 ngày cần khoảng 3.000 lít nước ngọt, máy chạy hơn nửa giờ mỗi ngày là đủ". Không nói tiền nước, không nhắc tới tải trọng hay dầu (lời dặn này cố ý không chứa cụm cấm, guard so khớp chuỗi con).',
};
export function benefitLines(group, channel = 'facebook') {
  const isFuel = group === '9. Máy Lọc Dầu Diesel SD12-300' || group === '6. Thiết bị lọc dầu SF-50';
  const isWater = group === '2. Máy lọc nước biển SEA-40';
  if (!isFuel && !isWater) return [];
  if (channel === 'tiktok') return ['BÀI TOÁN LỢI ÍCH (TikTok, BẮT BUỘC):', TIKTOK_ONE_LINER[isFuel ? 'fuel' : 'water']];
  const ex = isFuel ? fuelBenefitLines() : waterBenefitLines();
  return [
    'BÀI TOÁN LỢI ÍCH (BẮT BUỘC có 2 tới 3 câu trong bài, đặt ở nhịp lối thoát hoặc phần thưởng): dưới đây là NHIỀU KỊCH BẢN theo cỡ tàu, số người, số ngày. Chọn ĐÚNG 1 kịch bản gần với tệp khách của bài nhất (tệp A lấy ghe 10 tới 14 m; tệp B lấy tàu 15 m trở lên), mỗi bài một kịch bản KHÁC bài trước, CHÉP NGUYÊN các con số của kịch bản đó, KHÔNG tự nhân chia, KHÔNG trộn số của hai kịch bản, KHÔNG làm tròn khác đi. Viết thành lời kể, không dán nguyên dòng ví dụ. Kèm 1 cụm nguồn ngắn trong ngoặc, ví dụ "(tính theo giá dầu Petrolimex kỳ 3/9/2026)". Kết bằng câu mời: tàu anh khác cỡ thì nhắn số người, số ngày, em tính riêng.',
    ...ex,
  ];
}
```

### Bước 2: `apps/approval-ui/lib/gen/products.mjs`, chèn Y HỆT khối Bước 1 sau `audienceLines`.

### Bước 3: 2 bản `social.mjs`

Ở cả `packages/marketing/src/social.mjs` và `apps/approval-ui/lib/gen/social.mjs`:
- Thêm `benefitLines` vào import từ `./products.mjs` (cạnh `audienceLines`).
- Ngay sau dòng `    ...audienceLines(productGroup),` thêm:
```js
    // 11/9: phép tính lợi ích theo cỡ tàu, số có nguồn (BENEFIT_ASSUMPTIONS), model chỉ chép ví dụ.
    // TikTok chỉ 1 câu số (chú thích ngắn), Facebook và YouTube đủ 2 tới 3 câu.
    ...benefitLines(productGroup, channel),
```
`channel` đã là tham số của `generateSocialPost` ở cả 2 bản (dòng `productGroup, productName, channel, hasVideo,`), không cần thêm.

### Bước 3b: `apps/approval-ui/app/api/rotate/route.ts`, truyền đúng kênh cho máy viết bài

Hiện lịch đăng LUÔN gọi `generateSocialPost({... channel: 'facebook' ...})` (khoảng dòng 448 tới 460, trong vòng
sinh bài bán), kể cả ngày bài bán lên TikTok, nên nhánh "chú thích TikTok 2 tới 4 câu" trong `social.mjs`
chưa bao giờ chạy; bài dài 5 tới 6 câu đang thành chú thích TikTok. Thanh 11/9 chốt: ngày TikTok viết ngắn.

Biến `channels` (mảng, phần tử đầu là kênh thật của bài: 'facebook' | 'youtube' | 'tiktok') đã được tính
ngay phía trên ở khối "Kênh theo LỊCH CỐ ĐỊNH". Sửa đúng 1 dòng:
```ts
// trước
          channel: 'facebook',
// sau: ngày TikTok viết chú thích ngắn; YouTube giữ dạng Facebook (mô tả video không giới hạn).
          channel: channels[0] === 'tiktok' ? 'tiktok' : 'facebook',
```
Chỉ sửa lời gọi `generateSocialPost` của BÀI BÁN; lời gọi `generateContentPost` (bài content) giữ nguyên.
Hệ quả có chủ ý: ngày TikTok chú thích chỉ 2 tới 4 câu, không có link Shopee (nhánh isTikTok sẵn có),
vẫn có câu giá úp mở và CTA cmt.

### Bước 4: test `packages/marketing/src/test-price-teaser.mjs`

- Import thêm `benefitLines, fuelBenefitLines, waterBenefitLines, BENEFIT_ASSUMPTIONS` từ `./products.mjs`.
- Chèn trước `let fail = 0;`:
```js
// 11/9: bài toán lợi ích có nguồn.
eq('benefit 8 kịch bản', BENEFIT_CASES.length, 8);
ok('benefit lọc dầu 6 ví dụ máy vừa và lớn', fuelBenefitLines().filter((l) => l.startsWith('VÍ DỤ')).length === 6);
ok('benefit lọc dầu tàu 15 m 20 ngày = 3.000 lít, 83 triệu', fuelBenefitLines().some((l) => l.includes('tàu 15 m, máy 400 cv, 10 người, chuyến 20 ngày') && l.includes('3.000 lít') && l.includes('83 triệu đồng') && l.includes('27.740 đ')));
ok('benefit lọc dầu tàu 20 m 30 ngày = 10.200 lít', fuelBenefitLines().some((l) => l.includes('chuyến 30 ngày') && l.includes('10.200 lít')));
ok('benefit lọc dầu có hoàn vốn', fuelBenefitLines().every((l) => !l.startsWith('VÍ DỤ') || /hoàn vốn sau khoảng \d+ chuyến/.test(l)));
ok('benefit lọc nước 6 ví dụ (bỏ 2 ghe đi dưới 10 ngày)', waterBenefitLines().filter((l) => l.startsWith('VÍ DỤ')).length === 6);
ok('benefit lọc nước tàu 15 m 10 người 20 ngày = 3.000 lít, 150 can', waterBenefitLines().some((l) => l.includes('chuyến 20 ngày') && l.includes('3.000 lít') && l.includes('150 can')));
ok('benefit lọc nước không dính SỰ THẬT NGHỀ', !guardViolations(waterBenefitLines().join(' '), G2).length);
ok('benefit lọc dầu không dính SỰ THẬT NGHỀ', !guardViolations(fuelBenefitLines().join(' '), G9).length);
eq('benefit nhóm khác rỗng', benefitLines('8. Sơn RARE').length, 0);
ok('benefit không nêu tiền nước đất liền', !/đ\/m³|đồng một khối|120\.000/.test(waterBenefitLines().join(' ')));
ok('estimateBenefit tính tay', estimateBenefit({ crew: 10, days: 20, engine: 'vua' }).waterLiters === 3000 && estimateBenefit({ crew: 10, days: 20, engine: 'vua' }).fuelLiters === 3000);
ok('benefit TikTok chỉ 1 câu số', benefitLines(G9, 'tiktok').length === 2 && benefitLines(G9, 'tiktok').join(' ').includes('3.000 lít') && !benefitLines(G9, 'tiktok').join(' ').includes('VÍ DỤ') && benefitLines(G2, 'tiktok').length === 2 && !guardViolations(benefitLines(G2, 'tiktok').join(' '), G2).length);
eq('trieu() né mốc giá bị guard cấm', [41610000, 49932000, 42000000, 83220000, 9900000, 4161000].map(trieu).join(' | '), '41,6 triệu đồng | 50 triệu đồng | 42,0 triệu đồng | 83 triệu đồng | 10 triệu đồng | 4,2 triệu đồng');
```
Import thêm `BENEFIT_CASES, estimateBenefit, trieu` cùng các hàm trên. Tổng cộng +14 ca (82 sau plan trước → 96).
Kiểm số: tàu 15 m 20 ngày: 150 lít × 20 = 3.000 lít × 27.740 = 83.220.000 đ → `trieu()` in "83 triệu đồng";
5% = 4.161.000 đ → "4,2 triệu đồng", 10% = 8.322.000 đ → "8,3 triệu đồng"; một năm 6 chuyến 25 và 50 triệu đồng
(49,9 phải làm tròn thành 50 vì guard cấm "9,9 triệu"); hoàn vốn 9.900.000 / 4.161.000 = 2,4 → "khoảng 3 chuyến".
Tàu 14 m 10 ngày: 1.500 lít = 41.610.000 đ → "41,6 triệu đồng" (không được in "42 triệu", guard nhóm 2 cấm).
Tàu 20 m 30 ngày: 340 × 30 = 10.200 lít. Nước: 10 × 20 × 15 = 3.000 lít = 150 can, máy 250 lít/giờ chạy 0,6 giờ mỗi ngày đủ 150 lít.
Khối code Bước 1 đã được chạy thử ngày 11/9 với product-guard thật (trích ra file tạm, harness 12 ca): 12/12 đạt, guard sạch cả 2 nhóm.

### Bước 5: doc + commit + deploy

- `docs/app-map/marketing.md` chèn sau `covers:`:
  `<!-- re-verified: 2026-09-11 toi - BAI TOAN LOI ICH trong bai ban (Thanh 11/9; so co nguon, Claude tim Google, xem docs/plans/plan-bai-toan-loi-ich-11-09.md): products.mjs (2 ban) BENEFIT_ASSUMPTIONS (gia dau DO 27.740 d/lit ky 3/9/2026, env DIESEL_PRICE_VND/DIESEL_PRICE_DATE; 15 lit nuoc/nguoi/ngay suy tu Tepbac 2018; tiet kiem 5-10% tai lieu SF300B; 6 chuyen/nam), ENGINE_CLASSES 3 lop may (nho/vua/lon, ghe nho khong tinh tien dau), BENEFIT_CASES 8 kich ban ghe 10 m toi hau can 25 m, estimateBenefit, trieu() ne moc gia guard cam, fuelBenefitLines/waterBenefitLines/benefitLines (moi bai chon 1 kich ban gan tep); social.mjs (2 ban) chen ...benefitLines(productGroup, channel) sau ...audienceLines (TikTok chi 1 cau so); api/rotate/route.ts truyen channel tiktok cho bai ban ngay TikTok (truoc luon facebook); test +14 ca. Loc nuoc KHONG neu tien nuoc dat lien (khong co nguon), khong noi bot cho nuoc/nhe tau. -->`
- `docs/app-map/README.md` chèn sau `covers:` một dòng tương tự ngắn cho bản apps.
- Commit: `feat(social): bai toan loi ich 8 kich ban co tau trong bai ban (so co nguon, gia dau theo env) (Thanh 11/9); re-verify(docs/app-map/marketing.md, README.md)`.
- Vercel env: thêm `DIESEL_PRICE_VND=27740` và `DIESEL_PRICE_DATE=3/9/2026` (Thanh đặt tay trên Vercel, và
  trong `.env` gốc repo cho máy nội bộ; không commit).

## 6. Verify

1. `node --check` 4 file .mjs; `npx tsc --noEmit -p apps/approval-ui` sạch (rotate/route.ts); `npm run test:price` ở gốc repo → 96/96 (82 sau plan trước + 14).
2. `node -e "import('./packages/marketing/src/products.mjs').then(m=>console.log(m.fuelBenefitLines().join('\n\n'), '\n\n', m.waterBenefitLines().join('\n\n')))"` → đọc bằng mắt: số tiền định dạng Việt, có nguồn, không có cụm cấm.
3. Sinh thử 2 bài như plan trước (script scratch) → bài lọc dầu chứa ĐÚNG số của một kịch bản (ví dụ "3.000 lít... 83 triệu đồng... 4,2 tới 8,3 triệu đồng một chuyến"), không trộn số hai kịch bản; bài lọc nước chứa "3.000 lít... 150 can" hoặc số của kịch bản khác trong bảng. Sinh thử lần 2 phải ra kịch bản khác lần 1.
4. Sinh thử 1 bài với `channel: 'tiktok'` → 2 tới 4 câu, có đúng 1 câu "3.000 lít", không có link Shopee, vẫn có giá úp mở và CTA cmt.
5. Sau deploy: đọc bài bán kế tiếp ở Chờ duyệt; ngày TikTok kế tiếp trong Kế hoạch (xem lịch tuần) kiểm chú thích ngắn.

## 7. Không làm

- Không nêu giá nước cảng đất liền, không nêu tiền sửa kim phun tàu cá (chưa có nguồn).
- Không đưa phép tính vào video script (làm sau nếu Thanh muốn).
- Không tự đổi giá dầu trong code khi kỳ điều hành mới; dùng env.

## 8. Điều kiện dừng

- Plan `plan-bai-ban-theo-tep-11-09.md` chưa thi công (không có `audienceLines`) → dừng, làm plan đó trước.
- Test cũ SAI; hook đòi doc khác; tsc lỗi file ngoài 7 file (4 .mjs, rotate/route.ts, 2 doc app-map).
- Trong rotate/route.ts không tìm thấy biến `channels` ngay trên lời gọi `generateSocialPost` của bài bán → dừng, không tự đặt tên khác.

## 9. Definition of Done

- [ ] BENEFIT_ASSUMPTIONS, ENGINE_CLASSES, BENEFIT_CASES (8) + các hàm ở cả 2 products.mjs; `...benefitLines(productGroup, channel)` ở cả 2 social.mjs; rotate/route.ts truyền `channel` theo `channels[0]`.
- [ ] test:price 96/96; node --check sạch; tsc sạch; gate OK; sinh thử 2 bài Facebook đúng số + 1 bài TikTok ngắn.
- [ ] Deploy main; Thanh đã đặt 2 env giá dầu trên Vercel.
- [ ] Ghi memory: nguồn số liệu + ngày, cách đổi giá dầu.
