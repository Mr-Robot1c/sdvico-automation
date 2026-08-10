# packages/hr

Phần Tuyển dụng. Phụ trách theo kế hoạch: Bạn A.

Việc theo ngày:
- Ngày 2: lệnh hr-jd và đường nạp CV từ hộp thư.
- Ngày 3: skill cv-screening, chấm theo thang điểm cố định của vị trí.
- Ngày 5: sinh bộ câu hỏi phỏng vấn theo từng ứng viên, đề xuất khung giờ, sinh thư mời chờ duyệt.

Nhắc lại điều cấm 2: máy xếp hạng, người quyết. Không tự động loại ứng viên.

## Cấu trúc

```
src/
  index.js              gom các hàm dùng lại
  jd/
    channels.js         bốn kênh và độ dài cho lệnh /hr-jd
    save-jd.mjs         lưu jd_versions vào hr_jobs (bước cuối lệnh /hr-jd)
  intake/
    run.mjs             tác vụ nạp CV, chạy 30 phút một lần
    mailbox.js          đọc hộp thư qua IMAP (chỉ đọc)
    extract.js          trích PDF, DOCX, OCR ảnh
    normalize.js        chuẩn hóa văn bản thô thành JSON, rút email và số điện thoại
    candidates.js       khử trùng lặp, ghi hr_candidates và hr_applications
    storage.js          tải CV lên Supabase Storage
```

## Lệnh /hr-jd

Sinh mô tả công việc bốn phiên bản cho bốn kênh (website, trang tuyển dụng, Facebook, Zalo hoặc SMS), lưu vào `hr_jobs.jd_versions`. Đặc tả kênh ở `src/jd/channels.js`. Xem `.claude/commands/hr-jd.md`.

## Đường nạp CV

Luồng: đọc thư chưa đọc, trích PDF và DOCX, OCR cho CV ảnh, chuẩn hóa JSON, khử trùng theo email và số điện thoại, lưu tệp lên Storage, ghi `hr_candidates` và `hr_applications`, ghi `run_log`, đánh dấu thư đã đọc.

Chạy thử một tệp cục bộ (không cần hộp thư, không ghi gì):

```bash
node packages/hr/src/intake/run.mjs --dry-run --file duong/dan/cv.pdf
```

Chạy thật:

```bash
node packages/hr/src/intake/run.mjs
```

### Hộp thư và điều cấm 6

- Cấu hình hộp thư đọc từ biến môi trường `MAIL_IMAP_*`, không hardcode.
- Giai đoạn test dùng hộp thư riêng theo Mức T2 của kế hoạch, không phải `tuyendung@sdvico.vn`.
- Với Gmail phải dùng App Password, không phải mật khẩu tài khoản, và bật xác thực hai bước trước.
- **Cảnh báo:** hộp thư cá nhân chỉ dùng để chạy thử với CV giả. Trước khi CV thật của ứng viên chảy vào, phải đổi sang hộp thư do công ty kiểm soát, nếu không sẽ vi phạm điều cấm 6 (không đưa dữ liệu ứng viên ra khỏi hạ tầng công ty).

### Khử trùng lặp

Ứng viên coi là trùng khi khớp email HOẶC số điện thoại với bản ghi đã có. Khi trùng thì cập nhật bản ghi cũ, không tạo mới. `dedup_key` ưu tiên email, không có thì dùng số điện thoại đã chuẩn hóa về dạng 0xxxxxxxxx.

### Consent và thời hạn lưu

Ghi `consent_at` lúc nhận CV (ứng viên chủ động gửi hồ sơ) và `retention_until` theo `HR_RETENTION_MONTHS` (mặc định 12 tháng), theo Nghị định 13/2023. Thời hạn cụ thể cần Phòng Nhân sự xác nhận.

## Phụ thuộc

`imapflow`, `mailparser` (đọc thư), `pdf-parse` (PDF), `mammoth` (DOCX), `tesseract.js` (OCR tiếng Việt). Chạy `npm install` ở gốc repo. Lần OCR đầu, `tesseract.js` tải dữ liệu ngôn ngữ `vie`, cần mạng.
