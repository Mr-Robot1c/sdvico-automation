# Runbook: bật giọng đọc Adam (ElevenLabs) cho video

> Load khi: muốn video dùng giọng Adam theo trend TikTok, hoặc giọng ElevenLabs không kêu, hoặc muốn đổi giọng khác.
> Trạng thái: code đã sẵn trong `packages/marketing/src/video/build-video.mjs` (21/8). Chỉ chờ secret.

## Vì sao ElevenLabs mà không phải tts.vclip.io

User chỉ video trend dùng tts.vclip.io. Đã tra kỹ (21/8): vClip KHÔNG có API công khai (không docs, không trang API key; backend khóa sau đăng nhập Firebase + reCAPTCHA Enterprise nên không tự động hóa sạch được, lách qua là phạm điều "gặp rào chắn thì dừng"). Quan trọng hơn: giọng "Adam" trên vClip chính là voice **Adam của ElevenLabs** được bọc lại (nhiều nguồn Việt xác nhận, vd anonyviet.com, viettablet.com). Tích hợp thẳng ElevenLabs = lấy đúng giọng đó, hợp lệ, có API chính thức. Nếu nghe thử thấy lệch tông so với video trend thì đổi `ELEVENLABS_VOICE_ID` (Adam có vài biến thể id, xem mục Đổi giọng bên dưới).

## Cách hoạt động

- Có secret `ELEVENLABS_API_KEY` trong GitHub Actions thì mọi lời thoại video (cả bản ngang lẫn bản dọc) đọc bằng ElevenLabs, giọng mặc định **Adam** (voice id `pNInz6obpgDQGcFmaJgB`), model `eleven_multilingual_v2` (đọc được tiếng Việt).
- Chưa có secret, hoặc ElevenLabs lỗi/hết quota giữa chừng: pipeline tự lùi về edge-tts (giọng NamMinh) như cũ, video không bao giờ kẹt.

## Việc người làm (5 phút)

1. Tạo tài khoản tại elevenlabs.io, vào mục API Keys, tạo một key.
2. Vào repo `Mr-Robot1c/sdvico-automation` trên GitHub: Settings, rồi Secrets and variables, rồi Actions.
3. Bấm New repository secret: tên `ELEVENLABS_API_KEY`, dán key vào.
4. Xong. Video kế tiếp (cron 10 phút hoặc bấm nút) tự dùng giọng mới.

## Đổi giọng khác (không bắt buộc)

Nếu giọng trong video trend không phải Adam mặc định: vào tab Variables (cạnh Secrets), thêm variable `ELEVENLABS_VOICE_ID` với id giọng muốn dùng (lấy ở mục Voices của ElevenLabs, hoặc voice tự clone). Xóa variable thì quay về Adam.

## Chi phí cần biết trước

- Gói Free: 10.000 credit mỗi tháng, tương đương khoảng 10.000 ký tự.
- Mỗi bài video của mình đọc khoảng 1.500 tới 2.000 ký tự (2 định dạng), lịch 2 bài mỗi ngày thì khoảng 3-4 ngày là hết gói Free.
- Gói Starter 5 đô la Mỹ mỗi tháng được 30.000 credit, đủ khoảng nửa tháng; gói Creator 22 đô la được 100.000 credit, dư cho cả tháng.
- Hết quota giữa tháng thì video tự quay về giọng edge-tts, không mất bài nào.
