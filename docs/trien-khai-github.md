# Triển khai lên GitHub để chạy tự động trên đám mây

> Mục tiêu: đẩy repo lên GitHub và đặt Secrets, để workflow `hr.yml` tự chạy đầu mỗi giờ, gửi CV vào hộp thư là tự lên Supabase mà không cần bật máy.

Trạng thái hiện tại: remote đã trỏ sẵn `https://github.com/ggakasr/sdvico-automation.git`, nhánh `main`. `.env` đã bị Git bỏ qua nên khóa không lên GitHub (điều cấm 7).

## Bước 1. Đẩy code lên GitHub

```bash
git push -u origin main
```

Nếu bị từ chối vì trên GitHub đã có commit khác, kéo về rồi đẩy lại:

```bash
git pull --rebase origin main
git push -u origin main
```

Sau khi đẩy, mở repo trên GitHub và **đặt về Private**: Settings, mục General, Danger Zone, Change repository visibility, chọn Private. Repo chứa logic nghiệp vụ công ty, không để công khai.

Nếu GitHub hỏi bật Actions: vào tab **Actions**, bấm cho phép chạy workflow của repo.

## Bước 2. Đặt Secrets

Vào repo trên GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Thêm từng mục dưới đây. Lấy giá trị từ file `.env` trên máy bạn, chép sang, không dán vào chỗ nào khác.

| Tên secret | Giá trị lấy ở đâu | Bắt buộc |
|---|---|---|
| `SUPABASE_URL` | Supabase, Project Settings, API, Project URL | Có |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, Project Settings, API, khóa service_role | Có |
| `MAIL_IMAP_HOST` | `imap.gmail.com` | Có |
| `MAIL_IMAP_PORT` | `993` | Có |
| `MAIL_IMAP_USER` | `inoudead@gmail.com` | Có |
| `MAIL_IMAP_PASSWORD` | App Password 16 ký tự của Gmail | Có |
| `MAIL_INTAKE_ALLOWED_SENDERS` | `inoudead@gmail.com` | **Có, rất quan trọng** |
| `CV_BUCKET` | `cv` | Có |
| `HR_RETENTION_MONTHS` | `12` | Có |

Ghi chú:
- **`MAIL_INTAKE_ALLOWED_SENDERS` phải đặt.** Bỏ trống thì lượt chạy sẽ nạp mọi thư, gồm cả CV người thật lẫn trong hộp thư, vi phạm Nghị định 13 và điều cấm 6.
- `MAIL_IMAP_MAILBOX`, `MAIL_IMAP_TLS`, `CV_MIN_IMAGE_BYTES` có giá trị mặc định, không cần đặt.
- `ANTHROPIC_API_KEY` chưa cần cho nạp CV. Chỉ cần khi làm phần sinh nội dung sau này.

## Bước 3. Chạy thử và kiểm tra

Không cần đợi hết giờ, chạy tay một lượt để kiểm:

1. Tab **Actions**, chọn workflow **HR — Vòng chạy mỗi giờ**, bấm **Run workflow**, nhánh `main`.
2. Mở lượt chạy, xem log bước "1. Nạp CV từ hộp thư". Thấy `ghi_ung_vien` lớn hơn 0 là nạp được. Hai bước sau chấm CV và soạn thư mời chạy tiếp trong cùng lượt.
3. Kiểm Supabase: bảng `hr_candidates` có hồ sơ mới, bảng `run_log` có dòng `hr-intake`.
4. Mở giao diện duyệt, tab Hồ sơ ứng viên, thấy hồ sơ mới.

Sau đó lịch tự chạy đầu mỗi giờ. Gửi CV mới (từ chính `inoudead@gmail.com`) rồi đợi lượt kế là thấy trên Supabase.

## Lưu ý quan trọng

- **Gmail và địa chỉ mạng lạ.** GitHub Actions chạy từ máy chủ ở nước ngoài, địa chỉ mạng thay đổi. Gmail có thể cảnh báo đăng nhập lạ hoặc chặn. Dùng App Password thường vẫn vào được, nhưng nếu log báo lỗi đăng nhập, vào Google Account, mục Security, xem hoạt động gần đây và cho phép. Đây là một lý do nữa nên sớm đổi sang hộp thư công ty có chính sách truy cập rõ ràng.
- **Chỉ nhánh mặc định mới chạy theo lịch.** Giữ code ở `main`. Lịch cũng có thể trễ vài phút khi GitHub tải cao, và bị tạm dừng nếu repo không hoạt động 60 ngày.
- **Workflow `daily-demo` cũng sẽ chạy** và tự thêm mục demo vào hàng đợi duyệt. Không muốn thì xóa `.github/workflows/daily-demo.yml` hoặc bỏ phần `schedule` trong đó.
- **Bảo mật khóa.** Repo để Private. Không bao giờ commit `.env`. Nếu lỡ lộ App Password hay khóa service role, thu hồi và tạo lại ngay.

## Đổi sang chạy thật cho công ty (về sau)

- Đổi các secret `MAIL_IMAP_*` và `MAIL_INTAKE_ALLOWED_SENDERS` sang hộp thư `tuyendung@sdvico.vn` do công ty kiểm soát.
- Khi đó mới nạp CV thật, và phải có văn bản đồng ý theo Nghị định 13/2023.
