# Tuyển dụng: workflow và app map

> Đọc khi làm phần Tuyển dụng. Phụ trách Bạn A. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.

## 1. Workflow tuyển dụng, từ đầu tới cuối

```
Vị trí cần tuyển
  1. Sinh mô tả công việc, lệnh hr-jd
  2. Đăng tin, bán tự động qua Playwright, dừng trước nút gửi
Ứng viên nộp hồ sơ
  3. Nạp CV từ hộp thư, lệnh hr-intake, chạy đầu mỗi giờ
  4. Chấm CV, skill cv-screening
  5. Xếp hạng, con người quyết, không tự động loại
  6. Sinh câu hỏi phỏng vấn và thư mời, đưa vào hàng đợi duyệt
  7. Người bấm gửi thư mời
```

Diễn giải từng bước:

1. Sinh mô tả công việc. Lệnh `hr-jd` sinh bốn phiên bản độ dài cho bốn kênh khác nhau. Lưu vào `hr_jobs.jd_versions`. Thời gian soạn một mô tả dưới 20 phút.

2. Đăng tin. Dùng browser runner. Trước hết chạy trên bản sao trang cục bộ, mức T0. Sau đó lên trang thật ở chế độ diễn tập, dừng trước nút gửi cuối cùng, chụp màn hình để người xem. Có API chính thức thì ưu tiên API.

3. Nạp CV. Lệnh `hr-intake` đọc hộp thư tuyển dụng, ở giai đoạn thử nghiệm là hộp thư test riêng. Trích PDF và DOCX, OCR cho CV ảnh, chuẩn hóa thành JSON. Khử trùng lặp theo email và số điện thoại, ghi ở `hr_candidates.dedup_key`. Lưu file vào Storage và ghi bản ghi vào `hr_candidates`. Ghi consent và thời hạn lưu vào `consent_at` và `retention_until`.

4. Chấm CV. Skill `cv-screening` dùng thang điểm cố định theo từng vị trí, không để mô hình tự nghĩ tiêu chí. Bỏ tên, giới tính, tuổi, ảnh, quê quán khỏi dữ liệu đưa vào chấm. Đầu ra gồm điểm từng trục, ba câu tóm tắt, ba điểm mạnh, ba điểm cần làm rõ khi phỏng vấn. Lưu vào `hr_applications`.

5. Xếp hạng và quyết. Máy sắp thứ tự theo điểm, người quyết ai đi tiếp. Không có nhánh nào tự động loại ứng viên. Điều cấm 2.

6. Phỏng vấn. Sinh bộ câu hỏi riêng theo từng ứng viên, tám câu kỹ thuật bám dự án ứng viên đã ghi, bốn câu hành vi, một bài về nhà ba giờ kèm barem. Đề xuất ba khung giờ. Sinh thư mời và đẩy vào `approval_queue`, trạng thái pending.

7. Gửi thư. Người vận hành mở giao diện duyệt, xem thư, bấm gửi. Không có tự động gửi. Điều cấm 1.

## 2. App map tuyển dụng

### Bảng dữ liệu

| Bảng | Vai trò | Ghi chú |
|---|---|---|
| hr_jobs | Vị trí và bốn phiên bản JD | |
| hr_candidates | Ứng viên và CV đã chuẩn hóa | Dữ liệu cá nhân, bật RLS |
| hr_applications | Hồ sơ ứng tuyển và kết quả chấm | Dữ liệu cá nhân qua liên kết, bật RLS |
| approval_queue | Thư mời chờ duyệt | Cổng của điều cấm 1 |
| run_log | Nhật ký nạp CV và thao tác đăng tin | Kèm ảnh chụp khi lỗi |

### Lệnh và skill

| Tên | Loại | Việc |
|---|---|---|
| hr-jd | Slash command | Sinh JD bốn phiên bản |
| hr-intake | Slash command | Nạp CV, trích, OCR, chuẩn hóa, khử trùng |
| cv-screening | Skill | Chấm CV theo thang điểm cố định, ẩn danh trường nhạy cảm |

### Auto và người

| Việc | Máy làm | Người làm |
|---|---|---|
| Nạp và chuẩn hóa CV | Có | |
| Chấm và xếp hạng | Có | |
| Quyết ai đi tiếp | | Có |
| Soạn thư mời | Có | |
| Gửi thư mời | | Có, bấm trong giao diện duyệt |
| Đăng tin lên Facebook | Soạn bài, sinh poster, đăng qua Graph API sau khi đã duyệt | Có, bấm Duyệt trước khi bài được đăng |

### Cổng an toàn của mảng

1. Ẩn danh trường nhạy cảm trước khi chấm, chống thiên vị.
2. Thang điểm cố định theo vị trí, không để mô hình tự nghĩ tiêu chí.
3. Bật RLS cho `hr_candidates` và `hr_applications`, dữ liệu nằm trong hạ tầng công ty. Điều cấm 6.
4. Consent theo Nghị định 13/2023 trước khi dùng CV thật.
5. Thư mời qua hàng đợi duyệt, người bấm gửi. Điều cấm 1 và 2.

### Lịch chạy

- `hr.yml` chạy đầu mỗi giờ bằng GitHub Actions, làm ba việc nối nhau trong một lượt: nạp CV, chấm CV, soạn câu hỏi và thư mời. Chấm CV dùng Groq API miễn phí, cần `GROQ_API_KEY`.
- Ba endpoint trên Vercel (soạn bài, đăng Facebook đã duyệt, đăng LinkedIn đã duyệt) chạy 15 phút một lần bằng cron-job.org, xem [docs/cron-job-org.md](../cron-job-org.md). Workflow `cron.yml` giữ lại để chạy tay.

Chi tiết từng workflow và secrets ở [.github/workflows/README.md](../../.github/workflows/README.md).

### Trạng thái xây dựng

- Bước 1 sinh JD: xong. Có lệnh `/hr-jd` và trang Tạo JD trong giao diện, sinh bốn phiên bản bằng Groq.
- Bước 2 đăng tin: xong cho Facebook, đăng qua Graph API, có poster tự sinh (satori và sharp), hẹn giờ đăng, gỡ bài cũ khi vượt hạn mức. LinkedIn xong phần code, đang chờ token nên chưa bật.
- Bước 3 nạp CV: xong, chạy tự động, bước 1 của `hr.yml`.
- Bước 4 chấm CV: xong, skill `cv-screening` và `packages/hr/src/screen`, chạy tự động, bước 2 của `hr.yml`.
- Bước 5 xếp hạng và quyết: xong, trang Hồ sơ ứng viên.
- Bước 6 câu hỏi phỏng vấn và thư mời: xong. Có thêm trang công khai `/phong-van/[token]` để ứng viên tự chọn khung giờ.
- Bước 7 gửi thư: xong, gửi qua Gmail SMTP khi người vận hành bấm Duyệt. Không có đường tự gửi, điều cấm 1.

Còn thiếu, xếp theo mức cần kíp:

1. Đăng nhập nội bộ cho giao diện duyệt. Hiện chỉ có HTTP Basic Auth qua middleware, app đọc ghi dữ liệu ứng viên bằng khóa service role. Điều cấm 6.
2. Hộp thư nhận CV vẫn là hộp thư thử. Phải đổi sang hộp thư công ty trước khi có CV thật.
3. Ghi consent và `retention_until` theo Nghị định 13/2023. Cột đã có trong lược đồ, chưa có chỗ nào điền thật.
4. Trang báo cáo đọc từ `run_log` để đo bốn chỉ tiêu nghiệm thu bên dưới. Hiện chưa có số liệu.

### Chỉ tiêu nghiệm thu liên quan

- Trên 90 phần trăm CV được chấm tự động trong ngày nhận.
- Độ chính xác trích xuất trường bắt buộc tối thiểu 90 phần trăm.
- Thời gian soạn một mô tả công việc dưới 20 phút.
- Tin tuyển dụng đăng lên tài khoản thật một vị trí, có kiểm chứng bằng ảnh chụp.

## 3. Bài tương tác hâm nóng trang

Trước khi đăng tin tuyển dụng, nên hâm nóng trang bằng vài bài tương tác để trang có tương tác thật, thuật toán Facebook đẩy tin tuyển đi xa hơn. Bài tương tác không gắn với vị trí nào, dùng chung đường ống đăng với tin tuyển dụng.

### Cách hoạt động

- Máy soạn nháp bài tương tác từ kho góc bài, đẩy vào `approval_queue` với `kind='hr_job_post'`, người bấm Duyệt, worker `publish-facebook.mjs` mới đăng. Đúng điều cấm 1, không có đường tự đăng.
- Bài tương tác lưu trong `hr_job_posts` với `loai='tuong_tac'`, `job_id` để trống, `chu_de` ghi chủ đề. Tin tuyển dụng vẫn là `loai='tuyen_dung'` như cũ.
- Ba chủ đề trong kho: đời sống công ty (`doi_song`), ngành biển và thủy sản (`nganh_bien`), hỏi đáp và mẹo nghề (`hoi_dap`).

### Lệnh và file

| Tên | Loại | Việc |
|---|---|---|
| hr-engage | Slash command | Soạn bài tương tác, đẩy hàng đợi duyệt. Xem `.claude/commands/hr-engage.md` |
| engagement-topics.js | Kho góc bài | `packages/hr/src/post/engagement-topics.js`, chín góc bài rải ba chủ đề |
| compose-engagement.js | Module soạn | Groq khi có khóa, lùi về bản có sẵn; soát và làm sạch giọng văn |
| queue-engagement.mjs | Script | Sinh N bài, chèn `hr_job_posts`, đẩy `approval_queue` |

Chạy nhanh: `node packages/hr/src/post/queue-engagement.mjs` soạn ba bài rải đều ba chủ đề. Thêm `--dry-run` để chỉ in, không ghi.

Lịch tự động: workflow `.github/workflows/hr-engage.yml` chạy 14:30 giờ VN mỗi ngày, soạn 1 bài xoay vòng, đẩy hàng đợi duyệt. Chạy song song với `hr.yml` (tuyển dụng đầu mỗi giờ), dùng chung worker `publish-facebook.mjs` và trần `HR_FB_MAX_PER_DAY`.

### Ràng buộc và an toàn

- Kho góc bài tránh hẳn chủ đề quy định nhà nước và IUU (điều cấm 3). Nếu cần nội dung chạm mấy chủ đề đó thì đi qua luồng duyệt cấp quản lý của Marketing, không dùng lệnh này.
- Không mô tả phần mềm của hãng như năng lực SDVICO (điều cấm 4). Không bịa số liệu (điều cấm 5).
- Bài tương tác và tin tuyển dụng dùng chung trần số bài mỗi ngày trên Facebook (`HR_FB_MAX_PER_DAY`, mặc định 3). Đừng dồn nhiều bài một ngày.
- Cần áp migration `20260819600000_hr_job_posts_loai.sql` trước khi chạy lệnh (thêm cột `loai` và `chu_de`).

### Trạng thái xây dựng

- Kho góc bài, module soạn, script đẩy hàng đợi, lệnh `/hr-engage`, test: xong. Tái dùng worker đăng và giao diện duyệt sẵn có, không sửa worker.
- Còn tùy chọn: thêm nhãn hoặc bộ lọc riêng cho bài tương tác trong giao diện duyệt và trang Tin đăng (hiện dùng chung nhãn với tin tuyển dụng, phân biệt bằng tiền tố `[Tương tác]` ở tiêu đề duyệt và cột `loai`).

Cập nhật lần cuối: 19/8/2026.
