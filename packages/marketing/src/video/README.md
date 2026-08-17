# Dây chuyền video (Ngày 5) — chạy máy nội bộ

Sinh video marketing từ một bài đã đăng: kịch bản, lồng tiếng máy, phụ đề, ghép hình,
xuất bản dọc 9:16 và ngang 16:9. Chạy trên máy nội bộ (ffmpeg + Whisper), KHÔNG chạy serverless.

## Nguyên tắc
- Máy soạn, người bấm gửi (điều cấm 1): đầu ra chỉ để người duyệt rồi mới đăng, không tự đăng.
- Chỉ dùng tư liệu trong `brand_assets` (owned/licensed) (điều cấm 5). Không nhạc/nguồn ngoài chưa có phép.
- Không bịa model/thông số, không nhận vơ phần mềm đối tác (điều cấm 4, 5): kịch bản qua hàng rào
  `compliance.assessDraft`. Chạm quy định nhà nước (risk=red) thì đánh dấu cần cấp quản lý duyệt (điều cấm 3).
- Phụ đề lấy từ KỊCH BẢN (chính xác), không dùng bản chép ASR. Whisper chỉ tạo artifact SRT
  (ghi nhận + phục vụ đường lồng tiếng người), có từ điển thuật ngữ ngành (`terms.mjs`).

## Phụ thuộc
- Node: `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe` (binary đóng gói sẵn), `@google/genai`, `@supabase/supabase-js`.
- Python: `edge-tts` (TTS giọng Việt), `faster-whisper` (canh phụ đề). GPU nếu đủ CUDA 12 runtime,
  không thì tự rớt CPU (đủ dùng cho batch nội bộ).
- Env thật (không commit): lấy từ `.env` checkout chính qua `env.mjs` (`SUPABASE_URL` cloud, `SERVICE_ROLE_KEY`, `GEMINI_API_KEY`).

## Chạy
```
node packages/marketing/src/video/build-video.mjs [contentId] [--voice vi-VN-NamMinhNeural] [--whisper-model small] [--out DIR] [--no-queue]
```
Không truyền `contentId` thì lấy bài `mkt_content` mới nhất có `draft`.
Đầu ra ở `out/video/`: `*_vertical.mp4`, `*_horizontal.mp4`, `*_thumb{1..3}.jpg`, `*_summary.json`.

Mặc định còn ĐẨY vào Hàng đợi duyệt: upload CẢ HAI bản (ngang 16:9 + dọc 9:16) + `brand_assets` + `mkt_content` (review) + `approval_queue` (pending, kênh Facebook + TikTok). Người bấm Duyệt mới đăng (điều cấm 1). Lúc đăng: **Facebook lấy bản ngang 16:9, TikTok lấy bản dọc 9:16** (`brief.assets.video_h` / `video_v`). Thêm `--no-queue` nếu chỉ muốn tạo file.

Số tổng đài/điện thoại được đọc TỪNG chữ số trong lời thoại (1900 23 23 49 = "một chín không không, hai ba, hai ba, bốn chín"), phụ đề vẫn hiện số gốc. Một cảnh TTS lỗi sẽ dùng tiếng lặng dự phòng, không kéo sập cả dây chuyền.

### Chạy hàng loạt (tự động cho nhiều bài)
```
node packages/marketing/src/video/build-video-all.mjs [--limit N] [--requested] [--watch] [--interval 60] [--no-queue]
```
Dựng video cho các bài `mkt_content` có `draft` mà chưa có video (bỏ qua bài đã dựng). Mỗi bài chạy một tiến trình riêng nên bài lỗi không kéo sập cả mẻ. Cờ:
- `--limit N`: chỉ làm N bài (chạy theo mẻ, tránh 13 tiếng liền).
- `--requested`: CHỈ làm bài đã bấm nút **"🎬 Làm video"** ở trang **Nội dung** (web đặt cờ `brief.video_requested`; dựng xong tự xóa cờ).
- `--watch [--interval 60]`: chạy liên tục, cứ 60 giây quét bài mới rồi dựng. Ctrl+C để dừng.

**"Bấm nút trên web là tự làm video":** hai cách:

**(A) GitHub Actions (khuyến nghị, không cần bật máy)** — workflow `.github/workflows/video-build.yml`
quét bài đã yêu cầu (cron */10 phút) hoặc chạy ngay khi backend Vercel POST `/api/trigger-video-build`
(khi bấm nút 🎬). Chạy trên cloud GitHub, miễn phí ~250 video/tháng. Cần:
- Secrets repo GitHub: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `MKT_MODEL` (đã có).
- Vercel env: `GITHUB_REPO` = `Mr-Robot1c/sdvico-automation` + `GITHUB_TOKEN` = PAT có quyền `workflow`.
- Thiếu `GITHUB_TOKEN` thì cron 10 phút vẫn quét (chỉ hơi trễ).

**(B) Máy nội bộ** — cài `scripts/cai-tu-dong-video.bat` 1 lần (đăng ký Task Scheduler), watcher
tự chạy khi đăng nhập Windows. File `video-watch.bat` để chạy tay, `go-tu-dong-video.bat` để gỡ.
Nhanh hơn GitHub Actions (~5 phút vs ~8 phút) nhưng phải bật máy.

Cả hai đều dùng cùng batch runner `build-video-all.mjs --requested`. Vẫn phải người bấm Duyệt mới đăng (điều cấm 1).

## Thành phần
| File | Việc |
|---|---|
| build-video.mjs | Điều phối toàn bộ dây chuyền |
| script.mjs | Gemini sinh kịch bản nhiều cảnh + chọn tư liệu, quét compliance |
| tts.py | edge-tts đọc lời thoại thành mp3 |
| subtitle.py | faster-whisper canh phụ đề ra SRT (artifact) |
| srt.mjs | Chia lời thoại thành block phụ đề, timing theo tỉ lệ ký tự |
| assemble.mjs | ffmpeg: chuẩn hóa từng cảnh, nối, burn phụ đề, phủ nhận diện |
| ffmpeg.mjs | Helper chạy ffmpeg/ffprobe, tải asset từ Storage |
| fonts.mjs | Trích Be Vietnam Pro ra .ttf cho libass |
| terms.mjs | Từ điển thuật ngữ ngành cho Whisper |
| env.mjs | Nạp .env thật (bỏ qua .env.local giả) |

## Đã nối Hàng đợi duyệt
- Cả hai bản (ngang 16:9 + dọc 9:16) tự đẩy lên Storage + `brand_assets` (kind=video) +
  `mkt_content` (review) + `approval_queue` (pending, kênh Facebook + TikTok). Người bấm Duyệt thì
  tái dùng luồng đăng sẵn có: **FB đăng bản ngang, TikTok đăng bản dọc**.
- TikTok đang chế độ private (chưa audit) nên chỉ tài khoản thấy; qua audit là công khai được.

## Còn lại (tùy chọn)
- Đẩy bản ngang lên YouTube khi có luồng YouTube.
