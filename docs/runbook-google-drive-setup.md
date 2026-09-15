# Runbook: Kho tư liệu Zalo lên Google Drive

> 15/9/2026, sếp: "video/ảnh của Zalo sau này up lên Google Drive, sợ up lên Supabase mau đầy".
> Thanh chốt: Drive lưu file, Supabase chỉ giữ link. Tư liệu cũ trên Supabase giữ nguyên.
> Người thực hiện: Thanh hoặc IT. Làm 1 lần, khoảng 20 phút.

## Cách hệ thống chạy sau khi nối

- Script đẩy media Zalo vào kho (`up-media-kho-tu-lieu.mjs`, `upload-zalo-to-bucket.mjs`, chạy trong `day-kho-zalo*.bat`)
  thấy có khoá Drive thì up file lên thư mục Drive, đặt quyền "ai có link xem được", và ghi vào `brand_assets`
  với `storage_path = gdrive:<id file>/<tên file>`.
- Web, dây chuyền video, đăng Facebook đọc URL qua một chỗ (`lib/asset-url.ts`, `asset-url.mjs`): đường dẫn
  `gdrive:` thành link Google, đường dẫn cũ vẫn là Supabase Storage. Không phải dời tư liệu cũ.
- Xoá tư liệu ở trang Kho tư liệu xoá luôn file trên Drive (cần khoá trên Vercel).
- Chưa có khoá thì mọi thứ chạy y như cũ trên Supabase.

## Bước 1. Tạo tài khoản dịch vụ (service account)

1. Vào https://console.cloud.google.com, chọn project đang dùng cho YouTube (hoặc tạo project mới "SDVICO Marketing").
2. Menu **APIs & Services → Library**, tìm **Google Drive API** → **Enable**.
3. Menu **IAM & Admin → Service Accounts → Create service account**.
   Tên: `sdvico-kho-tu-lieu`. Không cần cấp vai trò. Bấm Done.
4. Bấm vào tài khoản vừa tạo → tab **Keys → Add key → Create new key → JSON** → tải file JSON về máy.
   File này là **mật khẩu**, không gửi qua Zalo nhóm, không commit vào Git (điều cấm 7).
5. Ghi lại email của tài khoản dịch vụ (dạng `sdvico-kho-tu-lieu@<project>.iam.gserviceaccount.com`).

## Bước 2. Tạo thư mục Drive và chia sẻ

1. Trên Google Drive của tài khoản công ty, tạo thư mục **SDVICO Kho tư liệu**.
2. Chuột phải → **Chia sẻ** → dán email tài khoản dịch vụ ở bước 1 → quyền **Người chỉnh sửa** → Gửi.
3. Mở thư mục, chép ID trên thanh địa chỉ: `https://drive.google.com/drive/folders/<ID Ở ĐÂY>`.

Lưu ý dung lượng: file up bằng tài khoản dịch vụ tính vào hạn mức của **thư mục được chia sẻ** (tài khoản
công ty) khi thư mục nằm trong Shared Drive; nếu là My Drive cá nhân, file thuộc tài khoản dịch vụ (hạn mức
15 GB riêng). Nên dùng **Shared Drive** (Google Workspace) nếu công ty có.

## Bước 3. Đặt biến môi trường

Máy nội bộ (file `.env` ở gốc repo, dòng mới):

```
GOOGLE_SA_JSON=<dán nguyên nội dung file JSON trên 1 dòng, hoặc chuỗi base64 của file>
GDRIVE_FOLDER_ID=<ID thư mục ở bước 2>
```

Tạo chuỗi base64 (khỏi lo dấu ngoặc, xuống dòng) bằng PowerShell:

```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\duong\dan\khoa.json"))
```

Vercel (Settings → Environment Variables, Production): thêm 2 biến trên rồi **Redeploy**. Vercel chỉ cần
để xoá file Drive khi bấm Xoá ở Kho tư liệu; không có cũng không sao.

## Bước 4. Kiểm tra

```
node packages/marketing/src/up-media-kho-tu-lieu.mjs
```

Dòng đầu phải in `Kho tu lieu: Google Drive (Supabase chi giu link).` và mỗi file up có đuôi `[Drive]`.
Mở trang Kho tư liệu, ảnh/video mới hiện bình thường. Nếu thấy lỗi `Drive upload lỗi 403`: thư mục chưa
chia sẻ cho đúng email tài khoản dịch vụ, hoặc chưa bật Google Drive API.

## Bổ sung mô tả tư liệu (đợt video 15/9)

Dây chuyền video chọn cảnh theo mô tả tư liệu. Tư liệu up mới có mô tả ngay; tư liệu cũ chạy:

```
npm run kho:mo-ta -- --limit 60
```

Chạy nhiều lần tới khi báo `Tu lieu can mo ta: 0`. Thêm `--faststart` để sửa luôn video cũ mở chậm trên web.
