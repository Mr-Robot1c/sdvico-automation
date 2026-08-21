# Runbook: Kết nối Zalo OA để đăng bài tự động

> Khung code đã sẵn (lib/zalo-oa.ts). Cần SDVICO làm các bước dưới đây một lần.
> Lưu ý trước khi bắt đầu: Zalo CHỈ cho đăng bài qua API với OA ĐÃ XÁC THỰC (có dấu tick).
> OA chưa xác thực thì làm bước 1 trước, có thể mất vài ngày tới vài tuần chờ Zalo duyệt.

## Bước 1: Zalo OA đã xác thực

1. Vào https://oa.zalo.me đăng nhập tài khoản quản lý OA của SDVICO.
2. Nếu chưa có OA: tạo OA loại Doanh nghiệp, điền thông tin công ty.
3. Vào phần Xác thực tài khoản, nộp giấy phép kinh doanh của SDVICO. Chờ Zalo duyệt.
4. OA có dấu tick xanh mới dùng được API bài viết.

## Bước 2: Tạo app trên Zalo Developers

1. Vào https://developers.zalo.me, đăng nhập cùng tài khoản.
2. Tạo ứng dụng mới, tên `SDVICO Marketing`.
3. Trong app, mục Official Account, bấm Liên kết OA và chọn OA của SDVICO.
4. Ghi lại App ID và App Secret (Cài đặt của app).

## Bước 3: Lấy access token

1. Trong trang app, mục Official Account API, dùng công cụ lấy token (Zalo có trang
   cấp token thử trực tiếp) hoặc làm OAuth flow chuẩn.
2. Nhận về `access_token` (sống 25 giờ) và `refresh_token` (sống 3 tháng).
3. Cách nhanh cho bản đầu: dán access_token vào Vercel env `ZALO_OA_ACCESS_TOKEN` + Redeploy.
   Cách bền: nói Claude nối bảng `mkt_oauth_tokens` (provider `zalo`) để tự refresh như TikTok.

## Bước 4: Kiểm tra

1. Mở trang Kết nối trong app duyệt — hàng Zalo OA phải hiện Sẵn sàng.
2. Bài có video hoặc bài bán sau khi Duyệt sẽ tạo bài viết dạng nháp trên OA
   (vào OA Manager thấy bài chờ, bấm đăng). Khi app đủ quyền xuất bản, Claude nâng lên
   đăng thẳng.

## Vướng thì

- OA chưa xác thực: API trả lỗi quyền — phải chờ xác thực xong, không có cách đi tắt.
- Token hết hạn (25 giờ): dán token mới hoặc nhờ Claude làm tự refresh bằng refresh_token.
