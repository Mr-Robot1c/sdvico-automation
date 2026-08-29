> Load khi: task chạm UI trang công khai /blog, /blog/[slug], /blog/chu-de/[slug], /san-pham, /san-pham/[slug] (shell công khai trong root-shell.tsx)
covers: apps/approval-ui/app/blog, apps/approval-ui/app/san-pham, apps/approval-ui/app/root-shell.tsx
last_verified: 2026-08-28
ttl_days: 90
<!-- re-verified: 2026-08-28 18:20 - Hotline nut Goi + footer public doi 0254 359 6868 (sep 28/8); cac hanh vi/bo cuc khac doi chieu root-shell + blog van dung. -->
<!-- re-verified: 2026-08-28 17:20 - Doi chieu blog cover fix (deleted_at, pool khong zalo, chong trung cung trang): hanh vi the bai giu nguyen, chi nguon anh fallback sach hon. -->

# DESIGN-SPEC — Trang công khai SDVICO (blog + sản phẩm)

## Người dùng & nhiệm vụ
- User chính: ngư dân, chủ tàu, người nhà đi biển — vào từ link Facebook/Zalo/Google bằng ĐIỆN THOẠI  |  Job: đọc bài kinh nghiệm, xem SDVICO có thiết bị gì, rồi nhắn tin hoặc gọi
- Platform: mobile-first, desktop đầy đủ  |  Logo/brand: public/logo-sdvico.png (chữ S xanh dương + đỏ trên nền xám nhạt)

## Thang người dùng
| Loại user | Muốn thấy gì | Sản phẩm truyền tải gì | Thúc đẩy action tiếp theo |
|---|---|---|---|
| Bà con ngư dân (mobile, từ link FB) | bài dễ đọc, ảnh thật, số điện thoại rõ | "người làm thật, hiểu nghề biển" | Nhắn tin cho Page hoặc Gọi |
| Chủ tàu, đại lý (desktop) | danh mục thiết bị, vai trò SDVICO (sản xuất hay phân phối) | "rõ ràng, không nhận vơ" | Gọi tư vấn |
| Nhân viên SDVICO | bài đã lên đúng chưa | — | không có (việc ở trang nội bộ) |

## Object model
Bài viết: list + detail. Chủ đề (theo sản phẩm): list. Sản phẩm: list + detail. Không form, không đăng nhập.

## Nav model
Top nav 2 mục: Bài viết, Sản phẩm + nút Gọi (outline). Mobile: cùng top nav, nút Gọi thu thành icon 44px. Không sidebar, không lộ nav nội bộ.

## Screen map
| # | Màn hình | Type | Vào từ | User đến để làm gì | Step tiếp theo mong muốn | Primary action | Widget chính | Density |
|---|---|---|---|---|---|---|---|---|
| 1 | /blog | marketing-public | link FB/Zalo, Google, nav | chọn 1 bài đáng đọc | mở bài | (màn đọc, không primary) | tiêu đề + hàng chip chủ đề + lưới card 3/2/1 cột | M |
| 2 | /blog/[slug] | marketing-public | share FB (chính), list | đọc hết bài | nhắn tin hoặc đọc bài khác | Nhắn tin cho Page | breadcrumb, h1, meta, ảnh, thân bài 68ch, khối CTA, 3 bài khác | M |
| 3 | /blog/chu-de/[slug] | marketing-public | chip chủ đề, Google | xem bài về 1 sản phẩm | mở bài hoặc sang trang sản phẩm | (màn đọc) | như 1 + link sản phẩm | M |
| 4 | /san-pham | marketing-public | nav, Google | biết SDVICO có gì, ai làm | mở sản phẩm | (màn đọc) | lưới 6 card: ảnh, badge vai trò, tên, 1 câu, số bài | M |
| 5 | /san-pham/[slug] | marketing-public | list, bài viết, Google | hiểu lợi ích + vai trò SDVICO | nhắn tin tư vấn | Nhắn tin cho Page | hero 2 cột (ảnh + tên + vai trò + CTA), lợi ích, vai trò, ảnh thêm, bài liên quan | M |

## Ma trận trạng thái
| Màn hình | Chưa login | Trống | Lỗi | Không ảnh |
|---|---|---|---|---|
| 1, 3 | không cần login | "Chưa có bài viết" + link Sản phẩm | Next error boundary mặc định | card vẫn có ô ảnh placeholder (giữ đều chiều cao) |
| 2 | không cần | — (404 chuẩn) | 404 | bỏ ảnh hero, thân bài lên trên |
| 4, 5 | không cần | — (danh mục cố định) | — | ô ảnh placeholder có logo mờ |

## Action → Expectation
| Hành động | User kỳ vọng thấy ngay sau đó |
|---|---|
| Bấm card bài | trang bài, tiêu đề + ảnh trên fold |
| Bấm Nhắn tin cho Page | Messenger mở tab mới, kèm UTM |
| Bấm Gọi | quay số 0254 359 6868 (sếp đổi 28/8, số trên sdvico.vn; trước là 1900 23 23 49) |
| Bấm chip chủ đề | trang hub, chip đó sáng |

## Quyết định đã chốt (không hỏi lại)
- Token RIÊNG cho shell công khai, scoped trong `.public-shell`, LUÔN SÁNG bất kể theme nội bộ (21/8: dark mode nội bộ làm chữ tiêu đề tàng hình trên thẻ trắng). Không đụng token toàn cục.
- Accent = xanh dương của logo hạ trầm `#1e5bb8` (logo 2 màu → chọn 1; đỏ trùng nghĩa cảnh báo nên không dùng). Neutral ramp slate. Đỏ chỉ xuất hiện trong chính logo.
- Font: system stack sẵn có của app. Radius: card 12, nút 8, chip full. Elevation: border + shadow nhẹ.
- Grid nội dung max-width 1200, gutter 24; thẻ bài 3 cột ≥ 1024, 2 cột ≥ 640, 1 cột mobile. Trang đọc max-width 720 (thân bài ~68 ký tự/dòng).
- Card bài: ô ảnh 16:10 luôn có (placeholder khi thiếu), tiêu đề tối đa 2 dòng, trích 3 dòng, meta = chip sản phẩm (chỉ khi khớp danh mục) + ngày.
- Chip chủ đề dùng TÊN NGẮN (≤ 3 từ, 1 dòng): Máy lọc nước SEA-40, Lọc dầu SF-50, Viettel S-Tracking, Thuraya MNB-01, Điện thoại XT-Pro, Dầu nhớt PVOIL.
- Badge vai trò sản phẩm 2 từ cố định: "Sản xuất" (nền accent nhạt) / "Phân phối" (nền neutral); hãng gốc ghi ở dòng meta.
- 1 primary/màn: chỉ khối CTA cuối bài và hero sản phẩm có nút đặc (Nhắn tin cho Page); nút Gọi luôn outline.
- Không câu thuyết minh kiểu AI trên UI: tiêu đề trang + 1 dòng phụ ngắn, hết.
- Trang vẫn nằm trên tên miền vercel.app — chưa phải SEO thật; muốn SEO phải gắn tên miền con sdvico.vn (việc người giữ tên miền).
