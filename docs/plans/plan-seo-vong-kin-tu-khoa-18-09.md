# Plan: vòng kín SEO từ khóa theo góp ý sếp 18/9 (chấm điểm, chọn từ, viết bài, kiểm index)

> Lập 18/9/2026 (Fable) từ góp ý sếp qua Thanh: "chỉ số SEO, từ khóa nội bộ, tính điểm từ khóa
> để kiểm tra coi ai kiếm nhiều hơn, xác định từ khóa để viết bài, tạo bài, kiếm Google index".
> Người thi công: Sonnet, không có transcript, chỉ có repo và plan này. Việc A làm được ngay;
> việc B viết sẵn code nhưng chỉ chạy thật khi anh Thành cấp quyền Search Console.

## 1. Hiện trạng đã khảo sát 18/9 (không phải đoán)

- Kho từ khóa `mkt_keywords` có 192 dòng (cột: keyword, intent, landing_url, source, priority).
  **191/192 chưa có bài nào.** Nhóm ưu tiên 3 chưa viết nhiều nhất là cụm dịch vụ giám sát
  hành trình: "thiết bị giám sát tàu cá mất kết nối phải làm sao", "gia hạn cước...", "sửa...".
- Bài đã đăng gắn `brief.keyword` nhưng giá trị là TÊN NHÓM SẢN PHẨM hoặc "Bài content"
  (rotate-run.mjs đặt vậy), không phải từ khóa trong kho. Vì thế không nối được bài với kho.
- Máy ĐÃ CÓ hàm sinh bài theo từ khóa: `generateForKw` trong `apps/approval-ui/app/generate-action.ts`.
  Bài dạng article, risk none thì `status='published'` tự lên blog (quyết định 3/9). Hiện chỉ
  chạy khi bấm tay, không có vòng tự động.
- Đo lường: `mkt_metrics` chỉ có số Facebook, TikTok, YouTube theo `entity_ref`. KHÔNG có lượt
  xem blog. Điểm SEO hiện có là Lighthouse (`packages/marketing/src/seo-audit.mjs`, Thứ 2 hằng
  tuần, lần gần nhất 14/9: SEO 100, hiệu năng 80, cảnh báo LCP).
- Search Console: script kiểm `npm run gsc:kiem` (packages/marketing/src/kiem-search-console.mjs).
  Chạy 18/9: **API đã bật, tài khoản dịch vụ sdvico-kho-tu-lieu@sdvico-youtube.iam.gserviceaccount.com
  CHƯA được thêm vào property sdvico.vn.** Việc của anh Thành, không phải code.
- Index: sitemap có ở `/api/public/sitemap.xml`, canonical trỏ sdvico.vn. Chưa kiểm được bài nào
  Google đã index. Lưu ý facts: Google đã TẮT sitemap ping từ 2023; Indexing API chỉ dành cho
  tin tuyển dụng và sự kiện phát sóng, KHÔNG dùng cho blog thường. Đường đúng là sitemap đăng ký
  trong GSC property + URL Inspection API (cần quyền như trên).

## 2. Việc A (làm ngay, không chờ ai): vòng viết bài theo kho từ khóa

Mục tiêu: mỗi tuần kho từ khóa mòn dần từ 191 xuống, mỗi bài blog gắn đúng 1 từ khóa của kho.

1. Script mới `packages/marketing/src/blog-tu-khoa.mjs`:
   - Chọn N=3 từ khóa mỗi lần chạy: ưu tiên `priority` cao, chưa có bài (`mkt_content.brief->>keyword_id` rỗng
     với id đó), intent thuộc thong_tin/giao_dich đều được; cụm dịch vụ giám sát hành trình đi trước
     (giá trị tra cứu cao, ít đối thủ).
   - Gọi lại đúng đường sinh bài article risk-none tự đăng đang có (tái dùng generateForKw hoặc tách
     lõi của nó sang lib dùng chung; KHÔNG chép code thành 2 bản).
   - Ghi vào brief: `keyword_id`, `keyword` nguyên văn từ kho. Ghi `run_log` task `mkt.blog_keyword`.
   - Nội dung phải qua guard hiện có (product-guard, giá úp mở, điều cấm 3: từ khóa dính IUU,
     Cục Thủy sản, quy định nhà nước thì KHÔNG auto-publish, để review).
2. Lịch: thêm vào cron sáng hằng ngày hiện có (cùng chỗ gọi seo_audit/rotate) 1 lượt, hoặc GitHub
   Actions schedule riêng 6h VN. 3 bài/ngày là 21 bài/tuần, vừa với quota Gemini.
3. Trang `/seo` (apps/approval-ui/app/seo/page.tsx): khối "Kho từ khóa" thêm 2 cột: số bài đã viết,
   bài gần nhất (link). Nguồn: đếm mkt_content theo brief->>keyword_id.
4. DoD: chạy 2 ngày liên tiếp, mỗi ngày 3 bài blog mới đúng từ khóa kho, run_log ok, /seo hiện cột đếm,
   không bài nào dính IUU tự đăng.

## 3. Việc B (code sẵn, bật khi anh Thành thêm quyền): điểm từ khóa từ Google

Trả lời đúng câu sếp "ai kiếm nhiều hơn": số Google thật, không phải đoán.

1. Migration bảng `mkt_seo_queries`: id, query text, page text, clicks int, impressions int,
   position numeric, window_start date, window_end date, pulled_at timestamptz.
   Index (query, window_end). RLS staff như các bảng mkt khác.
2. Script `packages/marketing/src/gsc-keo-so.mjs` (dùng chung auth với kiem-search-console.mjs):
   Search Analytics query property sdvico.vn, 28 ngày gần nhất, dimensions query + page, limit 5000,
   upsert vào bảng trên. Chạy cùng cron Thứ 2 với seo_audit, ghi run_log `mkt.gsc_pull`.
   Chưa có quyền thì exit code 0 kèm run_log skipped lý do "chờ quyền GSC", KHÔNG error đỏ.
3. Điểm từ khóa (tính lúc render /seo, khỏi thêm bảng): score = clicks*10 + impressions/10, kèm position.
   Bảng xếp hạng 2 chiều:
   - Từ khóa Google ĐÃ có impressions nhưng kho chưa có bài -> hàng đợi viết (đổ vào việc A trước).
   - Từ khóa có bài nhưng position > 10 -> gợi ý viết sâu thêm/sửa tiêu đề.
4. Kiểm index: script đếm qua URL Inspection API cho 52+ bài blog (quota 2000/ngày, dư), hiện
   trên /seo: n bài đã index / m bài. Chạy tuần.
5. DoD: sau khi anh Thành thêm SA, chạy `npm run gsc:kiem` thấy property, chạy gsc-keo-so đổ dữ
   liệu thật, /seo hiện bảng điểm và số bài đã index.

## 4. Việc người (không phải code)

- **Anh Thành (chặn việc B):** Search Console property sdvico.vn -> Cài đặt -> Người dùng và quyền ->
  Thêm `sdvico-kho-tu-lieu@sdvico-youtube.iam.gserviceaccount.com`, quyền Đầy đủ (Full). Sau đó
  kiểm luôn sitemap: mục Sơ đồ trang web, nếu chưa có thì nộp URL sitemap của blog.
- **Thanh:** khi báo cáo sếp, nói rõ giai đoạn 1 (việc A) là điểm nội bộ và phủ kho từ khóa,
  giai đoạn 2 (việc B) mới là "ai kiếm nhiều hơn" theo số Google, đang chờ quyền.

## 5. Bẫy cho người thi công

- Repo có 2 bản content lib (`apps/approval-ui/lib/gen/` và `packages/marketing/src/`), sửa lõi sinh
  bài thì xem bản nào đang được generate-action dùng, đừng sửa nhầm bản chết.
- Hook pre-commit: migration mới bắt buộc sửa `docs/app-map/database.md` cùng commit; code approval-ui
  cần dòng re-verified trong `docs/app-map/README.md`. CRLF: sau commit chạy `git checkout -- docs/app-map`.
- Migration áp bằng `node packages/marketing/src/db-apply.mjs supabase/migrations/<file>.sql`
  (cần DATABASE_URL trong .env gốc, đã chạy OK 13/9).
- Bài blog tự đăng phải né: giá chính xác (chỉ 9,X / 3X / 4X triệu), "nhiều tàu đã dùng" khi chưa có
  khách thật, mô tả phần mềm đối tác như của SDVICO (điều cấm 4, 5).
- Deploy = push origin main, đồng bộ ngay2-marketing, ff checkout chính (diff file M trước khi checkout).

## 6. Việc C (đã chốt 19/9, làm khi bảng Google có ~2 tuần số): nối BOSS với số Google

- BOSS (apps/approval-ui/lib/plan.ts) hiện KHÔNG đọc mkt_seo_queries (soát 19/9). Nối 2 chỗ:
  1. Lúc soạn kế hoạch tuần: đọc top 10 query theo score = clicks*10 + impressions/10 của 28 ngày
     gần nhất, đưa vào phần knowledge/publicHighlights làm nguồn gợi hướng bài (đánh dấu nguồn
     "Google Search"); query dính giám sát/VMS/IUU vẫn phải qua duyệt cấp quản lý như mọi hướng khác.
  2. AI Đánh giá (learn-weekly): bài blog có brief.keyword_id được cộng điểm theo clicks của các
     query khớp trang bài đó (join mkt_seo_queries.page với slug bài), để trọng số sản phẩm phản
     ánh cả kênh tìm kiếm chứ không chỉ Facebook.
- Điều kiện bắt đầu: anh Thành đã cấp quyền SA, gsc-keo-so chạy ok tối thiểu 2 lượt Thứ 2 (bảng có
  2 cửa sổ 28 ngày), GSC_SITE_URL đã chốt bằng npm run gsc:kiem và đặt secret.
- KHÔNG làm sớm khi bảng rỗng: BOSS đọc bảng rỗng chỉ thêm nhánh chết khó test.
