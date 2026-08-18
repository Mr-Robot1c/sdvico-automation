# Dựng môi trường test Facebook cho SDVICO

> Mục tiêu: có chỗ đăng thử bài lên Facebook mà chỉ mình bạn xem, để kiểm luồng đăng tin tuyển dụng qua Graph API, chưa chạm trang thật của công ty.
>
> Lấy bốn giá trị đưa vào `.env`: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`.

## Nguyên tắc, đọc trước

Không lập tài khoản Facebook mới để test. Kế hoạch dự án cấm rõ việc tạo tài khoản cá nhân giả, và một tài khoản giả bị đánh dấu có thể kéo theo cả tài khoản thật đăng nhập cùng thiết bị (kế hoạch Phần 5.3 và 6.3).

Cách đúng mà Meta cung cấp cho lập trình viên test đạt đúng điều bạn muốn: dùng **App ở chế độ Development** cộng một **Page để Chưa xuất bản**. Khi đó bài đăng chỉ người có vai trò trên app và quản trị Page (là bạn) nhìn thấy, công chúng không thấy. Không cần App Review, không rủi ro tài khoản.

Bạn cần một tài khoản Facebook **thật của bạn** để đăng nhập cổng lập trình viên. Việc này không đăng gì lên trang cá nhân của bạn, app test và Page nháp tách biệt hoàn toàn.

## Bước 1. Tạo Meta App ở chế độ Development

1. Vào https://developers.facebook.com, đăng nhập bằng tài khoản Facebook thật của bạn. Lần đầu thì đăng ký làm nhà phát triển (xác minh qua số điện thoại hoặc thư).
2. Vào My Apps, bấm Create App.
3. Khi hỏi mục đích, chọn use case cho phép quản lý Page. Nhãn hiện tại thường là "Manage everything on your Page" hoặc chọn "Other" rồi loại app "Business".
4. Đặt tên app, ví dụ `sdvico-tuyendung-test`, điền email liên hệ, tạo app. App mặc định ở chế độ Development, tức là riêng tư, chỉ mình bạn dùng để test.

## Bước 2. Lấy App ID và App Secret

1. Trong app, mở menu trái, vào Settings rồi Basic.
2. `App ID` hiện sẵn. Đây là `FACEBOOK_APP_ID`.
3. Bấm Show cạnh App Secret để hiện, đây là `FACEBOOK_APP_SECRET`. Giữ kín, coi như mật khẩu.

## Bước 3. Tạo Page test và để Chưa xuất bản

1. Tạo một Page Facebook mới (https://www.facebook.com/pages/create), đặt tên ví dụ `SDVICO Tuyển dụng (thử nghiệm)`, chọn hạng mục bất kỳ.
2. Vào phần quản lý Page, mục cài đặt hiển thị, đặt Page về **Chưa xuất bản** (Published bật thành Off). Từ giờ chỉ quản trị viên thấy Page, công chúng không thấy.
3. Bạn là người tạo nên đã là quản trị Page, đủ quyền để app đăng bài trong chế độ Development.

## Bước 4. Lấy Page ID và Page Access Token loại lâu dài

Dùng Graph API Explorer, không cần viết code:

1. Vào https://developers.facebook.com/tools/explorer
2. Ô Meta App, chọn app bạn vừa tạo.
3. Bấm Generate Access Token hoặc chọn User Token, tích ba quyền: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. Đồng ý cấp quyền. Bạn nhận một User Access Token ngắn hạn.
4. Đổi sang token lâu dài. Mở một cửa sổ dòng lệnh, thay các giá trị trong ngoặc rồi chạy (dùng phiên bản Graph API hiện hành mà Explorer đang hiển thị, ví dụ `v23.0`):

```bash
curl -s "https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={USER_TOKEN_NGAN_HAN}"
```

Kết quả trả về `access_token`, đây là User Token lâu dài.

5. Lấy danh sách Page kèm token của từng Page:

```bash
curl -s "https://graph.facebook.com/v23.0/me/accounts?access_token={USER_TOKEN_LAU_DAI}"
```

Trong kết quả, tìm Page test của bạn. Trường `id` là `FACEBOOK_PAGE_ID`, trường `access_token` là `FACEBOOK_PAGE_ACCESS_TOKEN`. Token Page sinh từ User Token lâu dài thì không hết hạn theo giờ, tiện cho lịch chạy tự động.

## Bước 5. Đăng thử một bài chỉ mình bạn xem

```bash
curl -s -X POST "https://graph.facebook.com/v23.0/{PAGE_ID}/feed" \
  -d "message=Bài đăng thử nghiệm từ hệ thống SDVICO, chỉ để kiểm tra." \
  -d "access_token={PAGE_ACCESS_TOKEN}"
```

Kết quả trả về một `id` dạng `{page_id}_{post_id}` là đăng thành công. Mở Page nháp bằng tài khoản của bạn để thấy bài. Vì Page đang Chưa xuất bản, không ai ngoài bạn thấy.

## Bước 6. Điền vào .env, không commit

Mở file `.env` ở gốc repo trên máy chạy, điền bốn giá trị:

```
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_PAGE_ID=...
FACEBOOK_PAGE_ACCESS_TOKEN=...
```

File `.env` đã bị Git bỏ qua, không commit (điều cấm 7). Với lịch chạy trên GitHub, đặt bốn giá trị này trong repo Settings và Secrets. Đừng dán token vào khung chat, khi cần kiểm thử tôi đọc kết quả qua log.

## Phương án thay thế: Test User của Meta

Nếu không muốn dùng Page cá nhân, Meta có Test User trong app. Vào app, mục App Roles rồi Test Users, tạo một test user, cho test user tạo Page. Toàn bộ nằm trong hộp cát của app, không đụng gì bên ngoài. Cách này sạch về tách biệt nhưng thao tác lấy token rườm hơn, nên bước trên ưu tiên Page Chưa xuất bản cho nhanh.

## Giới hạn cần biết của chế độ Development

Trong chế độ Development, app dùng được các quyền Page cho chính những Page mà người có vai trò trên app quản trị, không cần App Review. Đủ để test toàn bộ luồng đăng tin. Chỉ khi đưa lên Page thật công khai mới cần chuyển app sang Live và xin duyệt quyền, việc đó để giai đoạn sau và do người vận hành quyết.

## Sau khi có token: luồng đăng tin tuyển dụng

Bốn tầng, máy soạn người bấm Duyệt, worker mới đăng, đúng điều cấm 1:

1. Áp lược đồ: chạy `supabase/migrations/20260812090000_hr_social_posts.sql` trong Supabase SQL editor. Bước này thêm cột nội dung cho tin đăng.
2. Soạn bài và đẩy hàng đợi, chọn một trong hai cách:
   - Trong giao diện duyệt, mở trang Vị trí và Đăng tin, bấm nút Soạn bài Facebook ở một vị trí.
   - Hoặc chạy hàng loạt cho các vị trí đang tuyển: `node packages/hr/src/post/queue-facebook.mjs`. Có `GROQ_API_KEY` thì dùng Groq soạn, không thì lấy bản Facebook trong JD.
3. Duyệt: mở giao diện, xem và sửa nội dung ở tab Tin đăng, rồi bấm Duyệt ở trang Duyệt.
4. Đăng thật lên Page nháp:
   - Chạy thử trước, chỉ in không đăng: `node packages/hr/src/post/publish-facebook.mjs`
   - Đăng thật: `node packages/hr/src/post/publish-facebook.mjs --live`

Worker chỉ đăng mục đã duyệt, có trần `HR_FB_MAX_PER_DAY` bài mỗi ngày, gặp lỗi thì dừng. Vì Page để Chưa xuất bản, chỉ mình bạn thấy bài.

Nguồn tham khảo tài liệu Meta: Test Users, Pages API, Access Tokens, Graph API Explorer.

## Bước 7 (tùy chọn). Nhận bình luận qua webhook

Việc này KHÔNG bắt buộc để đăng tin — chỉ cần nếu muốn hệ thống đọc và soạn gợi ý trả lời
bình luận công khai (trang Bình luận Facebook trong giao diện). Đây là bước cấu hình thủ công
trên Meta, không phải code:

1. Trong app, vào mục **Webhooks**, chọn object **Page**.
2. Điền **Callback URL**: `https://TEN-APP.vercel.app/api/webhooks/facebook`. URL phải là domain
   thật đã deploy (Vercel), không chạy được trên localhost vì Meta cần gọi vào được từ ngoài.
3. Điền **Verify Token**: đặt một chuỗi tự chọn, dán đúng chuỗi đó vào biến môi trường
   `FACEBOOK_WEBHOOK_VERIFY_TOKEN` trên Vercel, redeploy trước khi bấm Verify and Save.
4. Chọn field **feed** (KHÔNG chọn `messages` — Messenger cần thêm quyền `pages_messaging` và
   App Review riêng của Meta, nằm ngoài phạm vi bản này).
5. Vào Page test, mục Webhooks (hoặc qua app), **Subscribe** app vào Page với field `feed`.
6. Chế độ Development chỉ nhận được webhook cho Page mà người có vai trò trên app quản trị —
   đủ để test. Đưa lên Page thật công khai cần App Review cho `pages_read_engagement` (đọc
   bình luận) và `pages_manage_engagement` (đăng trả lời), việc đó để người vận hành xin sau,
   có thể mất vài ngày Meta mới duyệt.
7. Sau khi có bình luận thật gửi tới, hai job cron `comment-compose` và `comment-publish` (xem
   `docs/cron-job-org.md`) sẽ tự soạn gợi ý và đăng trả lời sau khi được duyệt.
