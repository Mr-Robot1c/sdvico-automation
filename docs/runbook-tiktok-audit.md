<!-- re-verified: 2026-08-19 - Runbook nop audit TikTok Content Posting API (Direct Post) de dang PUBLIC tu dong. User chon huong audit 19/8. Nguon: developers.tiktok.com/doc/content-sharing-guidelines + content-posting-api-reference-direct-post; bundle.social/blog/tiktok-api-approval (tra 19/8/2026). App hien: scope user.info.basic,video.publish,video.upload; goi creator_info truoc khi dang (lib/tiktok.ts); FILE_UPLOAD nen KHONG can domain verification; TIKTOK_PRIVACY=auto san sang tu public khi audit dau. -->

# Runbook: nộp audit TikTok để đăng công khai (public)

Mục tiêu: đưa app SDVICO qua audit của TikTok để video máy đăng lên **công khai (mọi người xem được)** thay vì riêng tư. Đây là rào chắn của TikTok, không phá bằng code được. User đã chọn hướng này ngày 19/8.

Cập nhật lần cuối: 19/8/2026. Nguồn: tài liệu chính thức TikTok for Developers (Content Sharing Guidelines, Content Posting API — Direct Post), tra ngày 19/8/2026.

## Tình trạng hiện tại (đã đúng, không phải sửa)

- App đã nối tài khoản TikTok qua OAuth (`/api/tiktok/connect` và `/callback`).
- Đã xin đúng scope: `user.info.basic`, `video.publish`, `video.upload`.
- Code đã gọi `creator_info` trước mỗi lần đăng (bắt buộc, bỏ qua là **rớt audit**).
- Đăng bằng cách tải tệp trực tiếp (`FILE_UPLOAD`), nên **không phải xác minh domain**. Đây là điểm nhẹ gánh, khỏi làm bước DNS.
- Code đã sẵn sàng tự động chuyển public: biến `TIKTOK_PRIVACY=auto` (mặc định). Khi audit đậu, TikTok trả về tùy chọn `PUBLIC_TO_EVERYONE`, code tự lấy, không phải sửa gì.

Trước khi audit đậu: mọi video vẫn bị TikTok ép **riêng tư (SELF_ONLY)** dù đăng thành công. Đây là điều bình thường, không phải lỗi.

## Hai giai đoạn của TikTok

TikTok duyệt làm hai vòng tách biệt:

1. **Vòng 1 — Product access (vài ngày).** Xin quyền dùng endpoint Content Posting API. Điền một biểu mẫu trong TikTok Developer Portal. Sau vòng này endpoint chạy được nhưng bài vẫn riêng tư.
2. **Vòng 2 — Content audit (vài tuần, thời gian không cố định).** Nộp bản ghi màn hình chứng minh app tuân thủ. Đậu vòng này thì bài mới công khai được.

## Việc cần làm — Vòng 1 (làm được ngay)

Người có quyền quản trị app trên TikTok Developer Portal (sếp hoặc chủ tài khoản developer) làm:

1. Vào Developer Portal, mở app SDVICO, phần Content Posting API, bấm xin **Product access**.
2. Điền biểu mẫu, nội dung gồm:
   - App làm gì: "Công cụ nội bộ của công ty SDVICO để đăng video giới thiệu sản phẩm ngành biển và thủy sản lên trang TikTok chính thức của công ty, có người duyệt trước khi đăng."
   - Ai dùng: nhân viên marketing nội bộ của SDVICO.
   - Link website: `https://sdvico.vn` (hoặc trang app `https://sdvico-mktit.vercel.app`).
   - **Link Chính sách bảo mật (Privacy Policy) và Điều khoản (Terms)**: bắt buộc, phải mở được công khai. `[CẦN LÀM: nếu chưa có, dựng 2 trang này. Xem mục "Trang chính sách" bên dưới.]`
3. Chỉ xin đúng scope đang dùng thật. App xin `video.publish` (Direct Post) là đúng. Lưu ý: xin scope mà **không chứng minh có dùng là lý do bị từ chối**. Nếu không định dùng luồng nháp thì cân nhắc bỏ `video.upload` khỏi hồ sơ để khỏi bị soi. `[CHỜ QUYẾT: giữ hay bỏ video.upload]`

## Việc cần làm — Vòng 2 (sau khi Vòng 1 đậu)

Vòng này cần một **bản ghi màn hình (demo video)** quay đủ luồng. Người duyệt của TikTok phải thấy:

1. Đăng nhập và màn hình đồng ý (consent) nối tài khoản TikTok.
2. **Màn soạn/xác nhận (composer)** dựng từ dữ liệu `creator_info`, trong đó có:
   - Bản xem trước video và caption sẽ đăng (xác nhận rõ "sẽ đăng cái gì").
   - **Ô chọn mức riêng tư** (Công khai / Bạn bè / Chỉ mình tôi) lấy từ `creator_info`.
   - Tôn trọng cài đặt của tài khoản: nếu `creator_info` báo tắt bình luận/duet/stitch thì UI phải khóa theo.
   - Câu thông báo rõ nội dung sẽ được đăng lên TikTok.
3. Bài xuất hiện sau khi đăng.

Nếu demo **không quay đủ luồng** thì bị từ chối.

### Điểm còn thiếu của app (cần bổ sung để quay demo)

Hiện app đăng TikTok tự động từ máy chủ sau khi người duyệt bấm Duyệt, **chưa có màn composer hiện ô chọn riêng tư và câu xác nhận** cho người duyệt xem. Để quay được demo đạt yêu cầu, cần bổ sung màn này vào bước duyệt:

- Hiện video + caption sắp đăng.
- Ô chọn mức riêng tư, đổ từ `creator_info` (route mới `/api/tiktok/creator-info`).
- Câu disclosure: "Video sẽ được đăng lên tài khoản TikTok chính thức của SDVICO."
- Khóa các nút bình luận/duet/stitch theo `creator_info`.

Phần này là code, đội tự làm được, không chờ TikTok. Nên làm trong lúc chờ Vòng 1 duyệt.

## Lý do bị từ chối thường gặp (né trước)

- Không tôn trọng cài đặt tài khoản trong UI (ví dụ tài khoản tắt duet mà UI vẫn cho bật).
- Không có xác nhận rõ ràng nội dung sắp đăng.
- Trang chính sách bảo mật hoặc điều khoản không mở được.
- Xin scope quá mức so với chức năng đã chứng minh.
- Không gọi `creator_info` trước khi đăng (app đã gọi, không lo).

## Trang chính sách (nếu chưa có)

Vòng 1 cần link Privacy Policy và Terms mở công khai. Nếu chưa có, dựng hai trang tĩnh đơn giản (có thể đặt ngay trên app: `/privacy` và `/terms`), nội dung nêu: app thu thập gì, dùng token TikTok để làm gì (chỉ đăng video lên trang công ty), không chia sẻ dữ liệu ra ngoài, cách liên hệ gỡ bỏ. `[CẦN LÀM nếu sdvico.vn chưa có sẵn]`

## Sau khi audit đậu

- Không phải sửa code. Biến `TIKTOK_PRIVACY` để mặc định `auto` là đủ: TikTok bắt đầu trả tùy chọn `PUBLIC_TO_EVERYONE`, code tự chọn và đăng công khai.
- Muốn tắt tự động public (đăng riêng tư lại): đặt `TIKTOK_PRIVACY=self` trên Vercel.
- Nhắc: chủ tài khoản phải để tài khoản TikTok ở chế độ công khai thì video công khai mới hiện với mọi người.

## Tóm tắt ai làm gì

| Việc | Người làm | Khi nào |
|---|---|---|
| Xin Product access (Vòng 1) + link chính sách | Sếp / chủ tài khoản developer | Ngay |
| Dựng trang Privacy Policy + Terms (nếu thiếu) | Đội kỹ thuật | Ngay |
| Bổ sung màn composer chọn riêng tư cho demo | Đội kỹ thuật | Trong lúc chờ Vòng 1 |
| Quay demo video + nộp Content audit (Vòng 2) | Sếp / đội | Sau khi Vòng 1 đậu |
| Bật public | Tự động (TIKTOK_PRIVACY=auto) | Sau khi Vòng 2 đậu |
