# Kế hoạch đợt A: chọn đoạn trong clip và giữ một cụm tư liệu xuyên suốt video (9/10)

Người lập: Opus. Thi công: Sonnet. Trạng thái: đã thi công 9/10, chờ Opus dựng so sánh và soi.

## Vấn đề (đã xác minh)

- `packages/marketing/src/video/assemble.mjs` cảnh video luôn `-stream_loop -1 -i scene.videoPath`, tức luôn lấy clip từ giây 0 và lặp nếu ngắn. Không có chọn đoạn. Mô tả clip (`brand_assets.description`) chỉ 2 trên 114 clip có mốc trong clip.
- `scene-match.mjs` chấm từng cảnh riêng (từ khóa, vai, recentUse, tránh lặp). Không có ràng buộc cả video cùng một việc hay một buổi quay. Nhánh chống lặp còn đá clip đã chọn để thay clip mới khác bối cảnh.
- Kho có 114 clip gốc, 96 có `license_note` dạng `zalo-media:YYYY-MM-DD/...`. Gom ngày và product_group có 20 cụm từ 2 clip trở lên.

## Nguyên tắc (người review chốt)

1. Ngày Zalo và nhóm chỉ là ỨNG VIÊN cụm, chưa chứng minh cùng buổi quay. Phải đối chiếu thiết bị, người, khoang tàu, hoạt động. Chưa chắc thì nhãn "co_the" (có thể cùng buổi).
2. Không chỉ cộng điểm với cảnh trước (trôi dần). Chọn MỘT cụm chính cho cả video, cảnh ưu tiên trong cụm, lấy ngoài cụm chỉ khi có lý do ghi rõ. Chống lặp chạy SAU điều kiện phù hợp, không được đá clip trong cụm để lấy clip ngoài cụm.
3. CHƯA mô tả lại cả kho. Chỉ làm thử 3 cụm. Sửa cách mô tả nếu lệch rồi mới chạy cả kho (việc sau).
4. Đoạn hình quyết định thời lượng dùng được. Không lặp đoạn 3 giây để phủ lời 10 giây. Thiếu hình thì ghép thêm đoạn khác cùng việc (cùng clip hoặc cùng cụm), vẫn thiếu thì báo thiếu tư liệu (log và cờ), không lặp.
5. KHÔNG đổi cách viết lời (prompt trong `script.mjs` giữ nguyên). Chỉ đổi chọn hình và cắt đoạn.

## Thi công

### A1. Lược đồ

Migration `supabase/migrations/20261009120000_brand_assets_segments_cluster.sql`: `brand_assets.segments jsonb` và `brand_assets.shoot_cluster jsonb`, null mặc định, không đụng dữ liệu cũ. Đã áp lên DB thật (project lluuoygdlaadtjsbnxbk) qua pooler IPv4 `aws-0-ap-northeast-1`, vì `db-apply.mjs` lỗi IPv6 từ máy này. Đã kiểm `information_schema`: cả hai cột jsonb, nullable.

- `segments`: mảng `{ start, end, action, people, equipment, setting, vertical_ok, note }`, giây số thực.
- `shoot_cluster`: `{ id, confidence: 'chac' hoặc 'co_the', basis, checked_at }`, id dạng `<ngày>|<nhóm>|<số>`.

### A2. Script mô tả đoạn

`packages/marketing/src/video/segment-clips.mjs` (npm run video:doan-clip).

- `--cluster <ngày> "<nhóm>"` hoặc `--ids id1,id2`, `--dry-run`, `--redo`.
- Tải clip (dùng lại `downloadAsset` của `ffmpeg.mjs`, hiểu cả `gdrive:` lẫn Supabase Storage), đo độ dài bằng ffprobe, nén tạm nếu quá 14,5MB, gửi Gemini xem video, nhận JSON đoạn. Chuẩn hóa bằng `normalizeSegments` (kẹp trong độ dài clip, bỏ đoạn dưới 2 giây, tách đoạn trên 12 giây, cắt chồng lấn, bỏ đoạn không ghi hành động).
- Sau khi có đoạn cả cụm: gọi Gemini một lần để xét clip nào cùng buổi quay. Chỉ cho "chac" khi có ít nhất 2 chi tiết định danh riêng khớp. Chi tiết chung của mọi lần lắp đặt (máy inox, ống nhựa trong suốt, khoang chật) chỉ đủ cho "co_the". Clip lạc cụm thì `shoot_cluster = null`.
- Hàm thuần `segments.mjs` (parseTime, normalizeSegments, planSceneSegments, estimateSpeechSec, segmentsEnabled).

### A3. Chọn hình theo cụm (`scene-match.mjs`, `script.mjs`)

- `pickPrimaryCluster(scenes, assets, ...)`: cụm có ít nhất 2 clip, một cảnh được "phủ" khi trong cụm có đoạn đủ liên quan và clip thuộc nhóm được phép cho vai cảnh đó (problemPool). Cảnh mang clip bắt buộc tính là phủ nếu clip đó nằm trong cụm. Không cụm nào phủ từ 2 cảnh thì trả null, đường cũ chạy nguyên. Hòa thì cụm chứa clip bắt buộc, rồi cụm chắc, rồi tổng điểm.
- `pickInCluster`: chọn đoạn tốt nhất trong cụm cho cảnh. Chống lặp, recentUse chỉ phạt điểm để xếp thứ tự trong cụm. Đoạn đã dùng ở cảnh khác bị loại hẳn.
- `matchScenesToAssets` nhận `cluster` và `useSegments`. Pick trong cụm có `by: 'cluster'` và `segment`. Hết đoạn hợp trong cụm thì rơi về đường cũ và ghi `why` bắt đầu bằng "ngoài cụm ...".
- `refinePicksByImagery` nhận `cluster`: lời lệch đoạn thì thử đoạn khác TRONG cụm, hết thì cắt câu lệch như cũ, không đổi sang ngoài cụm.
- `allocateSceneSegments` chạy sau khi danh sách cảnh đã chốt (sau ghim cảnh 1, tách cảnh giá, tách cảnh dài): đoạn chính, rồi đoạn nối thêm cùng clip theo thứ tự thời gian, rồi đoạn đủ liên quan của clip khác cùng cụm. Mỗi đoạn chỉ dùng một lần trong cả video. Ước lượng thiếu hình ghi vào `segmentShortSec`.
- Clip không có `segments`: hành vi cũ y nguyên. Công tắc `VIDEO_SEGMENTS=off` bỏ hẳn đường mới (mặc định on, chỉ tác dụng với clip có đoạn).
- `rules.mjs splitLongImageScenes` không tách cảnh đã có đoạn riêng.

### A4. Cắt đoạn khi dựng

- `build-video.mjs buildFormat`: sau khi biết độ dài tiếng thật, `planSceneSegments` cho danh sách đoạn cần cắt. Thiếu hình thì `holdSec` và cờ `brief.video_segment_short` kèm `console.warn "thiếu tư liệu cảnh N: thiếu X giây"`.
- `assemble.mjs buildPiecesFilter`: mỗi đoạn một input `-ss start -t dur`, chuẩn hóa khung, nối bằng concat, thiếu hình thì `tpad stop_mode=clone` giữ khung cuối. Không có `stream_loop` cho cảnh có đoạn. Cảnh không có đoạn dùng đường cũ.
- Giữ khung cuối: kế hoạch ghi "tối đa 1,5 giây", nhưng âm thanh cố định theo lời nên hình phải phủ đủ. Thi công giữ khung cuối cho TOÀN BỘ phần thiếu, không lặp, và cảnh báo to khi thiếu quá 1,5 giây.

### A5. So sánh cùng một lời

- `build-video.mjs` ghi `<out>/<id8>_script.json` mỗi lần dựng (lời cuối từng cảnh, hình, đoạn, cụm).
- `--reuse-script <file>`: đọc lại lời, bỏ vòng gọi model viết lời, bỏ soát nghĩa viết lại lời, bỏ cắt câu theo hình. Chỉ chọn hình và cắt đoạn chạy lại.
- `--assembly old|new`: old ép `VIDEO_SEGMENTS=off`, new ép bật.
- `--script-only` (hay `--dry-run`): dừng sau khi chọn hình và đoạn, không TTS, không dựng, không đẩy hàng đợi.

## Kiểm thử

- `npm run test:cluster`: 55 kiểm tra mới (pickPrimaryCluster, chọn trong cụm, chống lặp không đá ra ngoài cụm, trôi dần, nối đoạn khi lời dài, thiếu hình không lặp, chuẩn hóa đoạn, bộ lọc ffmpeg, xét cụm).
- `test:video`, `test:scene`, `test:price`, `test:clipguard` đạt như trước.
- Bộ lọc cắt đoạn đã chạy thật bằng ffmpeg trên clip kho (3 đoạn từ 2 clip + giữ khung 2,2 giây ra đúng 16,2 giây).
- `--script-only` chạy thật trên bài content 22452d7f và bài bán SD12-300 66b894f8, rồi `--reuse-script --assembly old` trên 22452d7f.

## Việc sau (không làm trong đợt này)

- Mô tả đoạn cho cả kho khi cách mô tả đã chốt.
- Ứng viên cụm hiện gom theo ngày và nhóm, nên một buổi quay trải qua nhiều nhóm sản phẩm (ví dụ SD12-300 và Content cùng ngày 19/9, cùng người thợ áo xám, cùng vách xanh) bị tách đôi. Cân nhắc gom ứng viên theo ngày, không theo nhóm.
- Video bán hàng cần hình nỗi đau từ kho Content và hình giải pháp từ folder sản phẩm, nên một cụm theo nhóm không phủ được cả hai. Gom ứng viên theo ngày sẽ giải quyết.
