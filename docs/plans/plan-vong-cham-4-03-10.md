# Plan nhỏ: câu "thu hồi vốn" không được đôn mốc nhanh hơn bài nguồn (vòng chấm 4, 3/10)

Bối cảnh: bài e3acd98f "Bài toán thu hồi vốn đầu tư máy lọc nước biển sau một năm". Bài nguồn nói thu hồi vốn SAU MỘT NĂM, video model viết "chỉ độ vài chuyến là thu hồi vốn". Làm quá so với nguồn, trái Điều cấm 5. Reviewer yêu cầu bỏ câu này trước khi đăng.

## H1. Hàm quét trong packages/marketing/src/video/rules.mjs

Export `paybackClaimSentences(text, sourceText)`:
- Bắt câu chứa cụm thu hồi vốn: "thu hồi vốn", "hoàn vốn", "lấy lại vốn", "gỡ vốn" (so khớp không dấu).
- Câu dính khi kèm MỐC NHANH ("vài chuyến", "mấy chuyến", "ít chuyến", "dăm chuyến", "đôi chuyến", "vài tuần", "mấy tuần", "vài tháng", "mấy tháng", "độ vài", "chỉ vài") mà bài nguồn (so không dấu) KHÔNG chứa cụm mốc đó.
- Mốc cụ thể (vài chuyến...) xét trước. "độ vài" và "chỉ vài" chỉ xét khi câu không có mốc cụ thể, để bài nguồn có "vài chuyến" thì câu "chỉ độ vài chuyến" không bị bắt oan.
- sourceText rỗng hoặc null thì mọi câu thu hồi vốn kèm mốc nhanh đều dính.
- Câu thu hồi vốn không kèm mốc nhanh ("sau một năm là thu hồi vốn") không dính.

## H2. Nối vào packages/marketing/src/video/script.mjs

- Biến bài nguồn: `sourceText` = tiêu đề + bài viết (`content.title` và `content.draft`), cùng nguồn với `percentSources` và khối "Bài viết" trong prompt.
- Vòng sinh lời: quét mọi cảnh, mọi nhánh, theo khuôn painSelf, hookRepair, cameraTalk. Dính thì sinh lại với lời nhắc "bài nguồn không nói thu hồi vốn nhanh vậy. Mốc thời gian thu hồi vốn phải ĐÚNG như bài nguồn".
- Hết lượt thì cắt câu khỏi mọi cảnh; cảnh cắt rỗng được khối khôi phục trả lời gốc.
- semanticRecheck: thêm vào `extraBad`.
- Prompt: một dòng "MỐC THU HỒI VỐN" ở khối chung (áp cho cả video bán hàng và video content).

## Kiểm
test-video-rules.mjs thêm 9 ca (nền 288, nay 297). test:scene, test:price, node --check đều đạt.
