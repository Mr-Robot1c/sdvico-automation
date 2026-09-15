# Runbook: Nối Google Search Console vào trang SEO

> 15/9/2026, sếp: "dùng Google index xem số lượt bấm click... hiện thông số ở bài SEO đã đăng".
> Kết quả: trang SEO có ô "Click Google", bảng Bài SEO đã đăng thêm cột Click / Hiển thị / CTR / Vị trí
> (28 ngày gần nhất, Google trễ 2 ngày), trang /seo/bai-viet liệt kê đủ bài và sắp theo click.
> Người thực hiện: Thanh (có quyền Search Console sdvico.vn). Khoảng 15 phút.

## Cách hệ thống chạy sau khi nối

- Cron hằng giờ (`/api/mkt-metrics-pull`) sau 6h sáng mỗi ngày gọi Search Console API 1 lần, ghi vào
  `mkt_metrics` với `source = 'gsc'`: mỗi bài 1 dòng (khớp qua đuôi slug `-<8 ký tự id>` của
  `sdvico.vn/blog/<slug>`), thêm 1 dòng `__gsc_site__` là tổng cả site. Nhật ký ở `run_log` task `mkt.gsc_pull`.
- Trang SEO đọc snapshot mới nhất. Bài chưa từng hiện trên Google thì cột để "—".

## Bước 1. Tài khoản dịch vụ

Dùng chung tài khoản dịch vụ của runbook Google Drive (`docs/runbook-google-drive-setup.md`, bước 1).
Nếu chưa có thì làm bước 1 ở đó. Thêm: **APIs & Services → Library → Google Search Console API → Enable**.

## Bước 2. Cho tài khoản dịch vụ đọc property

1. Vào https://search.google.com/search-console, chọn property **sdvico.vn** (dạng Domain `sc-domain:sdvico.vn`
   hoặc URL prefix `https://sdvico.vn/`).
2. **Cài đặt → Người dùng và quyền → Thêm người dùng** → dán email tài khoản dịch vụ → quyền **Đầy đủ** hoặc
   **Hạn chế** (đọc đủ) → Thêm.
3. Nếu blog còn chạy song song ở `sdvico-mktit.vercel.app`, có thể thêm property đó và đổi `GSC_SITE_URL`
   khi cần; mặc định lấy sdvico.vn vì canonical bài trỏ về đó.

## Bước 3. Biến môi trường trên Vercel

Settings → Environment Variables (Production):

```
GOOGLE_SA_JSON=<JSON khoá tài khoản dịch vụ, nguyên văn hoặc base64>
GSC_SITE_URL=sc-domain:sdvico.vn
```

Với property URL prefix thì ghi đúng `https://sdvico.vn/` (có dấu gạch cuối). Redeploy.

## Bước 4. Kiểm tra

- Gọi tay: mở `https://sdvico-mktit.vercel.app/api/mkt-metrics-pull?secret=<CRON_SECRET>` sau 6h sáng, hoặc chờ
  cron giờ tới. Vào trang Agent → AI quản lý lịch và kênh → Chi tiết, thấy dòng `mkt.gsc_pull` status ok.
- Trang SEO: ô "Click Google" có số, bảng có cột Click. Lỗi hay gặp:
  - `Search Console 403`: chưa thêm email tài khoản dịch vụ vào property, hoặc chưa bật API.
  - `Search Console 404`: `GSC_SITE_URL` viết sai dạng (Domain property phải là `sc-domain:sdvico.vn`).
  - Có số site nhưng bài toàn "—": URL bài trên sdvico.vn/blog không giữ đuôi `-<8 ký tự id>` trong slug;
    kiểm tra với anh Thành (SPA bên IIS đọc `/api/public/posts`, slug phải giữ nguyên).
