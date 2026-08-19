---
description: Soạn bài tương tác hâm nóng trang tuyển dụng SDVICO, đẩy vào hàng đợi duyệt
argument-hint: [--count N] [--theme doi_song|nganh_bien|hoi_dap] [--dry-run]
---

# Lệnh /hr-engage

Soạn bài **tương tác** (không phải tin tuyển dụng) để hâm nóng trang trước khi đăng tin tuyển. Máy soạn nháp từ kho góc bài, đẩy vào `approval_queue`, **người bấm Duyệt** rồi worker `publish-facebook.mjs` mới đăng (điều cấm 1).

Bám `docs/bai-tuong-tac-mau.md` cho cách dùng, và `docs/app-map/tuyen-dung.md` mục 3 cho ràng buộc.

## Đầu vào

Truyền qua `$ARGUMENTS`, tất cả tùy chọn:

- `--count N` số bài cần soạn trong một lượt (mặc định 3, xoay vòng ba chủ đề).
- `--theme <ds>` lọc chủ đề, cách nhau bằng dấu phẩy: `doi_song`, `nganh_bien`, `hoi_dap`.
- `--dry-run` chỉ in bài ra, không ghi DB.

## Ba chủ đề trong kho

- `doi_song` — đời sống công ty, chuyện nghề ở SDVICO.
- `nganh_bien` — mẹo thực tế cho ngư dân, chủ tàu.
- `hoi_dap` — câu hỏi mở, bình chọn, kéo bình luận (tương tác mạnh nhất).

Chi tiết góc bài xem `packages/hr/src/post/engagement-topics.js`.

## Điều cấm liên quan

- **Điều cấm 1:** không có đường tự đăng. Bài luôn dừng ở `approval_queue`, người bấm Duyệt, worker mới đăng.
- **Điều cấm 3:** kho tránh hẳn chủ đề quy định nhà nước, IUU, Cục Thủy sản. Cần đụng mấy chủ đề đó thì đi qua luồng duyệt cấp quản lý của Marketing, không dùng lệnh này.
- **Điều cấm 4:** không mô tả phần mềm của hãng (Viettel, Thuraya, VNPT, Vishipel) như năng lực SDVICO. Máy lọc nước và thiết bị xử lý dầu là hàng SDVICO tự làm; định vị, bộ đàm, dầu nhớt là hàng SDVICO phân phối, lắp đặt.
- **Điều cấm 5:** không bịa số liệu, giải thưởng, đối tác.

## Cách chạy

Chạy thử ba bài xoay vòng, chỉ in ra console:

```bash
node packages/hr/src/post/queue-engagement.mjs --dry-run
```

Chạy thật, soạn ba bài và đẩy hàng đợi duyệt:

```bash
node packages/hr/src/post/queue-engagement.mjs
```

Chỉ một bài chủ đề hỏi đáp (tương tác mạnh nhất):

```bash
node packages/hr/src/post/queue-engagement.mjs --count 1 --theme hoi_dap
```

Hai bài, chọn hai chủ đề:

```bash
node packages/hr/src/post/queue-engagement.mjs --count 2 --theme hoi_dap,nganh_bien
```

## Chuẩn bị (một lần)

- Áp migration `supabase/migrations/20260819600000_hr_job_posts_loai.sql` (thêm cột `loai` và `chu_de` cho `hr_job_posts`). Chạy trong Supabase SQL editor.
- Có `GROQ_API_KEY` để mô hình viết mới. Thiếu khóa vẫn chạy được, tự lùi về bản có sẵn trong kho.
- Đã cấu hình worker `publish-facebook.mjs` (token Facebook Page). Bài đã duyệt sẽ đăng theo trần `HR_FB_MAX_PER_DAY` (mặc định 3 bài mỗi ngày, dùng chung với tin tuyển dụng).

## Sau khi chạy

- Vào giao diện duyệt, thấy mục có tiền tố `[Tương tác]` trong hàng đợi.
- Đọc, nếu ưng thì bấm Duyệt. Worker `publish-facebook.mjs` chạy 15 phút một lần sẽ đăng.
- Ảnh minh họa: bài tương tác mặc định đăng dạng text-only. Muốn kèm ảnh thật của công ty thì trong giao diện duyệt chỉnh trước khi bấm Duyệt (đặt `image_url`), hoặc bỏ qua để bài chạy dạng text.
- Nhật ký lượt chạy ghi ở `run_log` với `task='hr.queue_engagement'`.

## Nhịp đăng gợi ý

Bám `docs/bai-tuong-tac-mau.md`: rải 3 tới 5 ngày trước tin tuyển dụng chính, **mỗi ngày một bài**, khung giờ trưa hoặc tối. Bài dạng câu hỏi (`hoi_dap`) đăng sớm để kéo tương tác.

Lịch tự động: workflow `.github/workflows/hr-engage.yml` chạy hằng ngày, mặc định soạn 1 bài xoay vòng. Bật khi muốn chạy nền song song với tin tuyển dụng.
