# Runbook: Vercel báo hết dung lượng Functions Storage

> Load khi: Vercel gửi thư "Approaching your limits" hoặc "used 100% of Function Storage",
> hoặc deploy mới bị Vercel chặn vì team Hobby vượt hạn mức. Viết 8/9/2026 sau sự cố team a-644f.

## 1. Chuyện gì xảy ra (8/9/2026)

Vercel báo team Hobby `a-644f` dùng hết 10 GB Functions Storage.

Functions Storage là tổng dung lượng các gói function (lambda) của MỌI bản deploy còn được giữ,
tính theo GB-tháng. Ba yếu tố nhân với nhau: số bản deploy còn giữ, cỡ gói function mỗi bản,
thời gian giữ (Hobby mặc định 30 ngày).

Đo thực tế ngày 8/9:

| Chỉ số | Giá trị |
| --- | --- |
| Bản deploy project `sdvico-mktit` còn giữ | 320 (289 production, 31 preview) trong 18 ngày |
| Cỡ gói function mỗi bản | 37,8 MB |
| Tổng ước tính | khoảng 12 GB |

Nguyên nhân gói function nặng: `next.config.mjs` có `outputFileTracingIncludes` nhét binary
ffmpeg linux (`@ffmpeg-installer/linux-x64`, 68 MB, nén 23 MB) vào function để chuẩn hóa video
khi đăng TikTok qua API. Đường đăng TikTok qua API đã bỏ từ 26/8 (xuất tay), nên binary này là
hàng thừa. Nguyên nhân số bản deploy nhiều: mỗi lần push lên `main` là một bản production, có
ngày tới 32 bản.

## 2. Đã sửa trong code (commit 8/9)

- `apps/approval-ui/next.config.mjs`: bỏ `outputFileTracingIncludes`, thêm
  `outputFileTracingExcludes` loại `@ffmpeg-installer/**` khỏi mọi route.
- `apps/approval-ui/lib/video-normalize.ts`: không import tĩnh `@ffmpeg-installer` nữa, tìm
  binary theo thứ tự env `FFMPEG_PATH`, rồi gói cài ở máy local; không có thì ném lỗi và
  `lib/tiktok.ts` dùng file gốc như trước.
- `apps/approval-ui/package.json`: bỏ dependency `@ffmpeg-installer/ffmpeg` (dây chuyền video
  ở `packages/marketing` vẫn giữ, chạy trên GitHub Actions và máy local, không liên quan Vercel).

Kỳ vọng: gói function mỗi bản deploy giảm từ 37,8 MB xuống dưới 10 MB.

## 3. Việc người quản trị làm trên Vercel (không làm bằng code được)

### 3a. Xóa các bản deploy cũ để hạ dung lượng ngay

Máy đã đăng nhập Vercel CLI (tài khoản mr-robot1c). Lệnh sau xóa mọi bản deploy của project
KHÔNG đang gắn alias (bản production hiện hành và các alias được giữ nguyên):

```bash
vercel remove sdvico-mktit --safe --yes
```

Bản đã xóa còn khôi phục được 30 ngày trong Settings, Security, Recently Deleted.
Project cũ `sdvico-approval-ui` (17 bản, không dùng nữa từ 12/8) có thể xóa hẳn ở Settings.

### 3b. Rút thời gian giữ bản deploy

Vào https://vercel.com/a-644f/sdvico-mktit/settings/security, mục Deployment Retention Policy:

| Loại | Đặt |
| --- | --- |
| Canceled | 1 ngày |
| Errored | 1 ngày |
| Pre-Production (preview) | 1 ngày |
| Production | 7 ngày |

Vercel vẫn tự giữ 10 bản mới nhất, 20 bản production gần nhất và 20 bản preview gần nhất,
đủ để rollback. Hobby tối đa 30 ngày, không đặt dài hơn được.

### 3c. Bớt số lần deploy

- Gộp nhiều sửa nhỏ thành một lần push lên `main`. Không amend rồi force push nhiều lần
  (mỗi lần là một bản deploy mới, bản cũ vẫn bị tính tới hết hạn giữ).
- Nhánh `ngay2-marketing` và các nhánh `claude/*` push lên `origin` cũng tạo bản preview.
  Xóa nhánh đã xong việc trên GitHub để Vercel được phép dọn bản preview của nhánh đó.

## 4. Kiểm tra sau khi sửa

```bash
vercel ls sdvico-mktit --yes
```

```bash
vercel inspect <url bản deploy mới nhất>
```

Dòng `λ index (xx MB)` phải dưới 10 MB. Vào https://vercel.com/a-644f/~/usage, mục Deployment
Storage, xem Functions Storage giảm dần trong vài ngày (Vercel tính theo ngày).

## 5. Nếu sau này cần ffmpeg trên Vercel lại

Không bật lại `outputFileTracingIncludes`. Cách đúng: tải binary lúc chạy vào `/tmp` từ URL
cố định có kiểm sha512 (ví dụ tarball `@ffmpeg-installer/linux-x64@4.1.0` trên registry npm,
sha512 trong `package-lock.json`), rồi đặt `FFMPEG_PATH` trỏ tới file đó. Hoặc chuyển bước
chuẩn hóa video sang GitHub Actions (đã có ffmpeg sẵn).
