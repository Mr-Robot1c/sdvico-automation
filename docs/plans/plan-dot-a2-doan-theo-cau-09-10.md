# Plan đợt A2: chọn đoạn phục vụ ĐÚNG CÂU đang nói (9/10)

Người soạn: Opus (plan), Sonnet thi công. Nền: dbce022. Tiếp nối `plan-dot-a-cum-clip-doan-cat-09-10.md`.

## Bối cảnh

Đợt A thêm `brand_assets.segments` và `shoot_cluster`, dựng video content theo một cụm xuyên suốt. Sửa nóng dbce022 giới hạn chế độ cụm cho video content vì video bán bị mất hình sản phẩm. Người review so cùng kịch bản cũ và mới, kết luận:

- Content (22452d7f): cụm giúp rõ rệt, nhưng câu "Nhìn người thợ đẫm mồ hôi" chiếu động cơ và đường ống (đúng bối cảnh, sai chủ thể câu). Giây 17 tới 27 nhiều shot thợ áo xám cùng vị trí, cảnh kết quay lại shot quen. Không thấy diễn tiến chuẩn bị, thao tác, hoàn tất.
- Bán (66b894f8): cảnh giá bản mới mở bằng thợ vươn tay che máy. Cảnh giá phải cho nhận ra món đang báo giá NGAY KHI CẢNH BẮT ĐẦU. Câu "cho dầu diesel luôn sạch tinh" đòi hình chứng minh mạnh hơn thiết bị đang lắp.
- Kết luận: cắt đoạn có hành động chưa đủ, phải cắt đoạn phục vụ đúng câu đang nói.

## A2.1 Nhãn đoạn mới

Mỗi đoạn thêm: `subject` (nguoi, thiet_bi, ca_hai, canh_chung), `product_visible` (ro_tu_dau, ro_sau, mo, khong) cùng `product_clear_from` (giây thiết bị chính hiện rõ khi ro_sau), `stage` (chuan_bi, thao_tac, hoan_tat, van_hanh, khac).

- `segments.mjs` `normalizeSegments` chuẩn hóa nhãn. Thiếu nhãn là null (không biết). Nhãn lạ về giá trị trung tính (canh_chung, mo, khac). ro_sau thiếu giây hiện rõ thành mo. Đoạn dài bị tách thì nhãn ro_sau được thu về từng khúc.
- Đoạn cũ của đợt A không có nhãn: mức "không biết" (1), không được ưu tiên cho cảnh sản phẩm khi đã có đoạn biết là rõ, vẫn dùng được khi kho chỉ có đoạn cũ.
- `segment-clips.mjs`: prompt Gemini có định nghĩa 4 nhãn (không chắc thì giá trị trung tính). Chế độ `--date <ngày>` lấy mọi clip cùng ngày Zalo (Content và thư mục sản phẩm) rồi gom cụm một lượt, id cụm `<ngày>|ca-ngay|<số>`. Clip đã có đoạn nhưng chưa có nhãn A2 tự được mô tả lại.

## A2.2 Chọn đoạn theo câu và vai

- `sentenceSubject(câu)`: nguoi, san_pham, chung. Có cả người và sản phẩm thì tính san_pham (hình sản phẩm khó bù hơn).
- `sceneNeed(cảnh, vai, {salesVideo, productTerms})`: cảnh cần người (có câu thuần nói về người), cần thấy rõ máy (vai solution, price, reward của video bán, hoặc có câu nhắc sản phẩm).
- `segFitLevel`: mức 3 đúng nhu cầu, 2 ro_sau cắt từ `product_clear_from` (phần còn lại phải từ 1,5 giây), 1 không biết, 0 trái nhu cầu. Chọn đoạn theo (mức, điểm) nên cảnh giá ưu tiên tuyệt đối ro_tu_dau.
- Video bán: đoạn "thấy rõ máy" chỉ tính từ tư liệu thư mục sản phẩm (Content không bảo đảm đúng model). Ảnh sản phẩm vẫn hợp lệ như trước.
- `matchScenesToAssets`: video bán, cảnh sản phẩm chọn trúng clip mà mọi đoạn đều biết là mờ, trong khi kho còn đoạn thấy rõ máy, thì đổi sang đoạn đó (`by: 'product-seg'`). Không có đoạn thay thế thì giữ nguyên.
- Cảnh giá (`script.mjs`): chọn đoạn ro_tu_dau trong cụm, rồi trong cả kho, rồi mới tới ảnh sản phẩm.

## A2.3 Diễn tiến, chống quẩn (chỉ video content trong chế độ cụm)

- `progressAdjust`: stage lùi trừ 4, stage tiến cộng 1; cùng clip, cùng stage và việc gần giống (Jaccard từ không dấu từ 0,5) trừ 8; đổi stage hoặc việc mới thì cho qua.
- Cảnh kết không lấy lại khoảng giây chồng quá 50% của cảnh mở (cùng clip).
- `allocateSceneSegments`: đoạn nối không ghép hai đoạn cùng clip cùng stage liền nhau nếu cụm còn đoạn khác hợp; hết đoạn khác thì đành nối.

## A2.4 Video bán dùng cụm theo ngày

`pickClusterForVideo` cho video bán chọn cụm chính chỉ khi cụm có đủ đoạn thấy rõ máy (ro_tu_dau hoặc ro_sau còn từ 1,5 giây, tư liệu thư mục sản phẩm) cho mọi cảnh solution cộng cảnh giá. Thiếu thì null như dbce022. Video content vẫn như đợt A. mustUse và hook-pin giữ ưu tiên.

## A2.5 "luôn sạch tinh"

`rules.mjs` `absoluteClaims` bắt "luôn sạch", "sạch tinh", "sạch bong", "sạch bóng" trong câu nói về dầu, nước, nhiên liệu ("boong tàu luôn sạch sẽ" cho qua). Prompt viết lời chỉ thêm các cụm đó vào danh sách cấm kèm gợi ý "giúp dầu sạch hơn trước khi vào máy".

## Nghiệm thu

- `npm run test:cluster` (thêm mục 18 tới 25), `test:video` (thêm 3 ca A2.5), `test:scene`, `test:price`, `test:clipguard` đạt. `node --check` các file sửa.
- Không dựng video. Chạy `build-video.mjs <id> --script-only --assembly new --reuse-script <file>` cho 22452d7f và 66b894f8 để xem bảng chọn cảnh.
- Ràng buộc: không đổi prompt viết lời ngoài A2.5, không đụng giá, intro, outro, storyboard.
