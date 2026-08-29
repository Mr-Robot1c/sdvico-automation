# Tuyển dụng: workflow và app map

> Đọc khi làm phần Tuyển dụng. Phụ trách Bạn A. Nền chung ở [README.md](README.md), điều cấm và giọng văn ở CLAUDE.md.
covers: packages/hr
last_verified: 2026-08-29
ttl_days: 180
<!-- re-verified: 2026-08-29 - Audit bao mat muc 10: intake/run.mjs chay THAT bat buoc MAIL_INTAKE_ALLOWED_SENDERS (hoac --from) — rong la throw dung ngay, het che do "nhan CV tu bat ky ai" (du lieu nguoi la + file la vao pdf-parse het bao tri). Dry-run duoc mien. Phan con lai cua workflow doi chieu van dung. -->

## 1. Workflow tuyển dụng, từ đầu tới cuối

```
Vị trí cần tuyển
  1. Sinh mô tả công việc, lệnh hr-jd
  2. Đăng tin, bán tự động qua Playwright, dừng trước nút gửi
Ứng viên nộp hồ sơ
  3. Nạp CV từ hộp thư, lệnh hr-intake, chạy 30 phút một lần
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
| Đăng tin lên sàn thật | Soạn và diễn tập | Có, bấm nút gửi cuối |

### Cổng an toàn của mảng

1. Ẩn danh trường nhạy cảm trước khi chấm, chống thiên vị.
2. Thang điểm cố định theo vị trí, không để mô hình tự nghĩ tiêu chí.
3. Bật RLS cho `hr_candidates` và `hr_applications`, dữ liệu nằm trong hạ tầng công ty. Điều cấm 6.
4. Consent theo Nghị định 13/2023 trước khi dùng CV thật.
5. Thư mời qua hàng đợi duyệt, người bấm gửi. Điều cấm 1 và 2.

### Lịch chạy

- `hr-intake` chạy 30 phút một lần (phút 0 và 30) bằng GitHub Actions schedule.
- `hr-screen` chấm CV chạy 30 phút một lần (phút 15 và 45), lệch sau đường nạp CV. Dùng Google Gemini API miễn phí, cần `GEMINI_API_KEY`.

### Trạng thái xây dựng

- Bước 1 sinh JD: có lệnh `/hr-jd`.
- Bước 3 nạp CV: có, chạy tự động (`hr-intake`).
- Bước 4 chấm CV: có, skill `cv-screening` và `packages/hr/src/screen`, chạy tự động (`hr-screen`).
- Bước 2 đăng tin, bước 6 câu hỏi phỏng vấn và thư mời: chưa làm.

### Chỉ tiêu nghiệm thu liên quan

- Trên 90 phần trăm CV được chấm tự động trong ngày nhận.
- Độ chính xác trích xuất trường bắt buộc tối thiểu 90 phần trăm.
- Thời gian soạn một mô tả công việc dưới 20 phút.
- Tin tuyển dụng đăng lên tài khoản thật một vị trí, có kiểm chứng bằng ảnh chụp.

Cập nhật lần cuối: 10/8/2026.
