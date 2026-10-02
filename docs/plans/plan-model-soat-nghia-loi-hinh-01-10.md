# Plan cho Sonnet: model soát NGHĨA lời-hình, viết lại lời cảnh lệch theo mô tả hình (Thanh 1/10, vòng 2)

Người lập: Fable 5, 1/10/2026 trưa. Người thi công: Sonnet. Nhánh tách từ `origin/ngay2-marketing`
(phải chứa bb5be75), xong push `nhánh:ngay2-marketing` và `nhánh:main`.

## 1. Bối cảnh — vì sao vá keyword 3 đợt vẫn chưa xong

Bài 22452d7f dựng 4 lần ngày 1/10, Thanh + Fable soi frame từng bản:
- Vòng 1-2: lỗi "ốc gỉ sét trên clip máy mới", "đội kỹ thuật trên hình cảng" → vá IMAGERY_TERMS
  + WORKER_WORDS (f6da8a0), refinePicksByImagery (fcc1e0c), needsWorker theo lời đọc (bb5be75).
- Vòng 4 (đủ cả 3 bản vá): VẪN lệch 2 cảnh — "đứng dưới hầm máy siết từng vòng gen" trên hình
  máy bơm NGOÀI TRỜI ở cầu cảng; "ngồi giữa chòng chành sóng nước... thợ căn chỉnh" trên hình cảng.

Kết luận: so CHỮ (title/description vs từ khóa) không đo được NGHĨA; model viết lời kiểu lệch
mới mỗi vòng (hầm máy, siết vòng gen...) mà danh sách từ khóa không phủ nổi. Thêm nữa kho
Content tươi tuần này toàn cảnh cảng/bờ, lời content hay tả hầm máy/giữa biển — lời và kho
không giao nhau thì ĐỔI HÌNH kiểu gì cũng lệch; đường đúng còn lại là SỬA LỜI THEO HÌNH.

## 2. Thiết kế: bước semanticRecheck sau refinePicksByImagery

Triết lý đã được sếp duyệt từ 15/9 cho cảnh 1 ("kịch bản phải đi đôi với đúng video", lời cảnh
must viết theo MÔ TẢ clip): nhân rộng cho MỌI cảnh, nhưng chỉ khi máy phát hiện lệch — không
viết lại cả bài.

Vị trí: `packages/marketing/src/video/script.mjs`, SAU khối gọi `refinePicksByImagery` (1/10)
và TRƯỚC khi build `vertical`. Cảnh mustIdx/hookPin (các index trong `skip` hiện có) MIỄN —
đã có vòng riêng.

### Bước A — model chấm độ khớp nghĩa (1 lời gọi cho cả video)

Hàm mới trong script.mjs (không cần file mới):

```
async function semanticFitCheck(ai, scenes, picks, assetById) -> [{scene, fit 0-10, vi_sao}]
```

- Prompt (dùng `generateWithRetry` + `MKT_MODEL` như các chỗ khác, responseMimeType JSON):
  system: "Bạn là người duyệt video. Với từng cảnh, chấm hình đã chọn có KHỚP NGHĨA với lời
  đọc không khi phát cùng lúc: 10 = đúng bối cảnh; 5 = không chướng; <= 4 = người xem thấy sai
  (lời tả trong hầm máy mà hình ngoài trời, lời tả trên biển mà hình trên bờ, lời tả người làm
  việc mà hình không có ai...). Chỉ chấm theo mô tả hình, không suy diễn thêm."
  user: liệt kê từng cảnh "LỜI: ... | HÌNH ĐÃ CHỌN: <title + description>". Trả
  `{"picks":[{"scene":1,"fit":0-10,"vi_sao":"..."}]}` — parse bằng `extractFirstJson` (import
  sẵn có từ scene-match).
- Model lỗi/parse hỏng → coi như mọi cảnh fit 10 (bỏ qua bước này, warn) — KHÔNG chặn build.

### Bước B — cảnh fit <= 4: viết lại LỜI theo mô tả hình (1 lời gọi gộp)

- Gom các cảnh fit <= 4 (trừ skip/mustIdx) vào MỘT lời gọi: với từng cảnh đưa (vai cảnh, lời cũ,
  mô tả hình, số câu tối đa = số câu lời cũ, ~ số chữ lời cũ ±30%), yêu cầu: "Viết lại lời cảnh
  theo ĐÚNG những gì mô tả hình nói có; giữ mạch với cảnh trước/sau (đưa lời cảnh kề làm ngữ
  cảnh, không viết lại chúng); không bịa chi tiết ngoài mô tả; không nhắc giá; câu <= 14 chữ;
  giọng nói chuyện với bà con." Trả JSON {scene, loi_moi}.
- Lời mới đi qua ĐÚNG các lưới hiện có trước khi nhận (tái dùng hàm sẵn trong script.mjs /
  rules.mjs, xem cách attempt loop dùng): `redactExactPrices`, cắt cụm cấm/mòn
  (`stripSentencesWith` với danh sách worn/cross đã tính ở trên — nếu biến không còn trong
  scope thì quét lại bằng hàm gốc từ rules.mjs cho riêng lời mới), `breakLongSentences`, và
  `imageryDriftSentences(loi_moi, mô tả hình)` phải RỖNG — còn drift thì GIỮ LỜI CŨ + CẢNH BÁO
  (như nấc c của refine) chứ không nhận bừa.
- Nhận lời mới: cập nhật `rawScenes[i].narration`, và ghi dấu vào sceneMatch
  (`why: 'viết lại lời theo hình (soát nghĩa 1/10)'`, `by: 'semantic'`) để người duyệt thấy.
- Số chữ đổi → độ dài video đổi: KHÔNG sao, audio đọc theo lời mới, assemble tự co giãn.

### Bước C — ghi vết

- console.warn mỗi cảnh bị chấm <= 4 kèm vi_sao; nếu có cảnh phải giữ lời cũ vì lời mới vẫn
  drift → why có 'CẢNH BÁO' như refine.

## 3. Việc cụ thể

1. script.mjs: thêm `semanticFitCheck` + khối gọi A/B/C sau refinePicksByImagery. Đọc kỹ vùng
   đó (sau 1/10 có biến `skip`/`mustIdxScene` của Sonnet đợt trước) — tái dùng, đừng tính lại.
2. Lời gọi model: bắt chước đúng kiểu `generateWithRetry(ai, { model: MKT_MODEL, contents, config: { systemInstruction, responseMimeType: 'application/json' } })` như matchScenesToAssets.
3. Test (`test-video-rules.mjs` hoặc file test mới KHÔNG gọi mạng): tách phần thuần túy ra hàm
   kiểm được — ví dụ export từ script.mjs một hàm `applySemanticRewrites(rawScenes, picks, rewrites, {skip, assetById})`
   (nhận kết quả model đã parse, làm phần lưới + cập nhật) và test hàm đó:
   - lời mới sạch → narration đổi, by 'semantic';
   - lời mới vẫn drift với mô tả hình → giữ lời cũ + why có CẢNH BÁO;
   - cảnh trong skip → không đổi dù có rewrite;
   - lời mới dính giá chính xác → bị redact trước khi nhận.
   (Tách hàm sao cho phần GỌI MẠNG mỏng nhất có thể; đừng test phần mạng.)
4. app-map: entry `<!-- re-verified: 2026-10-01 (4) - SOAT NGHIA LOI-HINH ... -->` vào
   docs/app-map/marketing.md + dòng re-verify trong commit message.

## 4. Ràng buộc và bẫy

- KHÔNG đụng attempt loop sinh kịch bản ban đầu, KHÔNG đụng giọng đọc, KHÔNG đổi matching/refine
  hiện có — bước mới NỐI TIẾP sau chúng.
- +2 lời gọi Gemini mỗi video (quota 20/ngày/model đã căng): bước A/B chỉ chạy khi `assets.length`
  và khi có pick; model 429 → bỏ qua bước, build vẫn chạy (như scene-match đã làm).
- Worktree junction node_modules (tạo rồi XÓA); test chạy ở GỐC worktree: test:video, test:scene,
  test:price đều phải xanh.
- File .mjs trong repo có file CRLF: sửa bằng Edit theo chuỗi đúng trong file, đừng script sed
  bừa. Commit `fix(video): ...` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## 5. Điều kiện dừng

- Phải sửa attempt loop / matching cũ mới chạy được → DỪNG, báo.
- Không tách được hàm thuần để test không-mạng → DỪNG, báo (đừng nộp bài không test).
- Test cũ đỏ không lý giải được → DỪNG, báo.

## 6. Definition of Done

1. script.mjs (+ test file) đúng phạm vi; KHÔNG file nào khác ngoài app-map.
2. test:video / test:scene / test:price xanh, có ≥ 4 ca mới cho applySemanticRewrites.
3. Push `ngay2-marketing` + `main`. KHÔNG tự dựng video — người lập plan dựng lần 5 và soi frame.
