# Runbook: Kho tư liệu Zalo lên Google Drive

> 15/9/2026, sếp: "video/ảnh của Zalo sau này up lên Google Drive, sợ up lên Supabase mau đầy".
> Thanh chốt: Drive lưu file, Supabase chỉ giữ link. Tư liệu cũ trên Supabase giữ nguyên.
> ĐÃ NỐI XONG 16/9 (xem mục ĐÃ LÀM XONG). Phần dưới là cách làm lại khi cần.

## Cách hệ thống chạy sau khi nối

- Script đẩy media Zalo vào kho (`up-media-kho-tu-lieu.mjs`, `upload-zalo-to-bucket.mjs`, chạy trong `day-kho-zalo*.bat`)
  thấy có khoá Drive thì up file lên thư mục Drive, đặt quyền "ai có link xem được", và ghi vào `brand_assets`
  với `storage_path = gdrive:<id file>/<tên file>`.
- Web, dây chuyền video, đăng Facebook đọc URL qua một chỗ (`lib/asset-url.ts`, `asset-url.mjs`): đường dẫn
  `gdrive:` thành link Google, đường dẫn cũ vẫn là Supabase Storage. Không phải dời tư liệu cũ.
- Xoá tư liệu ở trang Kho tư liệu xoá luôn file trên Drive (cần khoá trên Vercel).
- Chưa có khoá thì mọi thứ chạy y như cũ trên Supabase.

## ĐÃ LÀM XONG 16/9 (Thanh + Claude) — ghi lại để sau này đổi máy / đổi tài khoản

Kết quả: file Zalo up lên thư mục Drive **SDVICO Kho tư liệu** (id `1MNDua5Ai8iEffBlS7SVHosSQiL2QI4Yy`) bằng tài khoản
Google của Thanh qua OAuth. Đã thử up, mở link công khai, xoá: OK. 5 biến đã đặt trên Vercel production và trong `.env`
gốc trên máy: `GDRIVE_FOLDER_ID`, `GDRIVE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SA_JSON`.

**Bài học:** Google (từ 2025) KHÔNG cho tài khoản dịch vụ chứa file trên My Drive ("Service Accounts do not have
storage quota", chỉ Shared Drive của Workspace). Nên tài khoản dịch vụ `sdvico-kho-tu-lieu@sdvico-youtube.iam...`
chỉ còn dùng cho Search Console; Drive đi bằng OAuth như YouTube.

## Cách làm lại (khi đổi tài khoản Google hoặc token hết hạn)

1. Google Cloud (project `sdvico-youtube`, tài khoản phải bật xác minh 2 bước): APIs & Services → Credentials →
   **+ Create credentials → OAuth client ID → Desktop app** → Download JSON (`client_secret_*.json`).
2. Ghi vào `.env` gốc: `GOOGLE_CLIENT_ID=` và `GOOGLE_CLIENT_SECRET=` (2 giá trị trong file JSON, mục `installed`).
3. Chạy trong repo:

```
node packages/marketing/src/google-oauth-drive.mjs
```

   rồi mở **Edge** vào `http://localhost:8765/start`, chọn tài khoản công ty, Nâng cao → Chuyển đến SDVICO Marketing →
   Cho phép. Script tự ghi `GDRIVE_REFRESH_TOKEN` vào `.env`. Scope chỉ `drive.file` (chỉ đụng file do app tạo).
4. Thư mục Drive: tạo (hoặc dùng) thư mục, chép id trên thanh địa chỉ vào `GDRIVE_FOLDER_ID`.
5. Đưa lên Vercel (Settings → Environment Variables, Production) cùng 4 tên biến trên rồi Redeploy — Vercel chỉ cần
   để xoá file Drive khi bấm Xoá ở Kho tư liệu.
6. Ứng dụng OAuth đang ở chế độ Testing thì refresh token hết hạn sau 7 ngày: vào Google Auth Platform → Audience →
   **Publish app** để dùng lâu dài (scope drive.file không thuộc loại nhạy cảm, không cần Google xét).

## Kiểm tra

```
node packages/marketing/src/up-media-kho-tu-lieu.mjs
```

Dòng đầu phải in `Kho tu lieu: Google Drive (Supabase chi giu link).` và mỗi file up có đuôi `[Drive]`.
Lỗi `Drive OAuth lỗi 400: invalid_grant` = token hết hạn (app Testing 7 ngày) → chạy lại bước 3.

## Bổ sung mô tả tư liệu (đợt video 15/9)

Dây chuyền video chọn cảnh theo mô tả tư liệu. Tư liệu up mới có mô tả ngay; tư liệu cũ chạy:

```
npm run kho:mo-ta -- --limit 60
```

Chạy nhiều lần tới khi báo `Tu lieu can mo ta: 0`. Thêm `--faststart` để sửa luôn video cũ mở chậm trên web.
