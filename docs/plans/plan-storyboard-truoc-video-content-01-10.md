# Plan cho Sonnet: VIDEO CONTENT chọn trọn bộ hình TRƯỚC, viết nguyên câu chuyện theo bộ hình (Thanh 1/10, chốt sau 5 bản dựng)

Người lập: Fable 5, 1/10/2026 chiều. Người thi công: Sonnet. Nhánh tách từ `origin/ngay2-marketing`
(phải chứa 1c89f5b), xong push `nhánh:ngay2-marketing` và `nhánh:main`. CHỈ ÁP CHO VIDEO CONTENT
(`opts.contentVideo === true`); video BÁN HÀNG giữ nguyên toàn bộ đường cũ.

## 1. Bối cảnh — 5 bản dựng bài 22452d7f ngày 1/10, Thanh bỏ bài

Chuỗi hiện tại: lời viết TRƯỚC (kèm "visual" mơ ước) → ghép hình SAU theo mô tả → 3 tầng vá
(IMAGERY_TERMS, WORKER_WORDS theo lời, refinePicksByImagery, semanticRecheck d0320a1). Kết quả
cuối: hết lệch hình nhưng lời cảnh bị viết lại thành thuyết minh ảnh ("Bà con di chuyển xe máy
lên phà để ra khơi đánh bắt cá"), mạch chuyện gãy — Thanh: "script chả ăn nhập gì với nhau".
Bài học: với kho Content mỏng, "viết lời trước, tìm hình sau" là bài toán vô nghiệm. Đảo lại:
CHỐT BỘ HÌNH TRƯỚC, model viết MỘT câu chuyện liền mạch bám đúng bộ hình — đúng triết lý sếp
duyệt 15/9 cho cảnh 1 ("kịch bản phải đi đôi với đúng video"), nay áp cho CẢ BÀI content.

## 2. Thiết kế

### Việc 1 — scene-match.mjs: export `pickStoryboard`

```js
// 1/10 (Thanh bỏ bài 22452d7f sau 5 bản dựng): video CONTENT chọn TRỌN BỘ hình trước khi viết
// lời. Bộ 3-4 tư liệu: clip bắt buộc đứng đầu (nếu có), còn lại lấy từ kho đời sống (problemPool
// role 'story'), ưu tiên CLIP hơn ảnh, CÓ MÔ TẢ, ít lên video gần đây (recentUse), không trùng
// nhau; tư liệu mô tả "không thấy người" xếp sau. Trả mảng asset theo thứ tự cảnh.
export function pickStoryboard(assets, { mustAsset = null, recentUse = new Map(), size = 4, productGroup = null } = {}) { ... }
```

Cách chấm từng ứng viên (tái dùng ruleScore role 'story' + phạt recentUse như pickByRole, cộng
thêm +3 nếu có description dài >= 40 ký tự, +2 nếu là video); loại asset đã chọn; mustAsset (nếu
có, lookup theo id trong assets) LUÔN ở vị trí 0 và không tính lại. size = 4 khi kho đủ, tụt 3
khi thiếu; dưới 2 tư liệu dùng được → trả null (caller rơi về đường cũ).

### Việc 2 — script.mjs: nhánh content video storyboard-first

Trong `generateVideoScript`, khi `opts.contentVideo === true`:

1. TRƯỚC attempt loop: `const sb = pickStoryboard(assets, { mustAsset: assets.find(a => a.id === opts.mustUseAssetId) || null, recentUse: opts.recentUse, productGroup: null });`
   `sb` null → chạy nguyên đường cũ (không đổi gì). Có `sb` → log danh sách.
2. Prompt sinh kịch bản (chỉ nhánh này) THAY phần mô tả cấu trúc cảnh bằng: "Video có ĐÚNG
   ${sb.length} cảnh. Cảnh i dùng hình này, lời cảnh i phải bám NHỮNG GÌ MÔ TẢ NÓI CÓ:
   <title + description từng tư liệu>. Kể thành MỘT câu chuyện liền mạch: cảnh 1 mở hút theo
   hình, các cảnh giữa nối nhau bằng câu chuyển, cảnh cuối kết bằng đúng một câu hỏi giao lưu.
   Không bịa chi tiết (người, đồ vật, địa danh) không có trong mô tả. Mỗi câu <= 14 chữ." Giữ
   nguyên mọi luật cấm sẵn có trong system prompt (không xóa dòng nào, chỉ thay phần cấu trúc
   cảnh + bỏ yêu cầu viết "visual" tự do: visual cảnh i = chính mô tả tư liệu i).
3. TRONG attempt loop, thêm check `storyboardMiss` (chỉ nhánh content + có sb): với TỪNG cảnh i,
   `visualOverlap(lời+visual, sb[i]) === 0` HOẶC `imageryDriftSentences(lời_i, title+desc sb[i])`
   HOẶC `inventedDetailSentences(lời_i, ...)` có phần tử → sinh lại, message nhắc đúng cảnh nào
   lệch kèm mô tả tư liệu (bắt chước cách mustMiss đang nhắn). Hết lượt vẫn miss → cắt câu drift
   từng cảnh (cutImageryDrift), cảnh rỗng khôi phục lời gốc + console.warn (pattern sẵn có).
4. SAU loop: KHÔNG gọi matchScenesToAssets/refine/semantic cho nhánh này — picks dựng thẳng:
   `picks[i] = { assetId: sb[i].id, fit: 10, why: 'storyboard: hình chốt trước, lời viết theo hình', by: 'storyboard' }`.
   (Số cảnh model trả có thể lệch sb.length: > thì cắt cảnh thừa, < thì cắt sb cho khớp — log.)
5. Video bán hàng (`contentVideo false`): KHÔNG đổi một dòng nào trong nhánh của nó.

### Việc 3 — test (không mạng)

- `test-scene-match.mjs` mục 16: pickStoryboard — must đứng đầu; ưu tiên clip có mô tả, né
  recentUse cao; không trùng; kho 1 tư liệu → null.
- `test-video-rules.mjs`: ca storyboardMiss thuần nếu tách được hàm kiểm (ví dụ export
  `storyboardDrift(scenes, sb)` trả danh sách cảnh lệch) — tách hàm thuần để test, phần gọi
  model không test.

## 3. Ràng buộc và bẫy

- KHÔNG đụng video bán hàng, KHÔNG đụng giọng đọc, KHÔNG xóa luật cấm nào trong prompt.
- File .mjs CRLF + tiếng Việt: sửa bằng Edit chuỗi đúng trong file, không sed heredoc.
- Worktree junction node_modules (tạo rồi XÓA); test ở GỐC worktree: test:video, test:scene,
  test:price đều xanh.
- Hook app-map: entry `<!-- re-verified: 2026-10-01 (5) - STORYBOARD TRUOC CHO VIDEO CONTENT ... -->`
  vào docs/app-map/marketing.md + dòng re-verify trong commit message.
- Commit `feat(video): ...` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## 4. Điều kiện dừng

- Nhánh bán hàng buộc phải đổi mới chạy được → DỪNG, báo.
- Không tách được hàm thuần để test → DỪNG, báo.
- Test cũ đỏ không lý giải được → DỪNG, báo.

## 5. Definition of Done

1. scene-match.mjs + script.mjs + 2 file test, đúng phạm vi; app-map re-verified.
2. 3 suite test xanh, có ca mới cho pickStoryboard và drift theo storyboard.
3. Push `ngay2-marketing` + `main`. KHÔNG tự dựng video — người lập plan sẽ cho rotate sinh bài
   content MỚI (bài 22452d7f đã bỏ hẳn) và soi frame bản dựng đầu tiên của đường mới.
