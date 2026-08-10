# sdvico-automation

Hệ thống tự động hóa Tuyển dụng và Marketing cho Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO).

Đọc `CLAUDE.md` trước tiên. Đó là bộ não dùng chung, gồm bối cảnh công ty, danh mục sản phẩm, bảy điều cấm và chuẩn giọng văn.

## Trạng thái

Đang ở sáng Ngày 1: dựng khung repo, viết CLAUDE.md, viết lược đồ cơ sở dữ liệu và RLS.

Việc còn lại của Ngày 1 (chiều): `packages/core` gồm client Supabase, hàm ghi run_log, hàm đẩy approval_queue, browser runner, và giao diện duyệt tối giản, một GitHub Action chạy thử theo lịch.

## Cấu trúc

```
CLAUDE.md            bộ não dùng chung
.claude/skills/      brand-voice, product-boundary, cv-screening, seo-brief
.claude/commands/    hr-jd, hr-intake, mkt-brief, mkt-draft, mkt-publish
packages/core/       supabase client, run_log, approval_queue, browser runner
packages/hr/         phần Tuyển dụng
packages/marketing/  phần Marketing
apps/approval-ui/    giao diện duyệt
supabase/            lược đồ và RLS, xem supabase/README.md
.github/workflows/   lịch chạy
```

## Tài liệu

- `docs/ke-hoach-7-ngay.md`: kế hoạch giao việc gốc.
- `docs/can-cung-cap.md`: danh sách tài khoản, quyền truy cập và dữ kiện cần cung cấp.
- `docs/app-map/README.md`: bản đồ hệ thống, nền chung.
- `docs/app-map/tuyen-dung.md`: workflow và app map mảng Tuyển dụng.
- `docs/app-map/marketing.md`: workflow và app map mảng Marketing.

## Cơ sở dữ liệu

Xem `supabase/README.md` để biết cách áp dụng migration và bật RLS. Không commit khóa và mật khẩu, chép `.env.example` thành `.env` rồi điền giá trị thật.
