# App Map: bản đồ hệ thống sdvico-automation

> Đọc khi cần biết luồng chạy và thành phần của một mảng. Đây là trang chỉ mục.
> Nguồn sự thật khác: `CLAUDE.md` cho bảy điều cấm và giọng văn, `supabase/migrations` cho lược đồ, `docs/ke-hoach-7-ngay.md` cho kế hoạch gốc.
covers: packages/core, apps/approval-ui, supabase/migrations
last_verified: 2026-08-12
ttl_days: 180
<!-- re-verified: 2026-08-12 - approval-ui UI redesign (sidebar chia 5 nhom, eye modal, /san-xuat moi). Luong approval_queue va cac bang du lieu KHONG doi. Nut Xong o /san-xuat van di qua approval_queue kind=mkt_publish_content dung dieu cam 1. -->
<!-- re-verified: 2026-08-12 - Hang doi duyet gio resolve payload.assets (id) ra public URL, hien anh/video tren card va modal. /san-xuat upload doi tu server action sang browser PUT thang len Storage qua signed URL (vuot gioi han 4,5MB Vercel). Them action createAssetUploadUrl + registerAsset. Luong approval_queue, kind=mkt_publish_content, va cac bang du lieu KHONG doi. -->
<!-- re-verified: 2026-08-12 - Them build marker o page.tsx de trigger deploy Vercel. Khong doi logic. -->
<!-- re-verified: 2026-08-12 - /noi-dung modal: them hien anh/video tu brief.assets, va sua .modal text-align:left (truoc bi lech phai do .col-actions text-align:right). asset-uploader: them thanh tien trinh % (XHR) + bao loi 413. Luong du lieu KHONG doi. -->
<!-- re-verified: 2026-08-12 - Bo nut Sinh noi dung (GenerateButton) khoi / va /noi-dung. Doi nhan rui ro red: "Co do..." -> "Can xem xet hoac uu tien". /noi-dung them loc trang thai (Cho duyet/Da duyet/Da tu choi) suy tu approval_queue.status theo payload.content_id. Media modal doi sang kieu Facebook (xep doc, full-width, can giua). Xuong san xuat: Sinh text nhan them assetHint (ten file anh/video da chon) de AI viet an khop. decideForm revalidate them /noi-dung. Luong approval_queue va cac bang KHONG doi. -->
<!-- re-verified: 2026-08-12 - Modal (/ va /noi-dung): chuyen media xuong CUOI, sau noi dung (chu tren, anh/video duoi dung kieu Facebook). Chi doi thu tu render + margin .modal-media, khong doi du lieu. -->
<!-- re-verified: 2026-08-12 - Xuong san xuat them "Xuong anh": tim anh Unsplash (searchUnsplash), chen anh (saveUnsplashAsAsset), va ghep banner (createBannerFromBackground) = anh san pham that + nen Unsplash/gradient + tieu de + hotline, dung @napi-rs/canvas + font Be Vietnam Pro nhung base64 (lib/gen/banner.mjs, fonts-data.mjs). Anh moi vao brand_assets, gan vao bai qua form. Can env UNSPLASH_ACCESS_KEY. next.config: serverComponentsExternalPackages ['@napi-rs/canvas']. Giu nguyen san pham, khong bia (dieu cam 5). Luong approval_queue KHONG doi. -->
<!-- re-verified: 2026-08-12 - Xuong anh chuyen xuong duoi khung anh/video (tren Soan bai viet). Tao banner xong tu dong sinh text: onAttach meta.banner -> runGenerate voi tu khoa = tieu de/keyword hoac cleanAssetName(ten anh san pham). Kho tu lieu (/tu-lieu): bam anh/clip mo hop thoai xem lon (AssetViewer). Khong doi du lieu. -->
<!-- re-verified: 2026-08-12 - Kho tu lieu (/tu-lieu): them doi ten tu lieu (renameAsset). Ten title cung la goi y AI sinh text. Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Bo hoan toan ghep banner (createBannerFromBackground, banner.mjs, fonts-data.mjs, @napi-rs/canvas, serverComponentsExternalPackages). Xuong anh chi con tim + chen anh Unsplash truc tiep (searchUnsplash, saveUnsplashAsAsset). Nut Sinh text: neu chua co keyword/title thi lay ten anh (cleanAssetName) lam nguon. Ly do: ghep code chi dat anh len (trong chat), khong hoa canh; nguoi dung chon dung anh san/Unsplash. -->


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
<!-- re-verified: 2026-08-12 - Fix nut Sinh text: disabled cu chi cho bam khi co keyword/title, gio cho bam khi da chon anh/video (de sinh text theo ten anh). Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Ghep 2 anh dung remove.bg: cat nen anh san pham (removeBgCutout, REMOVE_BG_API_KEY) roi dat len nen Unsplash co bong do (banner.mjs buildBanner nhan cutoutBuffer). Nut "Ghep san pham" tren moi anh Unsplash. Ghep xong tu sinh text theo ten anh. Canvas + font base64 tro lai. Free tier remove.bg do phan giai preview. Dieu cam 5: chi cat nen, khong ve lai. -->
<!-- re-verified: 2026-08-12 - Fix doi ten tu lieu: form thieu input hidden id nen renameAsset khong chay; da them. Ghep san pham: dat ten anh ghep + tieu de banner theo ten anh san pham (mo ta ro). Chon anh o Khung anh: hien ten anh + dien tu khoa trong tam (cleanAssetName) neu chua co, san sang Sinh text. Khong doi luong. -->
