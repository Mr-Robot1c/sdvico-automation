# Plan: Vá theo vòng chấm 2 (3/10), biến lời dặn prompt thành LUẬT CỨNG

Soạn bởi Fable, thi công bởi Sonnet. Vòng 2 chấm lọc nước 6,5 / cảng cá 7,5 / lọc dầu 6,0. Phát hiện quan trọng nhất: phụ đề lọc dầu vẫn "tiết kiệm từ 5% đến 10% nhiên liệu" KHÔNG có điều kiện, vì bản vá vòng 1 chỉ dặn trong prompt và model bỏ qua. Bài học: lời dặn prompt KHÔNG đủ, phải có bước xử lý tất định.

## F1. Câu phần trăm tiết kiệm TỰ ĐỘNG thêm điều kiện (tất định, không nhờ model)
`ensureSavingsCondition(narration)` trong `packages/marketing/src/video/rules.mjs`. Câu có "tiết kiệm" hoặc "giảm" đi trước một số phần trăm mà chưa có "tùy" và "có thể" thì viết lại: chèn "có thể" ngay trước động từ (đứng đầu câu thì "Có thể" và hạ chữ hoa; "giúp tiết kiệm" thì chèn trước "giúp"), nối ", tùy tình trạng máy" trước dấu kết câu. Câu có số tiền (triệu, đồng) bỏ qua. Gọi trong `script.mjs` sau khi kịch bản chốt, trên narration từng cảnh, mọi nhánh video; phụ đề lấy từ narration nên tự khớp.

## F2. Mở rộng absoluteClaims
Bắt thêm "hạn chế tối đa" / "giảm tối đa" (kể cả một danh từ hao hụt xen giữa) và "chủ động hoàn toàn" / "hoàn toàn chủ động". Không bắt "tốc độ tối đa 60 hải lý".

## F3. Trần peak âm thanh có biên
Loudnorm 2-pass đích TP đổi -1.5 thành -1.7 (assemble.mjs) để kết quả thực luôn không vượt -1,5 dBTP (vòng 2 đo -1,48 và -1,49).

## F4. Watermark bỏ dấu chấm tròn
"SDVICO • Hotline 0939 243 222" đổi thành "SDVICO - Hotline 0939 243 222" (CLAUDE.md mục 4 cấm chấm tròn giữa câu).

## F5. Video bán: hook cấm mở bằng chuyện sửa máy
Luật prompt mới cạnh luật nỗi đau của tàu chưa lắp, kèm quét cứng `hookRepairSentences`: cảnh 1 video BÁN có câu "sửa tới / sửa lần / sửa hoài / sửa mãi / sửa máy" mà không kèm "cũ" thì vào vòng sinh lại (cùng khuôn painSelf), hết lượt thì cắt câu đó.

## F6. Content: cảnh kết đúng MỘT câu hỏi
`keepOneQuestion`: cảnh cuối video CONTENT (đường thường, không storyboard) có nhiều hơn 1 câu hỏi thì giữ câu hỏi đầu, bỏ các câu hỏi sau, giữ câu trần thuật. Kèm một dòng prompt content: "Tả vừa phải, không tô vẽ vượt những gì hình cho thấy rõ."

## Ràng buộc
Không đụng intro, outro, chữ và mốc giá, không bật storyboard. Verify: `npm run test:video`, `npm run test:scene`, `npm run test:price`, `node --check`.
