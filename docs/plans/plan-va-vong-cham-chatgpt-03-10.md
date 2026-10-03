# Plan: Vá 4 điểm kỹ thuật theo vòng chấm ChatGPT 3 video mẫu (3/10)

Soạn bởi Fable, thi công bởi Sonnet. Nguồn: ChatGPT chấm 3 video dựng từ pipeline (lọc dầu 7,5; lọc nước 7,3), đo đạc cụ thể. Bốn việc dưới đây là phần KỸ THUẬT đã duyệt làm ngay. Phần intro, outro và cách đọc giá KHÔNG đụng (chờ sếp quyết, lệnh cũ 14/9 và 8/9).

## V1. Âm lượng giọng lên chuẩn mạng xã hội
Đo: cả 3 video ra khoảng -19,5 LUFS, chuẩn social là -16 tới -14. Chuẩn hóa master cuối về I=-15, TP=-1.5, LRA=11 (ffmpeg loudnorm, `packages/marketing/src/video/assemble.mjs`). Nhạc nền không có bước trộn riêng ở nhánh này nên không đổi tỷ lệ.

## V2. Vùng an toàn chữ cho TikTok và Reels (khung 1080x1920)
- Watermark "SDVICO • Hotline ..." hạ xuống cách mép trên khoảng 100px.
- Phụ đề: đáy cách mép dưới tối thiểu khoảng 280px.
- Thẻ giá: cỡ chữ to hơn một nấc, tối đa 2 dòng. Chỉ đổi cỡ và vị trí, KHÔNG đổi nội dung chữ giá.
- Giữ font, màu trắng viền đen. Ý "tô vàng từ khóa" của reviewer: BỎ QUA đợt này.

## V3. Lời đọc hết tuyệt đối hóa
Reviewer bắt 3 câu: "tách nước hoàn toàn", "lọc sạch cặn bẩn nhỏ nhất", "tiết kiệm tới 10% nhiên liệu mỗi chuyến". Thông số có trong tài liệu công ty (điều cấm 5 vẫn ổn) nhưng lời đọc quảng cáo cần khiêm tốn.
- `script.mjs`: thêm luật prompt "LỜI ĐỌC KHÔNG TUYỆT ĐỐI HÓA", phần trăm từ THÔNG SỐ ĐƯỢC PHÉP phải kèm điều kiện.
- `rules.mjs`: quét "hoàn toàn", "nhỏ nhất", "100%", "triệt để" (hẹp, không bắt oan "hoàn toàn yên tâm"), nối vào vòng sinh lại như cụm đã mòn.

## V4. Máy lọc nước: cảnh giải pháp ưu tiên clip "nước chảy ra"
`scene-match.mjs`: video nhóm lọc nước, cảnh solution/reward cộng +6 cho tư liệu có mô tả nước chảy, vòi, ly nước, uống, thử nước, nước ngọt chảy, đầu ra (so không dấu, nguyên từ). Kho chưa có clip như vậy thì hành vi không đổi.

## Ràng buộc
Không đụng intro clip thương hiệu (lệnh 14/9), outro, chữ và mốc giá (lệnh 8/9), storyboard (đang tắt sau công tắc). Verify: `npm run test:video`, `npm run test:scene`, `npm run test:price`, `node --check`.
