# PLAN: UI mượt (2/10)

Mục tiêu Thanh giao 2/10: "tối ưu giao diện cho nó mượt mà", sếp chuẩn bị đóng gói hệ thống chào bán đối tác. App: `apps/approval-ui`.
Plan do Fable lập, Sonnet thi công. Nền 832de35.

## Hiện trạng đã khảo sát

1. Bấm menu bị đứng chờ server render vì các trang đều force-dynamic. (Khi thi công phát hiện `app/loading.tsx` gốc ĐÃ có từ 17/9, phủ mọi route con, nên không cần tạo loading.tsx cho từng route.)
2. Blog công khai: `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`, `app/blog/chu-de/[slug]/page.tsx` khai báo cả `dynamic = 'force-dynamic'` lẫn `revalidate`. force-dynamic đè revalidate nên khách lạnh chịu cold-start (đo 2/10: 12,9 giây lần đầu).
3. 27 thẻ `<img>` thô ở 13 file, ít cái lazy.
4. `app/auto-refresh.tsx` gọi router.refresh() mỗi 30 giây kể cả khi tab ẩn.

## Việc làm

- U1. Skeleton điều hướng. Kết quả: bỏ qua việc tạo 12 file loading.tsx vì root loading.tsx đã có; chỉ thêm `prefers-reduced-motion` cho hiệu ứng nhấp nháy.
- U2. Blog hết cold-start. Bỏ force-dynamic ở 3 file blog, giữ revalidate 300/300/600. Phát hiện khi build: bỏ dòng này CHƯA đủ, vì `getServerClient()` ép `cache: 'no-store'` cho mọi fetch Supabase, mà một fetch no-store làm trang thành dynamic (route vẫn ƒ). Cách xử lý: thêm `getPublicClient()` (không ép no-store) trong `lib/supabase-server.ts`, cho `loadAdsConfig` nhận client tùy chọn, thêm `generateStaticParams` cho `/blog/[slug]` (thiếu nó, trang có tham số không được dựng sẵn). Hàng đợi duyệt và dữ liệu ứng viên vẫn dùng `getServerClient`.
- U3. Ảnh. Thêm `loading="lazy" decoding="async"` cho ảnh trong lưới, thẻ, modal. Ảnh đầu trang (root-shell, hero bài blog) chỉ thêm `decoding="async"`. Kích thước thẻ đã cố định bằng CSS (.card-media, .pub-card-media aspect-ratio) nên không đổi bố cục.
- U4. auto-refresh thông minh. Tab ẩn thì không refresh, ghi "nợ"; tab hiện lại mà quá hạn (tính theo Date.now) thì refresh một lần rồi đặt lại đồng hồ; chưa quá hạn thì chỉ chỉnh số đếm.
- U5. /noi-dung tách Suspense: BỎ QUA. Trang noi-dung/page.tsx là một khối dữ liệu liền (searchParams chọn tab, nhiều truy vấn dùng chung cho cả bảng lẫn modal), tách ra phải xáo trộn data flow.

## Ràng buộc

Văn phong tiếng Việt, không gạch dài và mũi tên. Không thêm dependency. Không đổi hành vi duyệt, đăng, dữ liệu.

## Verify

`tsc --noEmit` (TypeScript 5.8.2 của app) sạch. `next build` xanh với env giả (SUPABASE_URL trỏ cổng đóng): /blog tĩnh 300 giây, /blog/[slug] và /blog/chu-de/[slug] SSG.

## Rủi ro ghi nhận

- Blog công khai chậm nhất 5 đến 10 phút so với dữ liệu (đúng ý revalidate đã khai báo từ trước). Bài rút (soft-delete) có thể còn hiện tối đa 5 phút.
- Nếu Supabase lỗi đúng lúc dựng lại trang, trang rỗng có thể được lưu tối đa 5 phút (hành vi tương đương cũ vì loadPublicPosts nuốt lỗi).
