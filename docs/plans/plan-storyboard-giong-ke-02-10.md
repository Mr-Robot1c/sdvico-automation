# Plan 2/10: video content storyboard-first phải KỂ CHUYỆN theo hình, hết thuyết minh ảnh (Fable lập, Sonnet thi công)

## Bối cảnh + root cause (đã xác minh bằng video thật)
Bài content đầu tiên chạy cơ chế storyboard-first (commit 4261e06, deploy 1/10) là 2ceb6aa8 "3 giờ sáng giữa khơi xa...". Cơ chế khớp hình chạy ĐÚNG (lời bám hình 100%), nhưng lời thoại thành THUYẾT MINH ẢNH, ví dụ thật từ brief.video_timeline:
- hook: "Tay cầm điều khiển game đang kiểm tra động cơ trong xưởng kỹ thuật nè! Thao tác có chuẩn x..."
- story: "Đội ngũ ngư dân đang tập trung làm việc trên boong tàu cá ở cảng Long Hải! Phụ nữ vá lưới..."
- closing: "Thợ máy đang lắp đặt thiết bị lọc nước biển bên trong tàu cá cũ phải không?"
Đây đúng kiểu Thanh đã chê 1/10 ("lời thành thuyết minh ảnh") nên phải sửa trước khi mời duyệt.

Root cause nằm ở prompt nhánh sbMode trong `packages/marketing/src/video/script.mjs`:
1. `STORYBOARD_STRUCTURE`: lệnh "lời cảnh i phải bám NHỮNG GÌ MÔ TẢ NÓI CÓ" và "Kể thành MỘT câu chuyện liền mạch..." nhưng KHÔNG cho khung kể (người kể là ai, chuyện gì từ bài nguồn), nên model chọn đường an toàn nhất là tả hình.
2. Dòng role sbMode chỉ nói số cảnh + "mỗi câu chỉ nói điều mô tả hình của cảnh đó có", ép tả thêm lần nữa. Nhánh content THƯỜNG có KIỂU KỂ xoay (STYLE.open/STYLE.close) nhưng nhánh sbMode BỎ MẤT STYLE.
3. Dòng system sbMode: "Chỉ viết lời thoại từng cảnh sao cho mọi câu đều tả hoặc dẫn từ đúng những gì hình đó có", "mọi câu đều tả" là lệnh sai.
4. Luật cảm xúc bắt mỗi cảnh có ít nhất 1 câu "!" hoặc "?", kết hợp với lệnh tả hình đẻ ra pattern "tả + nè!/phải không?".

## Việc phải làm (3 mũi, CHỈ nhánh storyboard, video bán hàng KHÔNG đổi một dòng)

### M1. Viết lại prompt sbMode trong script.mjs
a) `STORYBOARD_STRUCTURE`: giữ item BỘ HÌNH, thay item "Kể thành MỘT câu chuyện liền mạch..." bằng khung kể rõ:
- Bạn KỂ cho anh em đi biển nghe CHUYỆN của BÀI NGUỒN (chủ đề, cảm xúc, bài học trong bài nguồn), hình từng cảnh là BỐI CẢNH MINH HỌA, không phải đối tượng để tường thuật.
- Mỗi cảnh 2 tới 3 câu: ÍT NHẤT 1 câu NEO vào 1 hoặc 2 chi tiết CÓ THẬT trong mô tả hình của cảnh đó; các câu còn lại kể tiếp mạch chuyện, cảm xúc, ý nghĩa lấy từ BÀI NGUỒN. Không bịa chi tiết không có trong mô tả hình.
- CẤM câu tường thuật hình kiểu thuyết minh: "X đang làm Y...", "Đây là...", câu kết bằng "... nè!" chỉ để khoe hình, "... phải không?", "... đúng không?". Câu hỏi giao lưu CHỈ ở cảnh cuối.
- Từ ngữ tả cảnh (biển đêm, sóng, cảng, khoang máy, giữa khơi...) CHỈ dùng khi mô tả hình cảnh đó có cảnh ấy, hệ thống sẽ cắt câu tả cảnh không có trong hình (guard storyboardDrift/imageryDriftSentences GIỮ NGUYÊN).
- Giữ nguyên "Mỗi câu <= 14 chữ", giữ item đầu/cuối lấy từ CONTENT_STRUCTURE.

b) Dòng role sbMode: thêm KIỂU KỂ như nhánh content thường: cảnh 1 hook theo `STYLE.label`/`STYLE.open`, cảnh cuối theo `STYLE.close` nhưng vẫn kết đúng một câu hỏi giao lưu. Sửa câu "mỗi câu chỉ nói điều mô tả hình của cảnh đó có" thành "mỗi cảnh neo vào hình của nó theo luật BỘ HÌNH ở trên, mạch chuyện là của BÀI NGUỒN".

c) Dòng system sbMode: đổi "mọi câu đều tả hoặc dẫn từ đúng những gì hình đó có" thành "mỗi cảnh ít nhất một câu neo đúng chi tiết trong hình, các câu còn lại kể chuyện theo bài nguồn, không nhắc thứ không có trong mô tả hình".

### M2. Guard chặn câu hỏi giao lưu giữa bài
Helper mới `sbChatterSentences(narration)` export trong `packages/marketing/src/video/rules.mjs`. Bắt (fold không dấu, lowercase) các câu chứa: "phải không", "đúng không", "phải hông", "đúng hông", "thấy không", "thấy hông", "có thấy vậy không". KHÔNG bắt câu cảm ("Nhẹ cả người!"), KHÔNG bắt câu hỏi tu từ khác ngoài danh sách.

Trong vòng sinh sbMode của script.mjs: biến `sbChatter` = các cảnh KHÔNG PHẢI cảnh cuối có câu dính; dính thì thêm thông điệp sinh lại vào `extra` (khuôn storyboardMiss) và đưa vào điều kiện break. Hết 2 lượt vẫn dính thì CẮT câu dính khỏi narration (cảnh rỗng thì giữ lời gốc + console.warn).

### M3. Test
`packages/marketing/src/test-video-rules.mjs`: section mới cho sbChatterSentences, tối thiểu 8 ca: bắt "Thợ máy đang lắp thiết bị phải không?", "Bà con có thấy vậy không?", "Đúng không nào anh em?", biến thể không dấu/hoa thường; KHÔNG bắt "Nhẹ cả người!", "Tiếng máy nổ đều, mình mới ngủ ngon.", "Sao dầu xuống nhanh vậy?", "".

## Ràng buộc repo
- KHÔNG đụng SALES_STRUCTURE, nhánh short/bán hàng, storyboardDrift, pickStoryboard, imageryDriftSentences, inventedDetailSentences, tidy/pitch/tempo.
- File .mjs là UTF-8 tiếng Việt: sửa bằng Edit exact-string, không dùng heredoc ghi file.
- Bảy điều cấm CLAUDE.md: không bịa thông số; văn phong prompt: không gạch dài, không mũi tên.
- Pre-commit hook app-map: dòng `re-verified` trong `docs/app-map/marketing.md` + dòng `re-verify(packages/marketing): ...` trong commit.

## Verify
1. `npm run test:video` (trước đó 174/174, cộng ca mới).
2. `npm run test:scene`.
3. `npm run test:clip`.
4. `node --check` script.mjs và rules.mjs.

## Điều kiện dừng
Phải sửa quá ~150 dòng, hoặc buộc đụng nhánh bán hàng, hoặc test sẵn có gãy không rõ lý do thì DỪNG và báo lại.
