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
node packages/marketing/src/video/build-video.mjs [contentId] [--voice vi-VN-NamMinhNeural] [--whisper-model small] [--out DIR]
```
Không truyền `contentId` thì lấy bài `mkt_content` mới nhất có `draft`.
Đầu ra ở `out/video/`: `*_vertical.mp4`, `*_horizontal.mp4`, `*_thumb{1..3}.jpg`, `*_summary.json`.

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

## Còn lại (chưa làm trong bản này)
- Đẩy đầu ra lên Storage + `brand_assets` + tạo mục `approval_queue` để người duyệt rồi đăng
  Facebook (chưa công khai) và TikTok private (tái dùng luồng đã có).
