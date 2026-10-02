# Plan: rào cứng chặn câu thuyết minh trong video content storyboard (2/10)

Gấp cho bài 19:30. Người lập plan: Fable. Người thi công: Sonnet.

## Gốc rễ (đã kiểm bằng bản dựng thật)

Commit 9f769f2 đã cấm thuyết minh bằng prompt trong nhánh sbMode của `packages/marketing/src/video/script.mjs`, nhưng bản dựng mới nhất của bài 2ceb6aa8 (run GH 36983380148) vẫn ra lời tả hình:
- "Kỹ thuật viên đang lắp đặt máy móc. Sửa chữa ngay trong khoang tàu cá..."
- "Người ta đang tập trung làm việc trên boong tàu. Phụ nữ..."
- "Thợ máy đang lắp đặt thiết bị lọc nước biển. Thao tác ngay bên trong khoang tàu cá cũ..."

Guard khớp hình (storyboardDrift) cắt câu không dính mô tả hình, nên model né rủi ro bằng cách tả. Prompt cấm không thắng được cơ chế thưởng phạt, phải rào bằng code như sbChatterSentences đã làm với câu hỏi giao lưu.

## Việc làm (chỉ nhánh storyboard content, video bán hàng không đổi)

1. `rules.mjs`: export `sbDescriptiveSentences(narration)` trả các câu tả hình thuần ngôi thứ ba. Bắt khi câu có " đang " mà không có ngôi kể (mình, tôi, ta, em, anh em, bà con, các bác, chúng mình, tụi mình; so không dấu), hoặc câu mở bằng "Đây là" hay "Đó là".
2. `script.mjs` vòng sinh sbMode: luật mỗi cảnh tối đa 1 câu tả. Cảnh có hơn 1 câu tả thì thêm thông điệp sinh lại vào `extra` và vào điều kiện break. Hết 2 lượt vẫn dính thì giữ câu tả đầu làm neo, cắt từ câu thứ 2; cắt xong rỗng thì giữ lời gốc và cảnh báo cần soi tay.
3. `test-video-rules.mjs`: thêm section sbDescriptiveSentences, tối thiểu 10 ca (bắt lẫn không bắt, có biến thể viết thường không dấu).

## Ràng buộc

Không đụng SALES_STRUCTURE, storyboardDrift, pickStoryboard, sbChatterSentences, các helper imagery và invented. Hook app-map: dòng re-verified trong docs/app-map/marketing.md.

## Verify

`npm run test:video` (nền 185, thực tế 199 sau commit 9f769f2 và ca mới), `npm run test:scene`, `node --check` hai file.
