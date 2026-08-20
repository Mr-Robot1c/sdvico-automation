# Runbook: Kết nối YouTube Shorts cho SDVICO

> Mở YouTube Shorts thành kênh đăng tự động cho video AI (vertical 9:16 60s).
> Người thực hiện: sếp hoặc IT SDVICO. Làm 1 lần, sau đó bot tự đăng khi có bài duyệt.

## Việc phải làm (tổng)

1. Tạo kênh YouTube (nếu chưa có).
2. Bật YouTube Data API v3 trên Google Cloud (miễn phí).
3. Tạo OAuth 2.0 credentials (Desktop app).
4. Chạy 1 script local để lấy refresh_token.
5. Đặt 3 biến môi trường trên Vercel + redeploy.

Ước lượng: 30 đến 45 phút cho lần đầu.

## Bước 1: Kênh YouTube

Nếu SDVICO đã có kênh, bỏ qua bước này.

1. Mở https://www.youtube.com bằng TÀI KHOẢN GOOGLE dùng lâu dài cho SDVICO (không phải Gmail cá nhân sẽ đổi việc). Có thể là `sdvico.marketing@gmail.com` hoặc tài khoản Google Workspace của công ty.
2. Bấm ảnh đại diện góc phải trên, chọn "Tạo kênh" hoặc "Create channel".
3. Chọn "Sử dụng tên tùy chỉnh" và đặt tên kênh: `SDVICO` (hoặc `SDVICO - Thiết bị tàu cá`).
4. Vào https://studio.youtube.com → Cài đặt → Kênh → Tính năng → xác minh số điện thoại. Bước này bắt buộc để upload video dài hơn 15 phút và mở API.

## Bước 2: Bật YouTube Data API v3

1. Vào https://console.cloud.google.com bằng ĐÚNG tài khoản Google chủ kênh ở bước 1.
2. Bấm menu chọn dự án phía trên, bấm "New project" → tên `sdvico-youtube` → Create.
3. Đảm bảo đang ở đúng project vừa tạo.
4. Menu bên trái → APIs & Services → Library → tìm "YouTube Data API v3" → Enable.
5. Chờ 30 giây cho Google kích hoạt.

## Bước 3: OAuth Consent Screen (giao diện mới "Google Auth Platform")

Cập nhật 20/8/2026: Google đã đổi giao diện. Luồng "OAuth consent screen" cũ (một wizard nhiều trang) giờ tách thành các mục ở menu trái: Overview, Branding, Audience, Clients, Data Access, Verification Center, Settings. Không còn nút Scopes trong một wizard nữa. Làm theo giao diện mới:

Bản đồ nhanh (mục cũ nằm ở đâu trong giao diện mới):

| Việc cần làm | Bấm vào menu trái |
| --- | --- |
| Tên app, email hỗ trợ | Branding |
| Chọn External + thêm Test users | Audience |
| Chọn Scopes (quyền) | Data Access |
| Tạo OAuth credentials | Clients |

Các bước:

1. Vào `console.cloud.google.com`, tìm ô "Google Auth Platform" (hoặc gõ "OAuth" ở ô tìm kiếm trên cùng). Nếu chưa cấu hình lần nào, bấm Get Started rồi điền App name `SDVICO Marketing` + email hỗ trợ + chọn Audience là External + email liên hệ. Xong sẽ thấy toast "OAuth configuration created!".
2. Menu trái bấm **Data Access** để chọn quyền (Scopes):
   - Bấm **Add or Remove Scopes**.
   - Ô lọc gõ `youtube`.
   - Tick 2 dòng: `.../auth/youtube.upload` và `.../auth/youtube`.
   - Bấm **Update**, rồi **Save**.
3. Menu trái bấm **Audience** để thêm người test:
   - Kéo xuống phần **Test users**, bấm **Add users**.
   - Thêm email chủ kênh YouTube (email đang đăng nhập, bước 1), bấm **Save**.

Lưu ý: app đang chế độ Testing thì refresh_token hết hạn sau **7 ngày**. Muốn dùng lâu dài, vào **Audience** bấm **Publish app** (Google xét đơn giản vì scope youtube.upload không thuộc loại nhạy cảm nhất). Chưa muốn publish thì cứ 7 ngày chạy lại script bước 5 để làm mới refresh_token.

## Bước 4: Tạo OAuth Credentials (mục Clients)

1. Menu bên trái bấm **Clients** (hoặc nút **Create OAuth client** ở màn Overview).
2. Bấm **Create client** (hoặc Create OAuth client).
3. Application type: **Desktop app**.
4. Name: `SDVICO desktop`.
5. Bấm Create.
6. Cửa sổ hiện `Client ID` + `Client secret`, bấm **Download JSON** để tải file `client_secret_*.json` về máy (nếu không có nút Download thì copy tay 2 giá trị này).
7. Mở file JSON đó bằng Notepad, thấy:

```json
{
  "installed": {
    "client_id": "1234-abcdef.apps.googleusercontent.com",
    "client_secret": "GOCSPX-xxxxxxxxxxxxx",
    ...
  }
}
```

Ghi lại 2 giá trị `client_id` và `client_secret`.

## Bước 5: Chạy script lấy refresh_token

Tại máy local (đã clone repo `sdvico-automation`), mở PowerShell:

```powershell
cd "C:\path\to\sdvico-automation"
$env:YOUTUBE_CLIENT_ID = "1234-abcdef.apps.googleusercontent.com"
$env:YOUTUBE_CLIENT_SECRET = "GOCSPX-xxxxxxxxxxxxx"
node apps/approval-ui/scripts/youtube-oauth-token.mjs
```

Hoặc Git Bash:

```bash
cd "/c/path/to/sdvico-automation"
export YOUTUBE_CLIENT_ID="1234-abcdef.apps.googleusercontent.com"
export YOUTUBE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxx"
node apps/approval-ui/scripts/youtube-oauth-token.mjs
```

Script sẽ:

1. Mở trình duyệt tới trang Google login.
2. Chọn ĐÚNG tài khoản chủ kênh YouTube SDVICO (bước 1). Nếu Google hiện cảnh báo "Google chưa xác minh ứng dụng này", bấm "Advanced" → "Go to SDVICO Marketing (unsafe)" — an toàn vì đây là app của chính bạn.
3. Bấm "Allow" cho cả 2 quyền YouTube.
4. Trở về terminal, thấy dòng in ra 3 biến:

```
YOUTUBE_CLIENT_ID=1234-abcdef.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
YOUTUBE_REFRESH_TOKEN=1//09abcdef...
```

Copy cả 3 dòng.

## Bước 6: Đặt env vars trên Vercel

1. Vào https://vercel.com → chọn project **sdvico-approval-ui**.
2. Settings → Environment Variables.
3. Thêm 3 biến (chọn cả Production + Preview + Development):
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_REFRESH_TOKEN`
4. (Tùy chọn) Thêm `YOUTUBE_PRIVACY=unlisted` nếu muốn ban đầu video ở chế độ Không công khai để test. Bỏ biến này hoặc đặt `public` để đăng công khai.
5. Bấm Save.
6. Deployments → chọn deploy mới nhất → bấm "..." → Redeploy để env vars có hiệu lực.

## Bước 7: Test đăng thử

1. Vào https://sdvico-mktit.vercel.app → hàng đợi duyệt.
2. Tìm bài có video AI + kênh YouTube (badge 🎬 YouTube).
3. Bấm Duyệt.
4. Chờ 30 giây tới 2 phút cho quá trình upload.
5. Kiểm tra kênh YouTube của SDVICO → video xuất hiện dưới dạng Shorts (có #Shorts trong description).

Nếu lỗi: mở /van-hanh trang, xem `run_log` task `mkt.publish_youtube` để đọc thông báo lỗi.

## Hết hạn refresh_token (mỗi 7 ngày cho app Testing)

Nếu Vercel deploy báo lỗi "invalid_grant" khi đăng YouTube:

1. Chạy lại bước 5 để lấy refresh_token mới.
2. Vào Vercel → cập nhật biến `YOUTUBE_REFRESH_TOKEN` với giá trị mới.
3. Redeploy.

Để tránh phiền phức, vào Google Auth Platform, mục **Audience**, bấm **Publish app** (đưa app từ Testing sang In production). Sau khi Google phê duyệt, refresh_token bền lâu dài.

## Ghi chú kỹ thuật

- Video YouTube Shorts điều kiện: dọc 9:16, dưới 60 giây. Video pipeline hiện tại sinh vertical 9:16 khoảng 30 đến 60 giây → phù hợp.
- Bot tự thêm `#Shorts` vào description để YouTube nhận diện là Shorts.
- CTA cuối description: Nhắn tin Page SDVICO + tổng đài 1900 23 23 49 + link sdvico.vn.
- Không thay đổi video hoặc chuyển đổi định dạng — dùng luôn file mp4 pipeline dựng ra.
