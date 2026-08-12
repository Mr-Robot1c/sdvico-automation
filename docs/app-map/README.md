# App Map: bản đồ hệ thống sdvico-automation

> Đọc khi cần biết luồng chạy và thành phần của một mảng. Đây là trang chỉ mục.
> Nguồn sự thật khác: `CLAUDE.md` cho bảy điều cấm và giọng văn, `supabase/migrations` cho lược đồ, `docs/ke-hoach-7-ngay.md` cho kế hoạch gốc.
covers: packages/core, apps/approval-ui, supabase/migrations
last_verified: 2026-08-12
ttl_days: 180
<!-- re-verified: 2026-08-12 - approval-ui UI redesign (sidebar chia 5 nhom, eye modal, /san-xuat moi). Luong approval_queue va cac bang du lieu KHONG doi. Nut Xong o /san-xuat van di qua approval_queue kind=mkt_publish_content dung dieu cam 1. -->

<!-- DOC-STATUS: SUSPECT (2026-08-12) — code 'apps/approval-ui' doi sau last_verified. DOI CHIEU VOI CODE truoc khi tin. May quan ly dong nay, dung sua tay. -->

Hệ thống chia hai mảng, mỗi mảng một file workflow và app map riêng:

- Tuyển dụng: [tuyen-dung.md](tuyen-dung.md). Phụ trách Bạn A.
- Marketing: [marketing.md](marketing.md). Phụ trách Bạn B.

## Nền chung dùng cho cả hai mảng

Kiến trúc đã chốt, chi tiết ở CLAUDE.md mục 5.

- Điều phối bằng GitHub Actions schedule và cron nội bộ.
- Suy luận ngôn ngữ bằng Claude Code chế độ headless.
- Dữ liệu ở Supabase Postgres và Storage.
- Giao diện duyệt bằng Next.js trên Vercel, đọc ghi bảng `approval_queue`.
- Tự động thao tác web bằng Playwright với Chrome thật, qua browser runner trong `packages/core`.

### Thành phần dùng chung trong packages/core

| Thành phần | Việc |
|---|---|
| Client Supabase | Kết nối từ biến môi trường |
| Ghi run_log | Ghi mọi thao tác tự động, kèm ảnh chụp khi lỗi |
| Đẩy approval_queue | Đưa mục cần duyệt vào hàng đợi, trạng thái pending |
| Browser runner | Hàng đợi theo tài khoản, giữ hồ sơ trình duyệt, đếm hạn mức, công tắc dừng khẩn, chế độ diễn tập |

### Cổng an toàn chung

- Máy soạn, người bấm. Mọi thư và bài đăng đi qua `approval_queue`, người bấm mới chuyển approved. Điều cấm 1 và 2.
- Row Level Security bật cho bảng có dữ liệu cá nhân, trọng tâm `hr_candidates` và `hr_applications`. Điều cấm 6.
- Gặp rào chắn của nền tảng thì dừng và đẩy vào hàng đợi duyệt, không phá rào. Kế hoạch Phần 6.
- Hạn mức tự đặt thấp hơn hạn mức của sàn, đếm lưu trong cơ sở dữ liệu.

## Bảng dữ liệu theo mảng

| Bảng | Mảng | Dữ liệu cá nhân |
|---|---|---|
| hr_jobs | Tuyển dụng | Không |
| hr_candidates | Tuyển dụng | Có, bật RLS |
| hr_applications | Tuyển dụng | Có, bật RLS |
| mkt_keywords | Marketing | Không |
| mkt_content | Marketing | Không |
| mkt_posts | Marketing | Không |
| mkt_metrics | Marketing | Không |
| brand_assets | Chung, thiên Marketing | Không |
| approval_queue | Chung | Có thể chứa, thận trọng |
| run_log | Chung | Có thể chứa, thận trọng |

Cập nhật lần cuối: 10/8/2026.
