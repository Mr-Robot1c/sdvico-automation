# PLAN: Đợt C theo audit production 2/10, trang sản phẩm công khai nhanh lên và SEO kỹ thuật

Audit production đo: 6 trang /san-pham sau 6,5 giây vẫn chỉ skeleton, một trang 15 giây mới có nội dung. Blog đã được chữa đúng bệnh này ở 90ddb56 (force-dynamic đè revalidate, getServerClient ép no-store): /blog từ 12,9s còn 0,34s. Áp cùng bài thuốc cho sản phẩm và vá SEO kỹ thuật. Nền 32d1ace + 90ddb56. Plan do Fable lập, Sonnet thi công.

## C1. /san-pham và /san-pham/[slug] render máy chủ + ISR
Nguyên nhân chậm thật: cả hai trang khai báo `force-dynamic` (đè `revalidate`) và đọc Supabase qua `getServerClient()` (ép `cache: 'no-store'`), nên mỗi lượt xem chạy lại 2 đến 3 truy vấn (brand_assets 300 dòng, mkt_posts + mkt_content 500 bài, app_config) trên hàm lạnh. Sửa: dùng `getPublicClient()`, bỏ force-dynamic, giữ `revalidate = 600`, `[slug]` giữ `generateStaticParams`, `loadAdsConfig(getPublicClient())`. Không cookies/headers. H1, mô tả, ảnh, CTA đã nằm trong HTML server render.

## C2. Canonical về https://sdvico.vn
`lib/seo.ts` thêm `publicSiteOrigin()` (env `PUBLIC_SITE_ORIGIN`, mặc định https://sdvico.vn) và `canonicalUrl(path)`. Áp cho /san-pham, /san-pham/[slug], /blog/chu-de/[slug]. og:url giữ trang này như bài blog.

## C3. SEO sản phẩm
- `openGraph.images` = ảnh sản phẩm đầu tiên (URL tuyệt đối qua `optImgAbs`), thêm twitter card.
- JSON-LD Product: name, image, description, brand. KHÔNG có `offers` (bản cũ có Offer InStock không giá; bỏ hẳn). Lý do: chính sách giá 9/9, giá công khai chỉ ghi mốc úp mở, số chính xác không lên bài công khai.

## C4. Blog list phân trang
18 bài mỗi trang. Dùng đường dẫn `/blog/trang/[n]` thay cho `?trang=N` vì `searchParams` ép trang thành dynamic và mất ISR. Trang chủ đề cũng phân trang: `/blog/chu-de/[slug]/trang/[n]`. Component dùng chung: `app/blog/pager.tsx` (nút "Xem thêm bài viết", "Trang trước", rel next/prev), `blog-list-view.tsx`, `chu-de/topic-hub-view.tsx`. Trang >= 2: canonical tự trỏ, noindex + follow (sdvico.vn không có các đường dẫn này).

## Ràng buộc đã giữ
Chỉ trang public. Không đụng dữ liệu, không dependency mới, không giá chính xác trong metadata/schema.
