> Load khi: task chạm UI trang công khai /blog, /blog/[slug], /blog/chu-de/[slug], /san-pham, /san-pham/[slug] (shell công khai trong root-shell.tsx)
covers: apps/approval-ui/app/blog, apps/approval-ui/app/san-pham, apps/approval-ui/app/root-shell.tsx
<!-- re-verified: 2026-10-03 (3) - root-shell.tsx chi them nut Bat/Tat che do demo o chan sidebar NOI BO + dai .demo-bar truoc .content noi bo; shell cong khai (blog, san-pham) KHONG doi. -->
<!-- re-verified: 2026-10-03 (2) - Nhan san pham tu lam doi "San xuat" + "Boi SDVICO" thanh "San pham SDVICO" (dung chu chot 21/9 sep Hoa + sep Tien); dong Vai tro trang chi tiet lay ProductItem.vaiTro rieng tung san pham (SEA-40 nghien cuu va san xuat, SF-50 San pham SDVICO cung cap va lap dat), het in chung. -->
<!-- re-verified: 2026-10-03 - Tieu de tab /blog, /blog/[slug], /blog/chu-de/[slug](+trang), /san-pham, /san-pham/[slug] doi " — SDVICO" thanh " | SDVICO" (luat van phong: khong gach dai). Bo cuc, shell, canonical, ISR khong doi. -->
<!-- re-verified: 2026-10-02 (8) - 3 FIX AUDIT LAN 3: canonical san pham + chu de blog ve SELF (lib/seo.ts selfCanonicalUrl; sdvico.vn la SPA cung 1 shell, bai blog van canonical sdvico.vn); hotline public MOT NGUON lib/public-contact.ts (0939 243 222, CTA cuoi trang san pham + privacy/terms/xoa-du-lieu het 1900); auto-refresh khong dong modal dang mo. Plan docs/plans/plan-3-fix-audit-lan3-02-10.md -->
<!-- re-verified: 2026-10-02 (7) - HOTLINE PUBLIC 0939 243 222 + MESSENGER PAGE CHINH (Thanh chot 2/10 sau audit): root-shell header/footer public + contact-buttons doi het 0254 359 6868 sang 0939 243 222 (trung bai ban/caption); ads-config messengerUrl fallback va placeholder /quang-cao doi sdvico.tbtc sang facebook.com/SDVICOVN. -->
<!-- re-verified: 2026-10-02 (5) - DOT C PUBLIC: /san-pham + /san-pham/[slug] ISR (bo force-dynamic, getPublicClient); canonical san pham + chu de blog ve sdvico.vn; JSON-LD Product khong co offers/gia, them og:image + twitter card; danh sach blog va trang chu de phan trang 18 bai (them nut "Xem them bai viet", link Trang truoc, route /blog/trang/N, /blog/chu-de/<slug>/trang/N, trang >= 2 noindex follow). Bo cuc luoi/the khong doi. -->
<!-- re-verified: 2026-10-02 (6) - DOT A TRUST: root-shell.tsx them /xoa-du-lieu vao regex isPublic (dung shell cong khai nhu /privacy /terms, khong hamburger/bot noi bo); app/not-found.tsx moi (404 tieng Viet, link /blog va /san-pham); shell cong khai /blog, /san-pham KHONG doi, hotline 0254 giu nguyen (quyet dinh sep 28/8). -->
<!-- re-verified: 2026-10-02 (3) - root-shell.tsx CHI doi chu slogan duoi logo o sidebar NOI BO thanh "Nghe ca thinh vuong" (viet hoa chu dau); shell cong khai /blog, /san-pham KHONG doi. -->
<!-- re-verified: 2026-10-02 - UI MUOT: /blog, /blog/[slug], /blog/chu-de/[slug] bo force-dynamic, doc du lieu qua getPublicClient() (khong no-store) => ISR 5 den 10 phut, [slug] them generateStaticParams; <img> trong post-card, san-pham, root-shell them loading=lazy/decoding=async (root-shell + hero bai chi decoding). Bo cuc, noi dung, meta, JSON-LD KHONG doi. -->
<!-- re-verified: 2026-10-02 (4) - root-shell.tsx them menu truot + thanh .m-bar cho shell NOI BO duoi 768px (responsive mobile dot 1); shell cong khai /blog, /san-pham, /privacy, /terms KHONG doi. -->
<!-- re-verified: 2026-09-15 (2) - DOT 8: root-shell.tsx AskBotFab doi sang next/dynamic (ssr:false) — shell cong khai KHONG doi (fab chi render o shell noi bo); layout.tsx ads config cache 5 phut (Pixel/GA4 doi o /quang-cao ap sau toi da 5 phut). -->
<!-- re-verified: 2026-09-15 - DOT 4 (kho tu lieu Google Drive): app/san-pham/page.tsx + app/san-pham/[slug]/page.tsx + lib/seo.ts + lib/cover-image.ts doi getPublicUrl -> assetPublicUrl (lib/asset-url.ts) de anh tren Drive ("gdrive:<id>/<ten>") hien duoc; giao dien trang cong khai KHONG doi. -->
last_verified: 2026-10-03
ttl_days: 90
<!-- re-verified: 2026-09-09 chieu - root-shell.tsx CHI them <AskBotFab /> canh <BotChip /> o nhanh SHELL NOI BO (sau isPublic); shell cong khai /blog, /san-pham, /privacy, /terms KHONG doi, khong co nut bot o trang cong khai. -->
<!-- re-verified: 2026-09-07 toi - Man 1 (/blog) + man 2 (/blog/[slug]) CHI doi meta: canonical + JSON-LD @id tro sdvico.vn/blog(/<slug>) (publicBlogUrl trong lib/seo.ts), og:url giu nguyen URL app. Giao dien, bo cuc, CTA, the bai KHONG doi. Doi chieu lai: man 1 chip chu de + luoi 3/2/1, man 2 tieu de + anh tren fold + 1 CTA + 3 bai khac van dung code. -->
<!-- re-verified: 2026-09-03 - Man danh sach blog: tieu de the dung cardTitle (cat tai cau dau, bo duoi keu goi "Lap ngay/Goi ngay..."), title day du van o aria-label/alt + trang bai le. Hang chip them "Chuyen nghe" dau hang -> /blog/chu-de/chuyen-nghe-bien (chu de ao gom bai content, khong link trang san pham). Cac man khac khong doi. -->
<!-- re-verified: 2026-09-03 - Giam can egress (docs/plans/plan-giam-can-egress.md): post-card.tsx, blog/[slug]/page.tsx, san-pham/page.tsx, san-pham/[slug]/page.tsx doi src anh tu URL Supabase thang sang optImg()/optImgAbs() (di qua /_next/image cua Vercel). Alt text, bo cuc, hanh vi the/hero/gallery KHONG doi - chi doi nguon anh de giam Cached Egress Supabase. -->
<!-- re-verified: 2026-08-30 - Audit UI muc L6: MOI the blog co chip danh muc — khong khop danh muc san pham thi chip chung "Bai viet" (truoc chi vai the co chip, nhin nhu loi). hideProduct giu nguyen hanh vi (trang chu de van an chip). -->
<!-- re-verified: 2026-08-30 - Audit UI muc M6 (28 anh blog thieu alt): post-card anh cover alt={post.title} (truoc alt="" du la anh noi dung), san-pham card alt={p.name}; logo placeholder giu alt="" (trang tri). productOf trong lib/seo.ts doi fallback (het tra nguyen tieu de) — blog card KHONG doi hanh vi vi da loc qua displayProduct/catalogItemOf tu truoc. -->
<!-- re-verified: 2026-08-29 - Audit bao mat muc 6: 3 trang blog/[slug], blog/chu-de/[slug], san-pham/[slug] doi JSON.stringify(jsonLd) sang safeJsonLd (thoat < chong XSS). Thay doi vo hinh voi nguoi xem va Google — khong dong nao cua spec giao dien doi. -->
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
