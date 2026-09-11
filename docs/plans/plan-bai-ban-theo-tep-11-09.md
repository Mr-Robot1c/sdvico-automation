# Plan: bài bán viết theo TỆP KHÁCH (tệp A ghe nhỏ cho lọc dầu, tệp B tàu khơi xa cho lọc nước và giám sát)

> Người thi công: Sonnet 5. Plan tự chứa đủ ngữ cảnh, không cần transcript. Đọc hết rồi làm đúng thứ tự.
> Gặp điều kiện dừng ở mục 8 thì DỪNG và hỏi. Việc này chỉ đổi PROMPT và dữ liệu tĩnh, không đụng DB,
> không migration.

## 1. Bối cảnh (đã điều tra, KHÔNG cần điều tra lại)

- 11/9/2026 đọc trọn 51 group Facebook nghề biển (báo cáo `docs/plans/phan-tich-group-ngu-dan-11-09.md`).
  Kết luận: khách chia 2 tệp rõ rệt.
  - **Tệp A**: chủ ghe 8 tới 12 m, máy Kia 33, Yanmar 2T, D30, đi gần bờ, chuyến vài ngày, tiền eo hẹp,
    quen mua đồ cũ "còn 90%", nhạy giá dầu, hay bị nghẹt kim phun. Khách của **lọc dầu SF300B**.
  - **Tệp B**: chủ tàu 15 tới 20 m, máy 280 tới 550 cv, đi 20 tới 30 ngày một chuyến, tàu thu mua, tàu
    hậu cần; tụ ở miền Trung, Kiên Giang, Cà Mau, Vũng Tàu. Khách của **máy lọc nước SEA-40** và **giám
    sát hành trình**. Thứ họ đang dùng thay máy lọc nước là thùng nước inox trên boong.
- Hiện bài bán máy tự viết cho "bà con ngư dân" chung chung, cùng một giọng cho mọi sản phẩm. Prompt
  bài bán nằm ở 2 file gần giống nhau (phải sửa CẢ HAI, bản apps là bản chính chạy trên Vercel, bản
  packages chạy ở máy nội bộ và CI):
  - `apps/approval-ui/lib/gen/social.mjs`, hàm `generateSocialPost`, mảng `system` bắt đầu dòng ~101,
    dòng `...guardLines(shownName + ' ' + productName + ' ' + productGroup),` ở dòng ~117.
  - `packages/marketing/src/social.mjs`, hàm `generateSocialPost`, mảng `system` dòng ~69, dòng
    `...guardLines(...)` ở dòng ~73.
- Dữ liệu tĩnh theo nhóm sản phẩm (tên công khai, giá úp mở, CTA) nằm ở `products.mjs`, cũng 2 bản:
  `packages/marketing/src/products.mjs` và `apps/approval-ui/lib/gen/products.mjs` (khác nhau vài dòng
  comment và match, nhưng các hàm export giống nhau). Tên nhóm là chuỗi cố định:
  `'9. Máy Lọc Dầu Diesel SD12-300'` (lọc dầu, tên công khai SF300B), `'2. Máy lọc nước biển SEA-40'`,
  `'3. Thiết bị giám sát hành trình Viettel S-Tracking'`, `'6. Thiết bị lọc dầu SF-50'` (ngừng bán).
- Luật đang có và PHẢI giữ nguyên: giá úp mở (`PRICE_TEASER`, `ensurePriceTeaser`), CTA cuối bài là câu
  cmt từ khóa (`commentCta`, `ensureCommentCta`), link Shopee (`ensureShopeeLink`), SỰ THẬT NGHỀ
  (`guardLines`, `guardViolations` trong `product-guard.mjs`: CẤM nói "bớt chở nước", "khỏi chở nước",
  "nhẹ tàu", "giảm tải", "tiết kiệm dầu" cho máy lọc nước; chỉ nhóm lọc dầu được nói tiết kiệm dầu theo
  tài liệu 5 tới 10%). Khối tệp khách thêm vào KHÔNG được chứa các cụm bị cấm đó.
- Test có sẵn: `packages/marketing/src/test-price-teaser.mjs`, chạy `npm run test:price` ở GỐC REPO
  (script trong package.json gốc; chạy trong packages/marketing sẽ báo lỗi workspace; không cần mạng), hiện 76 ca đạt. Cách viết: `eq(name, got, want)` và
  `ok(name, cond, got)` đẩy vào mảng `cases`.

## 2. Kết quả mong muốn

Mỗi bài bán tự "biết" mình đang nói với ai. Prompt bài bán có thêm một khối 5 dòng theo nhóm sản phẩm:
khách là ai, nỗi đau nào, so với thứ họ đang dùng, câu chốt tin cậy, và câu hỏi đặt ngay trước CTA cuối.
Nhóm không có hồ sơ tệp (dầu nhớt, sơn, ắc quy, SDFish...) thì prompt giữ nguyên như cũ.

## 3. Ràng buộc repo (BẮT BUỘC)

- Commit author + committer `Mr-Robot1c <178200163+Mr-Robot1c@users.noreply.github.com>`; message
  `<loại>(<phạm vi>): <mô tả không dấu>`; kết bằng dòng `Co-Authored-By: Claude ... <noreply@anthropic.com>`.
- Hook pre-commit: đổi `packages/marketing/**` thì `docs/app-map/marketing.md` phải có dòng
  `<!-- re-verified: ... -->` MỚI cùng commit; đổi `apps/approval-ui/**` thì `docs/app-map/README.md`
  phải có dòng re-verified mới cùng commit. Sau commit chạy `git checkout -- docs/app-map` để bỏ các file
  hook chạm EOL.
- Điều cấm 5 (nguyên văn): "Không bịa số liệu, giải thưởng, khách hàng, đối tác." Khối tệp khách chỉ nêu
  cỡ tàu và hoàn cảnh đọc được trong group, KHÔNG nêu số liệu doanh số, số khách, tên khách.
- Deploy: ở checkout chính `C:/Users/ADMIN/Desktop/SDVICO Marketing` (nhánh `ngay2-marketing`)
  `git merge --ff-only <nhánh làm việc>` rồi `git push origin ngay2-marketing:main` và
  `git push origin ngay2-marketing`. KHÔNG dùng `git stash` trần.
- Không đụng `.env`, không commit khóa.

## 4. Bẫy đã biết

- Hai bản `products.mjs` và hai bản `social.mjs` KHÁC nhau ở nhiều dòng khác; KHÔNG chép đè cả file từ
  bản này sang bản kia, chỉ thêm đúng khối ghi trong plan vào từng bản.
- Bản apps `social.mjs` có khung 6 nhịp và bài mẫu; khối tệp khách chèn ngay sau `...guardLines(...)`,
  KHÔNG chèn vào giữa khung 6 nhịp.
- `guardViolations` quét lời bài sau khi sinh: nếu khối tệp khách gợi ý cụm bị cấm, bài sẽ bị sinh lại
  rồi cắt câu, tốn token. Vì vậy chữ trong `AUDIENCE` đã được chọn tránh mọi cụm cấm; KHÔNG tự thêm ý
  "chở nước", "nhẹ tàu", "tiết kiệm dầu" vào nhóm lọc nước.
- Windows: file Vietnamese ghi bằng Write tool là UTF-8; không dùng echo/heredoc cho chữ có dấu.
- test-price-teaser.mjs có ký tự xuống dòng trộn (CRLF/LF); chèn khối test bằng Edit tool theo đúng
  chuỗi mốc trong plan, không viết lại cả file.

## 5. Các bước

### Bước 1: `packages/marketing/src/products.mjs`, thêm hồ sơ tệp khách

Tìm hàm `export function ensureShopeeLink(body, link) {` (dòng ~266), đi tới dấu `}` đóng hàm đó, chèn
NGAY SAU (trước comment/hàm kế tiếp) khối sau, giữ nguyên chữ:

```js
// 11/9 (đọc trọn 51 group Facebook nghề biển, docs/plans/phan-tich-group-ngu-dan-11-09.md): bài bán phải
// biết nói với ai. Tệp A = chủ ghe nhỏ ven bờ (khách lọc dầu); tệp B = chủ tàu khơi xa 15 m trở lên (khách
// lọc nước, giám sát). Chữ ở đây đã tránh mọi cụm SỰ THẬT NGHỀ cấm (product-guard.mjs): KHÔNG "bớt chở
// nước", "nhẹ tàu", "giảm tải", "tiết kiệm dầu" cho lọc nước. Bản sao y hệt ở apps/approval-ui/lib/gen.
export const AUDIENCE = {
  '9. Máy Lọc Dầu Diesel SD12-300': {
    key: 'A',
    who: 'chủ ghe 8 tới 12 m chạy máy Kia 33, Yanmar 2T, D30, đi gần bờ, một chuyến vài ngày, tiền eo hẹp, quen mua đồ cũ',
    pain: 'giá dầu lên, dầu lẫn cặn và nước làm nghẹt kim phun, máy khục kịch nổ không êm, nằm bờ sửa tốn tiền và mất chuyến',
    compare: 'đồ cũ "còn 90%" mua trôi nổi không ai bảo hành',
    proof: 'tự lắp được, giao tận nơi toàn quốc, bảo hành 12 tháng, vỏ inox 304 chịu muối biển',
    question: 'Ghe anh chạy máy gì, một chuyến mấy ngày?',
  },
  '6. Thiết bị lọc dầu SF-50': {
    key: 'A',
    who: 'chủ ghe 8 tới 12 m chạy máy Kia 33, Yanmar 2T, D30, đi gần bờ, một chuyến vài ngày, tiền eo hẹp, quen mua đồ cũ',
    pain: 'giá dầu lên, dầu lẫn cặn và nước làm nghẹt kim phun, máy khục kịch nổ không êm, nằm bờ sửa tốn tiền và mất chuyến',
    compare: 'đồ cũ "còn 90%" mua trôi nổi không ai bảo hành',
    proof: 'tự lắp được, giao tận nơi toàn quốc, bảo hành 12 tháng',
    question: 'Ghe anh chạy máy gì, một chuyến mấy ngày?',
  },
  '2. Máy lọc nước biển SEA-40': {
    key: 'B',
    who: 'chủ tàu 15 tới 20 m, máy 280 tới 550 cv, đi 20 tới 30 ngày một chuyến, tàu thu mua hoặc tàu hậu cần, cả tàu 8 tới 12 người ăn uống tắm rửa',
    pain: 'nước ngọt cạn giữa chuyến, nước để lâu trong thùng thì hôi và đau bụng, phải cắt chuyến quay bờ sớm khi cá đang vào',
    compare: 'thùng nước inox trên boong: chứa được bao nhiêu thì xài bấy nhiêu, hết là hết',
    proof: 'giá đã gồm công lắp, kỹ thuật SDVICO tới tận tàu lắp và hướng dẫn, tặng 10 lõi lọc thô, làm ra khoảng 250 lít nước ngọt mỗi giờ',
    question: 'Tàu anh dài bao nhiêu mét, đi mấy ngày một chuyến?',
  },
  '3. Thiết bị giám sát hành trình Viettel S-Tracking': {
    key: 'B',
    who: 'chủ tàu 15 m trở lên đi khơi xa, đang chạy máy giám sát cũ hoặc sắp phải thay',
    pain: 'máy cũ chập chờn mất tín hiệu, lắp chậm, hỏng không biết kêu ai, mỗi lần đi làm giấy lại lo',
    compare: 'máy cũ mua trôi nổi trên mạng không ai lắp, không ai bảo hành',
    proof: 'SDVICO lắp tận tàu, kích hoạt tài khoản ngay khi lắp, bảo hành 12 tháng máy và 6 tháng phụ kiện, mỗi tàu một tài khoản riêng trên app Viettel S-Tracking',
    question: 'Tàu anh đang chạy máy giám sát nào, lắp năm nào rồi?',
  },
};
export function audienceOf(group) {
  return AUDIENCE[group] || null;
}
// Khối prompt "khách của bài này" cho generateSocialPost (2 bản social.mjs). Nhóm không có hồ sơ -> [].
export function audienceLines(group) {
  const a = audienceOf(group);
  if (!a) return [];
  return [
    `KHÁCH CỦA BÀI NÀY (tệp ${a.key}, đọc từ 51 group nghề biển 11/9): ${a.who}. Viết như đang nói với đúng người này, xưng "anh em" hoặc "bà con" như thường, KHÔNG gọi "khách hàng", KHÔNG viết cho người ngoài nghề.`,
    `NỖI ĐAU đưa vào bài (chọn 1 ý, không kể hết): ${a.pain}.`,
    `SO SÁNH NHẸ với thứ bà con đang dùng: ${a.compare}. Chỉ nói khác nhau chỗ nào, không chê, không bịa con số.`,
    `CÂU TIN CẬY (đúng 1 câu): ${a.proof}.`,
    `CÂU HỎI ngay TRƯỚC câu CTA cuối, giữ ý này (được đổi vài chữ cho hợp giọng): "${a.question}".`,
  ];
}
```

### Bước 2: `apps/approval-ui/lib/gen/products.mjs`, chèn Y HỆT khối ở Bước 1

Tìm `export function ensureShopeeLink(body, link) {` (dòng ~268), chèn khối trên ngay sau dấu `}` đóng
hàm. Nội dung giống Bước 1 từng chữ (kể cả comment).

### Bước 3: `packages/marketing/src/social.mjs`

3a. Dòng import (dòng 6). TRƯỚC:
```js
import { DEFAULT_HASHTAGS, productHashtags, getFeatures, CONTENT_TOPICS, getPriceTeaser, publicName, ensurePriceTeaser, redactExactPrices, commentCta, ensureCommentCta, shopeeLink, ensureShopeeLink } from './products.mjs';
```
SAU:
```js
import { DEFAULT_HASHTAGS, productHashtags, getFeatures, CONTENT_TOPICS, getPriceTeaser, publicName, ensurePriceTeaser, redactExactPrices, commentCta, ensureCommentCta, shopeeLink, ensureShopeeLink, audienceLines } from './products.mjs';
```

3b. Trong mảng `system` của `generateSocialPost`. TRƯỚC (dòng ~73):
```js
    ...guardLines(shownName + ' ' + productName + ' ' + productGroup),
```
SAU:
```js
    ...guardLines(shownName + ' ' + productName + ' ' + productGroup),
    // 11/9: bài bán viết cho đúng tệp khách (A ghe nhỏ, B tàu khơi xa), xem AUDIENCE ở products.mjs.
    ...audienceLines(productGroup),
```

### Bước 4: `apps/approval-ui/lib/gen/social.mjs`, y hệt Bước 3

4a. Dòng import (dòng 6): thêm `, audienceLines` vào cuối danh sách import từ `./products.mjs`
(chuỗi TRƯỚC giống hệt 3a).

4b. TRƯỚC (dòng ~117):
```js
    ...guardLines(shownName + ' ' + productName + ' ' + productGroup),
```
SAU:
```js
    ...guardLines(shownName + ' ' + productName + ' ' + productGroup),
    // 11/9: bài bán viết cho đúng tệp khách (A ghe nhỏ, B tàu khơi xa), xem AUDIENCE ở products.mjs.
    ...audienceLines(productGroup),
```
Bản apps còn có nhịp 6 nói "Ngay trước câu đó có thể thêm 1 câu hỏi mở ngắn kéo bình luận": giữ nguyên,
khối tệp khách đã chỉ định câu hỏi cụ thể, hai ý không mâu thuẫn.

### Bước 5: test `packages/marketing/src/test-price-teaser.mjs`

5a. Dòng import đầu file. TRƯỚC:
```js
import { PRICE_TEASER, redactExactPrices, ensurePriceTeaser, ensureSpokenTeaser, publicName, isPhotoOnlyGroup, isDiscontinuedGroup, commentCta, ensureCommentCta, SHOPEE_LINK, shopeeLink, ensureShopeeLink, outroKeyword } from './products.mjs';
```
SAU:
```js
import { PRICE_TEASER, redactExactPrices, ensurePriceTeaser, ensureSpokenTeaser, publicName, isPhotoOnlyGroup, isDiscontinuedGroup, commentCta, ensureCommentCta, SHOPEE_LINK, shopeeLink, ensureShopeeLink, outroKeyword, AUDIENCE, audienceOf, audienceLines } from './products.mjs';
```

5b. Chèn 6 ca test ngay TRƯỚC dòng `let fail = 0;` (dòng ~101), dùng Edit tool với chuỗi mốc
`let fail = 0;`:
```js
// 11/9: bài bán theo tệp khách (A ghe nhỏ cho lọc dầu, B tàu khơi xa cho lọc nước, giám sát).
eq('audience lọc dầu = A', audienceOf(G9)?.key, 'A');
eq('audience lọc nước = B', audienceOf(G2)?.key, 'B');
eq('audience nhóm khác = null', audienceOf('8. Sơn RARE'), null);
eq('audienceLines nhóm khác rỗng', audienceLines('8. Sơn RARE').length, 0);
ok('audienceLines lọc nước 5 dòng có câu hỏi', audienceLines(G2).length === 5 && audienceLines(G2)[4].includes('Tàu anh dài bao nhiêu mét'));
ok('AUDIENCE không chứa cụm SỰ THẬT NGHỀ cấm', Object.values(AUDIENCE).every((a) => !guardViolations(`${a.who} ${a.pain} ${a.compare} ${a.proof} ${a.question}`, a.key === 'A' ? G9 : G2).length));
let fail = 0;
```
(`guardViolations` đã được import sẵn trong file test.)

### Bước 6: doc app-map + commit + deploy

- `docs/app-map/marketing.md`: chèn ngay sau dòng `covers:` (dòng 4) một dòng:
  `<!-- re-verified: 2026-09-11 chieu - BAI BAN THEO TEP KHACH (Thanh 11/9, tu bao cao doc 51 group docs/plans/phan-tich-group-ngu-dan-11-09.md): products.mjs (2 ban) AUDIENCE cho nhom 9 (SF300B, tep A ghe nho 8-12 m may 33), 6 (SF-50, tep A), 2 (SEA-40, tep B tau 15-20 m di 20-30 ngay, so voi thung nuoc inox), 3 (S-Tracking, tep B thay may cu) + audienceOf + audienceLines (5 dong prompt: khach, noi dau, so sanh, tin cay, cau hoi truoc CTA); social.mjs (2 ban) generateSocialPost chen ...audienceLines(productGroup) ngay sau ...guardLines(...); chu AUDIENCE tranh moi cum product-guard cam; test-price-teaser +6 ca (82/82). Luat gia up mo, CTA cmt, Shopee link, SU THAT NGHE khong doi. -->`
- `docs/app-map/README.md`: chèn ngay sau dòng `covers:` (dòng 5) một dòng:
  `<!-- re-verified: 2026-09-11 chieu - apps/approval-ui/lib/gen/products.mjs + social.mjs: them AUDIENCE/audienceOf/audienceLines va chen ...audienceLines(productGroup) vao prompt bai ban (tep A ghe nho cho loc dau, tep B tau khoi xa cho loc nuoc va giam sat), y het ban packages/marketing (chi tiet marketing.md cung gio). -->`
- Commit 1 lần, message:
  `feat(social): bai ban viet theo tep khach A (ghe nho, loc dau) / B (tau khoi xa, loc nuoc + giam sat) tu bao cao 51 group (Thanh 11/9); re-verify(docs/app-map/marketing.md, README.md)`
- Sau commit: `git checkout -- docs/app-map`, rồi deploy theo mục 3.

## 6. Verify

1. Cú pháp: ở gốc repo
   `node --check packages/marketing/src/products.mjs && node --check packages/marketing/src/social.mjs && node --check apps/approval-ui/lib/gen/products.mjs && node --check apps/approval-ui/lib/gen/social.mjs` → không lỗi.
2. Test: ở GỐC REPO chạy `npm run test:price` (hoặc `node packages/marketing/src/test-price-teaser.mjs`) → dòng cuối `Kết quả: 82/82 đạt.` (76 cũ + 6
   mới), exit 0. Nếu ca "AUDIENCE không chứa cụm SỰ THẬT NGHỀ cấm" SAI thì sửa chữ trong AUDIENCE cho tới
   khi đạt, KHÔNG sửa product-guard.
3. Kiểm kiểu app: trong `apps/approval-ui` chạy `./node_modules/.bin/tsc --noEmit -p .` → exit 0.
4. Gate: ở gốc repo `node scripts/check-approval-gate.mjs` → `check-approval-gate: OK`.
5. Sinh thử 1 bài thật (cần GEMINI_API_KEY trong `.env` gốc repo, có sẵn): tạo file tạm
   `scratch-audience.mjs` ở gốc repo với nội dung:
   ```js
   import { readFileSync } from 'node:fs';
   const env = Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')];}));
   process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
   const { generateSocialPost } = await import('./packages/marketing/src/social.mjs');
   for (const [g, name] of [['9. Máy Lọc Dầu Diesel SD12-300', 'Máy lọc dầu SF300B'], ['2. Máy lọc nước biển SEA-40', 'Máy lọc nước biển SEA-40']]) {
     const r = await generateSocialPost({ productGroup: g, productName: name, channel: 'facebook', hasVideo: false });
     console.log('\n=====', g, '\n', r.text || r.body || JSON.stringify(r).slice(0, 1500));
   }
   ```
   Chạy `node scratch-audience.mjs`, đọc 2 bài: bài lọc dầu phải nhắc ghe nhỏ/máy 33 hoặc kim phun và có
   câu hỏi "ghe anh chạy máy gì"; bài lọc nước phải nhắc chuyến 20 tới 30 ngày hoặc thùng nước inox và có
   câu hỏi "tàu anh dài bao nhiêu mét"; cả hai vẫn có câu giá "9,X triệu"/"3X triệu, 4X triệu" và câu CTA
   cmt "lọc dầu" hay "lọc nước" ở cuối. Xong XÓA `scratch-audience.mjs` (không commit). Nếu Gemini trả
   429/500 thì thử lại sau 1 phút, không đổi model.
6. Sau deploy: bài bán sinh ở lượt rotate kế tiếp (08:00 hoặc 19:30 giờ VN) hiện ở Bảng bài viết, Chờ
   duyệt; đọc thẻ bài lọc dầu và lọc nước gần nhất, thấy đúng dấu hiệu như bước 5.

## 7. Không làm trong plan này

- Không đổi PRICE_TEASER, CTA, SHOPEE_LINK, product-guard, script video (video/script.mjs có prompt riêng,
  làm plan khác nếu cần).
- Không thêm hồ sơ tệp cho nhóm 1, 4, 5, 7, 8, 10 (chưa có dữ liệu group cho các món đó).
- Không sửa bài content (`generateContentPost`).
- Không đụng bảng DB.

## 8. Điều kiện dừng (DỪNG và hỏi)

- `npm run test:price` báo SAI ở ca cũ (không phải 6 ca mới): plan không dự tính, dừng.
- Hai bản `social.mjs` không còn dòng `...guardLines(shownName + ' ' + productName + ' ' + productGroup),`
  đúng như plan (đã bị đổi) → dừng, hỏi vị trí chèn.
- Hook đòi doc app-map khác ngoài marketing.md và README.md.
- tsc lỗi ở file ngoài 6 file trong plan (2 products.mjs, 2 social.mjs, test-price-teaser.mjs, 2 doc).
- Vercel build fail sau push.

## 9. Definition of Done

- [ ] AUDIENCE + audienceOf + audienceLines có ở CẢ 2 products.mjs, giống nhau từng chữ.
- [ ] `...audienceLines(productGroup)` có ở CẢ 2 social.mjs, ngay sau `...guardLines(...)`; import đã thêm.
- [ ] `npm run test:price` 82/82; tsc exit 0; gate OK; 4 file node --check sạch.
- [ ] Đã sinh thử 2 bài (bước 5) thấy đúng tệp; file scratch đã xóa.
- [ ] Commit 1 lần với 2 dòng re-verified, hook qua; merge ff vào ngay2-marketing, push main + ngay2-marketing; Vercel Ready.
- [ ] Ghi memory: bài bán theo tệp đã deploy, commit hash, ngày.
