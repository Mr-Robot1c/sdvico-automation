# Plan: Vá theo vòng chấm 3 (3/10 chiều)

Soạn bởi Fable, thi công bởi Sonnet. Vòng 3 ChatGPT chấm lọc nước 7,0 / lọc dầu 6,5 / cảng cá 5,5. Hai lỗi chính: (1) câu "có thể giảm từ 5% đến 10%..." vẫn thiếu "tùy tình trạng máy" vì `ensureSavingsCondition` coi câu đã có "có thể" là đủ; chuẩn nghiệm thu đòi CẢ HAI vế. (2) Video content đường thường lọt lời mô tả tư liệu dựng ("Cảnh nhộn nhịp tại cảng cá Long Hải lúc này", "Góc rộng lộ diện cả khu vực của cảng"); guard `sbDescriptiveSentences` chỉ chạy nhánh storyboard đang tắt.

## G1. ensureSavingsCondition đòi ĐỦ CẢ HAI vế
`packages/marketing/src/video/rules.mjs`. Câu khớp mẫu (tiết kiệm hoặc giảm) đi trước số phần trăm, không có "triệu" / "đồng":
- Thiếu "tùy": chèn ", tùy tình trạng máy" trước dấu kết câu, kể cả khi đã có "có thể".
- Thiếu "có thể": chèn "có thể" như cũ (đứng đầu câu thì "Có thể" và hạ chữ hoa; "giúp tiết kiệm" thì chèn trước "giúp").
- Đủ cả hai: giữ nguyên.

## G2. cameraTalkSentences chặn lời tả góc quay ở MỌI nhánh
Hàm export mới trong rules.mjs, so khớp không dấu: "góc rộng", "góc quay", "góc máy", "cận cảnh", "khung hình", "ống kính", "lia máy", "thước phim", "lộ diện", và câu bắt đầu bằng "Cảnh " (tha "cảnh báo / giác / sát / cáo / ngộ"). "Khung cảnh bình yên" không dính. Nối vào script.mjs giống khuôn painSelf: quét mọi cảnh (trừ nhánh storyboard sbMode), dính thì vào vòng sinh lại với lời nhắc không thuyết minh thước phim, hết lượt thì cắt câu, cảnh cắt rỗng thì khối khôi phục trả lời gốc. Gắn thêm vào extraBad của semanticRecheck. Thêm 1 dòng prompt phòng ngừa vào CONTENT_STRUCTURE.

## G3. Cấm quy kết "dầu mua ngoài"
Thêm "dầu mua ngoài", "dầu ngoài chợ", "dầu trôi nổi" vào EXTRA_WORN (vòng worn sẵn có sinh lại rồi cắt câu). Thêm luật prompt "KHÔNG QUY KẾT NGUỒN DẦU" vào SALES_STRUCTURE, nói trung tính về hiện tượng dầu lẫn nước và cặn.

## G4. Phần vấn đề gọn, không lặp ý
Một dòng prompt vào SALES_STRUCTURE cạnh luật 55 từ: hook và empathy mỗi ý nói một lần, tránh khái quát quá tay, nói mềm "để lâu dễ có mùi". Không thêm quét cứng.

## Ràng buộc
Không đụng intro, outro, chữ và mốc giá, storyboard switch. Verify: `npm run test:video` (268 nền cộng ca mới), `npm run test:scene`, `npm run test:price`, `node --check`.
