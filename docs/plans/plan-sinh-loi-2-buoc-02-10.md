# Plan: sinh lời storyboard HAI BƯỚC, viết trọn chuyện trước, chia theo hình sau (2/10 đêm)

Người ra yêu cầu: Fable lập plan, Sonnet thi công. Trigger: Thanh chê bản dựng 3 bài 2ceb6aa8 "không liên kết gì với nhau".

## Root cause
Nhánh sbMode của `packages/marketing/src/video/script.mjs` cho model viết TRỰC TIẾP lời từng cảnh dưới áp lực guard khớp-hình (`storyboardDrift` cắt câu chứa từ tả cảnh không có trong hình). Chiến lược an toàn nhất của model là tả từng hình, nên mạch chuyện không hình thành. Prompt kể chuyện (9f769f2) và rào 1 câu tả/cảnh (30ebb94) đều hụt vì pattern-guard đo được dạng câu, không đo được mạch.

## Thiết kế (chỉ nhánh sbMode content; bán hàng và đường content cũ sb null không đổi)

### Hai lượt gọi model
- Lượt A, viết chuyện: input là bài nguồn, kiểu kể xoay (STYLE), một dòng bối cảnh rút từ title các hình. Không thấy mô tả hình. Yêu cầu một câu chuyện 110 tới 150 từ (N cảnh nhỏ hơn 4 thì ít hơn), chia N đoạn, ngôi mình/anh em, một ý xuyên suốt, câu tối đa 14 chữ, mỗi đoạn có câu cảm hoặc nhịp ngắn, kết đúng một câu hỏi giao lưu. Trả `{"titles":[...],"story":"..."}`. Quét SỰ THẬT NGHỀ và cụm mòn trên story theo cách tất định (cắt câu, không gọi lại model). Story dưới 50 từ hoặc lượt A lỗi thì rơi về đường 1 lượt cũ.
- Lượt B, chia chuyện theo hình: input là story nguyên văn và BỘ HÌNH đầy đủ mô tả. Chia đúng N đoạn, giữ nguyên văn, mỗi đoạn thêm tối đa một mệnh đề neo vào chi tiết có thật trong mô tả hình. Trả `vertical.scenes` đúng cấu trúc cũ. Vòng attempt cũ (tối đa 2 lần) giờ là vòng của lượt B, vẫn quét viol, worn, sbChatter, sbDescMiss, storyboardMiss, sai số cảnh. Titles lấy từ lượt A.
- Số call model mỗi video content: tối đa 3 (A một lần, B tối đa hai lần), trước đây tối đa 2. Chấp nhận thêm 1 call.

### Nới guard khớp-hình cho câu KỂ
`storyboardDriftKeChuyen(scenes, sb, {log})` trong `scene-match.mjs` (hàm gốc `storyboardDrift` không đổi): câu trôi hình chỉ bị cắt khi đồng thời là câu TẢ (`sbDescriptiveSentences`); câu KỂ trôi hình được tha và `console.warn`. `inventedDetailSentences` (bịa đạo cụ, giới tính người) và no-overlap cảnh giữa giữ nguyên hiệu lực. Hai chỗ phụ thuộc cũng sửa: bước cắt cuối vòng sinh chỉ xóa đúng câu `m.sentences` (không còn `cutImageryDrift` cả cảnh), và bước `cutImageryDrift` sau ghép hình bị bỏ qua ở sbMode vì nó sẽ cắt luôn câu kể được tha.

## Verify
`npm run test:video` 199/199, `npm run test:scene` (thêm 10 kiểm tra cho hàm bọc), `npm run test:clip` 10/10, `node --check` script.mjs, scene-match.mjs, rules.mjs. Smoke test mô phỏng model bằng stub: đúng 3 call (A + B hai lần), titles lấy từ lượt A. Không dựng video thật; Fable dựng lại bài 2ceb6aa8 sau deploy để nghiệm thu bằng mắt.
