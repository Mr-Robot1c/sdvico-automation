# Plan thi công: vá 3 mũi khâu MÔ TẢ CLIP cho video content (23/9)

> Plan này tự chứa đủ ngữ cảnh. Người thi công (Sonnet 5) KHÔNG cần đọc lại hội thoại gốc.
> Đọc trước: mục Root cause, mục Ràng buộc repo, mục Bẫy. Làm theo thứ tự Mũi 1, 2, 3 rồi Verify.

## Root cause (đã soi xong 23/9, có bằng chứng)

Video content id `1f608ee3` (bài "Ra cảng xem thợ kiểm tra máy cho bà con", 23/9) đọc lời mở:
"Ra cảng xem thợ kiểm tra máy. **Anh** nhân viên SDVICO vừa nói, vừa **xách vali dụng cụ**, bước thật nhanh **xuống mạn**."
Trong khi clip bắt buộc (brand_assets id `93334800-0f8a-4ee6-9630-a10a587fb97f`, clip Zalo gốc
`2026-09-20-03-tkkd-lap-dat-thiet-bi-tren-tau.mp4`) quay: **CHỊ** nhân viên SDVICO **cầm điện thoại**
đi trước trung tâm quản lý cảng cá Cà Ná, gặp anh khách **cầm hồ sơ**. Không vali, không xuống mạn.

Chuỗi lỗi 3 tầng, mỗi tầng một kẽ hở:

1. `packages/marketing/src/hoc-video.mjs` cho Gemini xem video thật, viết tóm tắt .md vào `Zalo/AI/<ngày>/`.
   Bản tóm tắt clip này KHÁ ĐÚNG (ghi "trước trung tâm quản lý cảng", "gặp khách hàng cầm hồ sơ",
   "nhân viên vừa quay phim vừa giới thiệu") nhưng KHÔNG ghi giới tính, vì prompt không yêu cầu tả người.
2. `packages/marketing/src/up-media-kho-tu-lieu.mjs` KHÔNG xem video; nó đưa bản tóm tắt cho Gemini text
   nén thành `mo_ta` 1 tới 2 câu, lưu vào `brand_assets.description`. Bản nén còn:
   "Nhân viên SDVICO mặc áo đồng phục gặp gỡ khách hàng cầm hồ sơ tại cảng cá Cà Ná, xung quanh là tàu cá
   neo đậu và quang cảnh nhộn nhịp." Rơi mất: bối cảnh thật (trước tòa nhà, không phải giữa tàu thuyền),
   nhân viên đang cầm điện thoại, ai cầm hồ sơ. Prompt `mo_ta` hiện chỉ ép tả TÌNH TRẠNG MÁY MÓC
   (mới/cũ/rỉ sét), không có yêu cầu nào về tả NGƯỜI.
3. `packages/marketing/src/video/script.mjs` đưa mô tả (cắt 260 ký tự) vào prompt "CLIP NÀY QUAY: ...".
   Model điền chỗ trống bằng tưởng tượng: "anh" (mô tả không ghi giới tính), "vali dụng cụ" (biến tấu từ
   "cầm hồ sơ"), "xuống mạn" (suy từ "tàu cá neo đậu"). Hai chốt chặn hiện có (`visualOverlap` trong
   `scene-match.mjs` + `imageryDriftSentences` trong `rules.mjs`) đều PASS vì lời CÓ từ chung với mô tả
   ("nhân viên SDVICO", "cảng"). Chúng chỉ bắt lời THIẾU từ chung, không bắt lời BỊA THÊM chi tiết.

## Ràng buộc repo (đọc kỹ, vi phạm là hỏng)

- `script.mjs`, `rules.mjs`, `scene-match.mjs`, `hoc-video.mjs`, `up-media-kho-tu-lieu.mjs` CHỈ có 1 bản
  trong `packages/marketing/src/`. KHÔNG có bản sao bên `apps/approval-ui/lib/gen/` (bên đó chỉ sao
  `fresh-clip.mjs`, plan này không đụng file đó). Không cần sync gì sang Vercel.
- Không đụng migration hay DB: cột `brand_assets.description` đã có (migration 20260915130000).
- Test chạy không mạng: `npm run test:video` (file `packages/marketing/src/test-video-rules.mjs`).
  Mọi sửa ở `rules.mjs` phải kèm case mới trong file test này, theo đúng kiểu `eq(...)` đang có.
- Chuỗi prompt trong `up-media-kho-tu-lieu.mjs` và `hoc-video.mjs` đang viết KHÔNG DẤU (ASCII), giữ nguyên
  phong cách. Chuỗi prompt trong `script.mjs` viết CÓ DẤU, giữ nguyên.
- Comment code theo nếp repo: ghi ngày + bài học cụ thể (xem các comment 17/9, 18/9 sẵn có làm mẫu).
- Bảy điều cấm giữ nguyên; plan này không chạm luồng duyệt, không tự đăng gì.

## Mũi 1: prompt `mo_ta` của up-media phải tả NGƯỜI

File: `packages/marketing/src/up-media-kho-tu-lieu.mjs`, khối `RULES` (khoảng dòng 82 tới 99).

Sửa dòng JSON template (dòng 85), phần `"mo_ta"`:

TRƯỚC:
```
'{"loai":...,"mo_ta":"<1-2 cau co dau: thay gi, o dau, tinh trang moi/cu/hu/ban/can/duc/dang sua/dang chay, co nguoi khong>",...}',
```
SAU (chỉ đổi đoạn mo_ta):
```
'{"loai":...,"mo_ta":"<2-3 cau co dau: thay gi, o dau, tinh trang moi/cu/hu/ban/can/duc/dang sua/dang chay; co NGUOI thi ta ro tung nguoi>",...}',
```

Ngay SAU dòng rule `mo_ta:` hiện có (dòng 87, dòng bắt đầu `'mo_ta: ghi RO tinh trang...`), THÊM 1 dòng mới:
```js
  // 23/9 (bài 1f608ee3 đọc "anh nhân viên xách vali xuống mạn" trên clip CHỊ nhân viên cầm điện thoại):
  // mô tả thiếu chi tiết người thì khâu kịch bản tự bịa. Bắt tả người thật kỹ.
  'mo_ta khi co NGUOI: ghi ro may nguoi, nam hay nu (khong ro thi ghi "khong ro"), mac gi, dang cam gi, dang lam gi, o dau (truoc nha, tren boong, trong khoang may...). Kich ban video se goi nguoi va ta hanh dong DUNG THEO mo_ta nay, ta thieu la video doc sai.',
```

## Mũi 2: video lấy NGUYÊN phần "Cảnh quay" của tóm tắt làm description, nới trần 260

### 2a. `hoc-video.mjs` (khoảng dòng 179): prompt phần Cảnh quay tả người

TRƯỚC:
```js
'1. Canh quay: quay gi, o dau (tren tau, cang, xuong...), thay thiet bi gi, khong khi the nao.',
```
SAU:
```js
'1. Canh quay: quay gi, o dau (tren tau, cang, xuong...), thay thiet bi gi, khong khi the nao. Co NGUOI thi ta ro tung nguoi: nam hay nu (khong ro thi ghi "khong ro"), mac gi, dang cam gi, dang lam gi.',
```
Lưu ý: hoc-video idempotent theo tên file, tóm tắt cũ không sinh lại. Prompt mới chỉ ảnh hưởng video mới. Đó là chủ đích, không cần backfill.

### 2b. `up-media-kho-tu-lieu.mjs`: description của VIDEO = phần "Cảnh quay" của tóm tắt

Hiện trạng (khoảng dòng 167 tới 203): `summary` là biến cục bộ trong nhánh `if (isVideo)`, còn
`description` chỉ xây từ `cls.mo_ta`.

Sửa 2 chỗ:

1. Hoist summary: ngay trên `let cls = null;` (dòng 167) thêm `let summary = null;`, trong nhánh video đổi
   `const summary = findVideoSummary(...)` thành `summary = findVideoSummary(...)`.
2. Đổi khối build `description` (dòng 201 tới 203):

TRƯỚC:
```js
  const description = cls.mo_ta
    ? `${String(cls.mo_ta).trim()}${Array.isArray(cls.hop_canh) && cls.hop_canh.length ? ` | Hợp cảnh: ${cls.hop_canh.map(String).join(', ')}` : ''}${Array.isArray(cls.tu_khoa) && cls.tu_khoa.length ? ` | Từ khoá: ${cls.tu_khoa.map(String).join(', ')}` : ''}`.slice(0, 1000)
    : null;
```
SAU:
```js
  // 23/9 (bài 1f608ee3: mo_ta nén 2 tầng rơi hết chi tiết người, kịch bản bịa "anh nhân viên xách vali"):
  // video lấy NGUYÊN phần "Cảnh quay" của bản tóm tắt hoc-video (Gemini xem video THẬT, chi tiết hơn)
  // làm mô tả; mo_ta 1-2 câu chỉ còn là dự phòng. Ảnh giữ đường cũ (classifyImage nhìn ảnh trực tiếp).
  const moTaChinh = (isVideo ? extractCanhQuay(summary) : null) || (cls.mo_ta ? String(cls.mo_ta).trim() : '');
  const description = moTaChinh
    ? `${moTaChinh}${Array.isArray(cls.hop_canh) && cls.hop_canh.length ? ` | Hợp cảnh: ${cls.hop_canh.map(String).join(', ')}` : ''}${Array.isArray(cls.tu_khoa) && cls.tu_khoa.length ? ` | Từ khoá: ${cls.tu_khoa.map(String).join(', ')}` : ''}`.slice(0, 1000)
    : null;
```

3. Thêm helper `extractCanhQuay` (đặt gần `findVideoSummary`, khoảng dòng 76):
```js
// 23/9: bóc phần "1. Cảnh quay" trong bản tóm tắt .md của hoc-video: từ dòng chứa "Cảnh quay" tới
// trước dòng "Lời thoại" (hoặc mục 2.), bỏ ký tự markdown, ép về một dòng. Không thấy thì trả null
// để rơi về mo_ta như cũ. Tối đa 700 ký tự (description tổng vẫn cắt 1000).
function extractCanhQuay(summary) {
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const lines = String(summary || '').split(/\r?\n/);
  const start = lines.findIndex((l) => fold(l).includes('canh quay'));
  if (start < 0) return null;
  const out = [];
  const rest = lines[start].split(':').slice(1).join(':').replace(/\*\*/g, '').trim();
  if (rest) out.push(rest);
  for (let i = start + 1; i < lines.length; i++) {
    const f = fold(lines[i]);
    if (f.includes('loi thoai') || /^\s*(?:\*\*|##)?\s*2\./.test(lines[i])) break;
    const clean = lines[i].replace(/^[\s*#>-]+/, '').replace(/\*\*/g, '').trim();
    if (clean) out.push(clean);
  }
  const text = out.join(' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 700) : null;
}
```

### 2c. `script.mjs`: nới trần mô tả clip bắt buộc 260 lên 600

Hai chỗ, đều đổi `slice(0, 260)` thành `slice(0, 600)`:
- Dòng ~242: `const desc = String(m?.description || m?.title || '')...slice(0, 260);`
- Dòng ~344 (message sinh lại khi mustMiss): `...slice(0, 260)` trong chuỗi "Clip quay: ...".
Trần 220 của `hookPin` (dòng ~252 và ~352) GIỮ NGUYÊN (hookPin thường là ảnh, mô tả ngắn).

## Mũi 3: luật + chốt chặn "cấm bịa thêm chi tiết" trong dây chuyền kịch bản

### 3a. `rules.mjs`: thêm export `inventedDetailSentences`

Đặt ngay SAU `imageryDriftSentences` (sau dòng ~313). Tái dùng `foldText`, `sentencesOf`, `hasImagery`
đã có sẵn trong file (sentencesOf ở dòng ~141, foldText ~279, hasImagery ~280):

```js
// 23/9 (bài 1f608ee3 "Ra cảng xem thợ kiểm tra máy": mô tả clip chỉ ghi "nhân viên SDVICO gặp khách
// cầm hồ sơ tại cảng" nhưng lời mở đọc "ANH nhân viên XÁCH VALI DỤNG CỤ bước xuống MẠN" — guard cũ chỉ
// bắt lời THIẾU từ chung với mô tả, không bắt lời BỊA THÊM): câu nhắc ĐẠO CỤ/HÀNH ĐỘNG cụ thể (vali,
// xách, xuống mạn...) thì mô tả tư liệu phải có; gọi người kèm GIỚI TÍNH (anh/chị/chú/cô + nhân viên/
// thợ/kỹ thuật/khách) thì mô tả phải ghi giới tính đó. Giới tính phía mô tả so bản CÓ DẤU ("cô"/"chị"
// gấp không dấu thành "co"/"chi" dính "có"/"chi phí"). Chỉ dùng cho cảnh gắn clip bắt buộc / tư liệu
// cảnh 1 đã chọn — không quét cả kịch bản để khỏi bắt oan cảnh tự do.
const PROP_TERMS = ['vali', 'va li', 'đồ nghề', 'hộp dụng cụ', 'túi đồ', 'thùng đồ', 'xách', 'khiêng', 'vác', 'bưng', 'xuống mạn', 'mạn tàu'];
const GENDER_ROLE = '(nhân viên|thợ|kỹ thuật|khách)';
const MALE_SENT = new RegExp(`(^|\\P{L})(anh|chú|ông)\\s+${GENDER_ROLE}`, 'u');
const FEMALE_SENT = new RegExp(`(^|\\P{L})(chị|cô|bà)\\s+${GENDER_ROLE}`, 'u');
export function inventedDetailSentences(narration, assetText) {
  const at = foldText(assetText);
  const raw = String(assetText || '').toLowerCase();
  const assetMale = /(^|\P{L})(anh|chú|ông|đàn ông)(\P{L}|$)/u.test(raw);
  const assetFemale = /(^|\P{L})(chị|cô|bà|phụ nữ)(\P{L}|$)/u.test(raw);
  const out = [];
  for (const sent of sentencesOf(narration)) {
    const s = String(sent).toLowerCase();
    const fs = foldText(sent);
    if (PROP_TERMS.some((t) => hasImagery(fs, t) && !hasImagery(at, t))) { out.push(sent); continue; }
    if (MALE_SENT.test(s) && !assetMale) { out.push(sent); continue; }
    if (FEMALE_SENT.test(s) && !assetFemale) out.push(sent);
  }
  return out;
}
```

KHÔNG nối vào `cutImageryDrift` (không tự cắt lời, chỉ dùng để sinh lại — bảo thủ như luật hiện có).

### 3b. `script.mjs`: nối guard vào 2 điểm soát + thêm luật vào prompt

1. Import: dòng ~9 đang import từ `./rules.mjs`, thêm `inventedDetailSentences` vào danh sách.
2. Điểm soát hookPin (dòng ~402):
TRƯỚC:
```js
      const drift = first ? imageryDriftSentences(first.narration || '', `${hookPin.title || ''} ${hookPin.description || ''}`) : [];
```
SAU:
```js
      const pinText = `${hookPin.title || ''} ${hookPin.description || ''}`;
      const drift = first ? [...imageryDriftSentences(first.narration || '', pinText), ...inventedDetailSentences(first.narration || '', pinText)] : [];
```
3. Điểm soát clip bắt buộc (dòng ~418):
TRƯỚC:
```js
        const drift = imageryDriftSentences(target.narration || '', `${mustAsset.title || ''} ${mustAsset.description || ''}`);
```
SAU:
```js
        const mustText = `${mustAsset.title || ''} ${mustAsset.description || ''}`;
        const drift = [...imageryDriftSentences(target.narration || '', mustText), ...inventedDetailSentences(target.narration || '', mustText)];
```
(2 nhánh này đã có sẵn `if (ov === 0 || drift.length)` + warn + sinh lại 1 lần; không đổi gì thêm.)
4. Prompt: trong 2 chuỗi "TƯ LIỆU BẮT BUỘC" (dòng ~246 và ~248), NỐI thêm vào cuối mỗi chuỗi câu:
```
 Mô tả KHÔNG ghi nam hay nữ thì gọi trung tính ("nhân viên SDVICO", "người thợ"), CẤM đoán "anh" hay "chị". CẤM thêm đồ vật hay hành động không có trong mô tả (vali, xách đồ nghề, bước xuống mạn...).
```
Chuỗi hookPin (dòng ~252) đã có ý "CẤM nhắc người hay vật KHÔNG có trong hình", chỉ NỐI thêm:
```
 Mô tả không ghi nam hay nữ thì gọi trung tính, không đoán "anh" hay "chị".
```

### 3c. `test-video-rules.mjs`: case mới

Thêm `inventedDetailSentences` vào import từ `./video/rules.mjs`, rồi thêm khối test (đặt cạnh khối
imageryDriftSentences, khoảng dòng 185 tới 203):

```js
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
```
Lưu ý case cuối: mô tả phải chứa cả "xách" lẫn "túi đồ" thì mới sạch, đó là chủ đích.

## Bẫy đã biết (đọc trước khi code)

1. `foldText` gấp "có" thành "co", "chị" thành "chi" (dính "chi phí"): giới tính phía MÔ TẢ bắt buộc so
   bản raw CÓ DẤU như code mẫu 3a. Đừng "tiện tay" chuyển sang foldText.
2. `hasImagery` với từ ngắn (4 ký tự trở xuống, không khoảng trắng) so nguyên từ bằng regex biên; "xách"
   gấp thành "xach" đúng 4 ký tự nên đi đường regex biên. Đừng đổi ngưỡng này.
3. `PROP_TERMS` cố ý KHÔNG có "lên tàu"/"xuống tàu": mô tả hay ghi "trên tàu", so lệch sẽ bắt oan câu
   hợp lệ. Nếu test cũ nào đỏ vì PROP_TERMS bắt oan thì THU HẸP danh sách, không sửa case cũ.
4. Guard chỉ sinh lại 1 lần (vòng `attempt < 2` sẵn có); lần 2 vẫn dính thì giữ bản cuối + warn. Đó là
   hành vi hiện tại của mọi guard trong file, giữ nguyên, không thêm vòng lặp (đắt token).
5. `up-media`: nhánh ẢNH không được đổi hành vi (classifyImage nhìn ảnh trực tiếp, mo_ta của ảnh vẫn tốt).
   `extractCanhQuay` chỉ gọi khi `isVideo`.
6. Tóm tắt có thể viết "1. Cảnh quay:" hoặc "**1. Cảnh quay:**" hoặc heading khác chữ hoa thường:
   helper dò bằng fold + includes như code mẫu, đừng dò cứng "**1.".
7. Chuỗi prompt ASCII trong up-media/hoc-video giữ ASCII; comment code thì có dấu thoải mái (nếp repo).
8. Repo chạy Node 22, ESM thuần (.mjs). Regex có cờ `u` và `\P{L}` chạy được (file rules.mjs đã dùng).

## Verify (bắt buộc chạy đủ)

1. `npm run test:video` — toàn bộ xanh, gồm 7 case mới.
2. Smoke đúng ca lỗi thật (chạy node inline hoặc file tạm, KHÔNG commit file tạm):
```js
import { inventedDetailSentences } from './packages/marketing/src/video/rules.mjs';
const desc = 'Nhân viên SDVICO mặc áo đồng phục gặp gỡ khách hàng cầm hồ sơ tại cảng cá Cà Ná, xung quanh là tàu cá neo đậu và quang cảnh nhộn nhịp.';
console.log(inventedDetailSentences('Ra cảng xem thợ kiểm tra máy. Anh nhân viên SDVICO vừa nói, vừa xách vali dụng cụ, bước thật nhanh xuống mạn.', desc));
// Kỳ vọng: bắt được câu "Anh nhân viên ... xuống mạn." (1 câu, dính cả 3 lỗi).
```
3. Smoke `extractCanhQuay` bằng bản tóm tắt thật trên máy user:
   `C:\Users\ADMIN\Desktop\SDVICO Marketing\Zalo\AI\2026-09-21\video-tom-tat-2026-09-20-2026-09-20-03-tkkd-lap-dat-thiet-bi-tren-tau.md`
   Kỳ vọng: trả về đoạn bắt đầu "Địa điểm: Cảng cá Cà Ná..." gồm cả dòng Hình ảnh + Không khí, một dòng,
   không còn `**` hay bullet. (Không có file này trong CI thì test bằng chuỗi mẫu nhúng trong file test,
   KHÔNG bắt buộc thêm test cho helper này, ưu tiên smoke tay.)
4. `node --check` (hoặc import thử) cho 4 file đã sửa để chắc không lỗi cú pháp:
   `up-media-kho-tu-lieu.mjs` import nhiều package (`@google/genai`) nên chỉ cần `node --check`.

## Điều kiện dừng

- Test cũ đỏ mà nguyên nhân KHÔNG phải PROP_TERMS bắt oan (bẫy 3): DỪNG, không sửa test cũ cho xanh,
  báo lại hiện trạng.
- Phải đổi schema DB hay đụng `apps/approval-ui/`: DỪNG, ngoài phạm vi plan.
- `npm run test:video` không chạy được vì thiếu dependency: DỪNG, báo lại, không tự `npm install` thêm gói mới.

## Definition of Done

1. 5 file sửa đúng phạm vi: `up-media-kho-tu-lieu.mjs`, `hoc-video.mjs`, `video/script.mjs`,
   `video/rules.mjs`, `test-video-rules.mjs`. Không file nào khác.
2. `npm run test:video` xanh toàn bộ; smoke ca 1f608ee3 bắt đúng câu bịa.
3. Commit 1 cái, dạng: `fix(video): mo ta clip ta ro nguoi + chan kich ban bia chi tiet (bai 1f608ee3)`,
   kết thúc bằng dòng đồng tác giả theo quy ước.
4. Push lên `main` theo nếp worktree: `git fetch origin` rồi rebase lên `origin/main` nếu main đã nhích,
   xong `git push origin HEAD:main`; sau đó đồng bộ nhánh `ngay2-marketing` trỏ theo main
   (`git push origin origin/main:ngay2-marketing` sau khi push, hoặc `HEAD:ngay2-marketing`).
5. Hiệu lực thật: description giàu chi tiết chỉ áp cho MEDIA MỚI up từ nay (hoc-video/up-media idempotent,
   không backfill); chốt chặn bịa-thêm áp ngay cho MỌI video build sau deploy.

## Ngoài phạm vi (đừng làm)

- Backfill mô tả cho brand_assets cũ.
- Mô tả theo ĐOẠN clip được cắt (mô tả cả clip vs đoạn dùng) — ghi nhận, để đợt khác.
- Sửa `imageryDriftSentences`, `visualOverlap`, hay danh sách `IMAGERY_TERMS` sẵn có.
