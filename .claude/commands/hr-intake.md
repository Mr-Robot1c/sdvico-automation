---
description: Nạp CV từ hộp thư, trích PDF/DOCX, OCR ảnh, chuẩn hóa JSON, khử trùng, lưu Storage
argument-hint: [--dry-run] [--file <đường dẫn CV cục bộ>]
---

# Lệnh /hr-intake

Nạp CV từ hộp thư nhận hồ sơ, trích văn bản, chuẩn hóa thành JSON, khử trùng lặp theo email và số điện thoại, lưu tệp lên Supabase Storage và ghi bản ghi ứng viên.

Đây là bản đóng gói của tác vụ theo lịch `packages/hr/src/intake/run.mjs`, cũng chạy tự động 30 phút một lần qua `.github/workflows/hr-intake.yml`.

## Điều cấm liên quan

- Điều cấm 1: chỉ đọc thư, không tự trả lời ứng viên. Thư mời hay thư từ chối đi qua hàng đợi duyệt ở ngày sau.
- Điều cấm 2: chỉ ghi và xếp hồ sơ vào luồng, không tự loại ai.
- Điều cấm 6: hộp thư giai đoạn test là hộp thư riêng theo Mức T2, tệp và dữ liệu nằm trong Supabase công ty. Trước khi CV thật chảy vào phải đổi sang hộp thư do công ty kiểm soát.
- Điều cấm 7: mọi khóa và mật khẩu ở `.env` hoặc GitHub Secrets, không hardcode.

## Chuẩn bị (một lần)

1. Cài phụ thuộc: `npm install` ở gốc repo.
2. Điền `.env` các biến `MAIL_IMAP_HOST`, `MAIL_IMAP_USER`, `MAIL_IMAP_PASSWORD` (Gmail cần App Password), và `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Đã áp migration Supabase (xem `supabase/README.md`).

## Cách chạy

Diễn tập một tệp CV cục bộ, không cần hộp thư, không ghi gì, chỉ in JSON chuẩn hóa:

```bash
node packages/hr/src/intake/run.mjs --dry-run --file duong/dan/cv.pdf
```

Diễn tập trên hộp thư, đọc thư gần đây nhưng không ghi và không đánh dấu đã xử lý:

```bash
node packages/hr/src/intake/run.mjs --dry-run
```

Chạy thật, nạp và ghi ứng viên:

```bash
node packages/hr/src/intake/run.mjs
```

## Sau khi chạy

- Kiểm bảng `hr_candidates` và `hr_applications` trên Supabase.
- Kiểm bucket `cv` trên Storage.
- Kiểm `run_log` có bản ghi `hr-intake`.
- Ứng viên trùng email hoặc số điện thoại được gộp vào bản ghi cũ, không tạo mới.
