# Runbook: mở kênh Jooble cho tin tuyển SDVICO

Một lần duy nhất. Sau khi Jooble whitelist URL feed, mọi tin mới sẽ tự lộ ra trong 24 giờ.

Điều cấm 1 áp dụng: máy soạn nội dung email, người bấm gửi.

## Vì sao có bước tay này

Jooble không có endpoint POST tự động cho employer thường. Model của họ là "aggregator crawl một XML feed tổng", và họ chỉ crawl các feed đã được whitelist. Whitelist yêu cầu employer chủ động liên hệ, cung cấp URL feed và mô tả ngắn về công ty.

Nguồn spec: `jooble.org/files/xml_feed_specifications.pdf` và `help.jooble.org/en/support/solutions/articles/60000700159`.

## Chuẩn bị

Trước khi gửi email, xác nhận đã có đủ:

- App approval-ui đã deploy lên Vercel với biến `NEXT_PUBLIC_SITE_URL` đặt đúng URL production.
- Feed test được: mở `${NEXT_PUBLIC_SITE_URL}/api/jobs/feed.xml` trên trình duyệt bất kỳ (không cần đăng nhập), trả về XML hợp lệ, có ít nhất 1 tin `<job>`.
- Ít nhất 1 tin đang `status='open'` với `expire_at` còn hạn. Không có tin thì feed rỗng, Jooble sẽ hỏi ngược lại.
- Đã chạy migration `20260820120000_hr_jobs_feed_columns.sql` và `20260820130000_hr_platforms_jooble.sql`.

## Bước 1: kiểm feed một lần

Mở trình duyệt bất kỳ (ẩn danh hoặc profile không liên quan tài khoản HR), vào:

```
https://<domain-production>/api/jobs/feed.xml
```

Kỳ vọng:
- HTTP 200, `Content-Type: application/xml; charset=utf-8`
- Root `<jobs>` chứa các `<job id="...">`
- Mỗi tin có `<link>`, `<name>`, `<region>`, `<description>`, `<pubdate>` (DD.MM.YYYY)
- URL trong `<link>` mở được và ra đúng trang `/tuyen-dung/[slug]`

Nếu XML rỗng hoặc lỗi, đừng gửi email cho Jooble. Sửa trong hệ thống trước.

## Bước 2: soạn email gửi Jooble

Người nhận: `xml_support@jooble.com`
Cc: người phụ trách tuyển dụng của SDVICO (nội bộ)
Chủ đề: `[SDVICO] Register XML feed for Vietnam employer`

Nội dung email (dán, sửa phần trong ngoặc vuông, người bấm gửi):

```
Hi Jooble XML support team,

We are SDVICO (Cong ty TNHH Hiep Luc Phat Trien Viet), a Vietnam-based
company providing technology products and services for the marine and
fishery industry. Website: https://sdvico.vn

We would like to register our jobs XML feed for Jooble Vietnam index.

Feed URL: https://[YOUR_PRODUCTION_DOMAIN]/api/jobs/feed.xml
Country:  Vietnam
Language: Vietnamese
Update frequency: continuous (jobs appear as HR opens them; typical
volume 2–8 open positions at any time)

Company details:
- Full name: Cong ty TNHH Hiep Luc Phat Trien Viet (SDVICO)
- Tax code / MST: [MST_CONG_TY]
- Head office: 283 Nguyen Huu Canh, Rach Dua Ward, Ho Chi Minh City
- Industry: Marine electronics, fishery equipment, water desalination
- Hotline: 1900 23 23 49
- Contact person for this integration: [HO_TEN], [EMAIL], [SDT]

The feed follows your XML Feed Specifications document:
UTF-8 encoding, root <jobs>, each <job id="..."> with CDATA-wrapped
<link>, <name>, <region>, <description>, plus <pubdate>, <updated>,
<expire> in DD.MM.YYYY format, <jobtype>, <company>, <company_logo>,
<email>. Optional promotion tags (<paid>, <cpc>, <budget>) are not
included at this time — we would like organic indexing first.

Please let us know if you need anything else to whitelist the feed.

Thank you,
[HO_TEN]
[CHUC_VU]
SDVICO
```

## Bước 3: sau khi Jooble phản hồi

Jooble thường xác nhận trong 3–7 ngày làm việc. Có thể yêu cầu:
- Bổ sung giấy tờ pháp lý công ty (giấy đăng ký kinh doanh, MST).
- Chỉnh sửa nhỏ trong feed (họ sẽ chỉ rõ tag nào).
- Xác nhận volume tin, khu vực địa lý.

Trả lời qua email đúng địa chỉ ban đầu (giữ subject để họ track).

Khi Jooble báo "feed is now indexed":
1. Tra `jooble.org/jobs/Vietnam` sau 24 giờ, search tên vị trí SDVICO đang mở.
2. Kiểm bảng `run_log` (Supabase) lọc `task = 'jooble_feed_crawl'`. Sẽ có bản ghi mỗi lần JoobleBot ghé feed, kèm số tin trả về.

## Bước 4: bật kênh Jooble trong /kenh (tùy chọn)

Migration `20260820130000_hr_platforms_jooble.sql` đã seed sẵn với `bat = true`. Nếu muốn tắt hiển thị Jooble trong danh sách kênh (VD chưa muốn nhắc trong UI), vào `/kenh` và bấm tắt. Việc tắt/bật ở đây KHÔNG ảnh hưởng đến feed, vì feed đọc thẳng `hr_jobs`.

## Muốn thúc đẩy tin bằng CPC (không bắt buộc)

Jooble cho phép trả phí theo click bằng thẻ trong XML:
- `<paid><![CDATA[True]]></paid>`
- `<cpc><![CDATA[0.3]]></cpc>` (USD)
- `<budget>525</budget>` (USD, whole number)

Chưa triển khai. Muốn dùng, cần bổ sung cột trong `hr_jobs` (`jooble_paid`, `jooble_cpc`) và sinh thẻ trong `apps/approval-ui/app/api/jobs/feed.xml/route.ts`. Bấm gửi thanh toán vẫn nằm ngoài luồng tự động.

## Khi cần đổi domain

Chỉ cần đổi biến `NEXT_PUBLIC_SITE_URL` trên Vercel, redeploy. Feed sẽ sinh link mới. Sau đó gửi email báo Jooble URL feed mới. JoobleBot sẽ chuyển sang crawl URL mới trong 24 giờ.
