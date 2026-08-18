# ROADMAP MARKETING SDVICO

Chủ dự án: Bạn B, mảng Marketing của `sdvico-automation`.
Bám kế hoạch gốc: `docs/ke-hoach-7-ngay.md` ban hành 10/8/2026.
Ngày báo cáo: 18/8/2026. Cập nhật theo trạng thái thật ngày 17/8 (handoff phiên trước).

## 1. Tóm tắt một trang cho cấp trên

Khung 7 ngày đã dựng xong bộ máy chạy thật, đang đăng đều lên Facebook Page thật của SDVICO. Cỗ máy nội dung bốn bước, dây chuyền video hai bản (dọc TikTok và ngang Facebook, có intro/outro animation), token Facebook Page vĩnh viễn với quyền `read_insights`, bảng Đo lường tự kéo số Facebook (lượt xem, người xem, giây xem, follower) 30 phút một lần, con bot Kế hoạch định hướng thứ 4 và chủ nhật, Xưởng sản xuất có nút một chạm sinh video. Kho từ khóa 152 mục, hai skill nền `brand-voice` và `product-boundary` đã kiểm thử. Deploy live tại `sdvico-mktit.vercel.app` từ nhánh `ngay2-marketing` sang remote `mr/main`, commit hiện tại `c398a51`.

Bốn nhóm việc còn lại: đóng ba nguồn đo lường còn thiếu (Search Console, Analytics 4, YouTube Analytics), mở kênh YouTube tự đăng, nộp audit TikTok để mở public, và ép dữ liệu thật của Phòng Kinh doanh vào `CLAUDE.md` thay các mục `[CẦN XÁC NHẬN]`.

Roadmap năm tuần tới đi theo nhịp: ổn định và bàn giao, đo lường đầy đủ, SEO địa phương và dữ liệu thật, phễu Zalo, tối ưu theo số. Mỗi tuần một mục tiêu chính, deliverable đo được, chốt tiến độ Thứ Sáu.

## 2. Trạng thái ngày 18/8/2026, đối chiếu chỉ tiêu Nghiệm thu

Bảng bám nguyên chỉ tiêu Phần 4 kế hoạch gốc, cột "Trạng thái thật" đọc từ handoff 17/8 và commit `main` ở remote `mr`.

| Chỉ tiêu | Mức yêu cầu | Trạng thái thật 18/8 |
|---|---|---|
| Cỗ máy nội dung bốn bước brief, draft, duyệt, publish | Chạy sạch trên môi trường test | Chạy live, `packages/marketing/src/content.mjs` + Xưởng sản xuất |
| Content 7 cụm | Bám nhịp Phòng KD đề xuất | ✅ Đã có: checklist, glossary, tip, qa, engage, portrait, news. Portrait và news tự bật `needs_gov_review` |
| Skill brand-voice, product-boundary | Kiểm thử 20 đoạn có lỗi cài sẵn | ✅ Đã có, `test-skills.mjs` và `test-compliance.mjs` |
| Kho từ khóa | Tối thiểu 150 mục, phân nhóm ý định | ✅ 152 mục, `seed-keywords.mjs` |
| Rà SEO Playwright Lighthouse | Chạy được, xếp lỗi theo mức tác động | Có `seo-audit.mjs`, chưa chạy đều trên trang thật sdvico.vn |
| Bài viết website | 3 bài staging, 1 bài trang thật | Chưa có bài trên trang thật sdvico.vn |
| Bài Facebook | 5 bài Page nháp, 1 bài Page thật | ✅ Đã đăng đều đặn trên Page thật, token PAGE vĩnh viễn |
| Video hoàn chỉnh | 1 bản dọc, 1 bản ngang, không công khai | ✅ Dây chuyền `build-video.mjs` xuất cả hai bản, có intro/outro, đăng Facebook thật; TikTok đăng được nhưng bị chặn `SELF_ONLY` (chưa audit) |
| Đo lường Search Console, Analytics, FB, YouTube | Kéo về `mkt_metrics` | ✅ Facebook Insights: reactions, comments, shares, lượt xem, người xem, giây xem, follower Page. ❌ Search Console, Analytics 4, YouTube Analytics chưa có |
| Con bot Kế hoạch (bổ sung, không có trong kế hoạch gốc) | Không yêu cầu | ✅ Trang `/ke-hoach`, cron T4 và CN, đọc số Đo lường ra định hướng, có nút Áp dụng trọng số cho vòng xoay |
| Tác vụ theo lịch | Trên 95 phần trăm ngày 6 và 7 | Cron GitHub Actions 30 phút live, cần đo tỷ lệ thành công qua `run_log` |
| Chi phí mô hình | Dưới 3.000.000 đồng cả tuần | Chưa có báo cáo gộp, cần đo tuần 34 |
| Tuân thủ bảy điều cấm | Không vi phạm | ✅ `approval_queue` chặn tất cả bài trước khi đăng, `product-boundary` chặn nhận vơ phần mềm đối tác, `brand-voice` chặn bịa |

Kết luận: khung chạy tốt, đang có nội dung thật lên Page thật. Việc còn: đóng ba nguồn đo lường, mở YouTube tự đăng, nộp audit TikTok, ép dữ liệu Phòng KD.

## 3. Việc còn nợ

### Nhóm A, đưa lên sản xuất và bàn giao

1. Sáu điều kiện chuyển đổi mức T3 (Phần 5.4 kế hoạch gốc): đọc lại từng điều, ký xác nhận chéo, người ký không phải người viết code.
2. Đăng thật một chuỗi để đóng chỉ tiêu Nghiệm thu: một bài trên trang website sdvico.vn (đang thiếu), một video YouTube không công khai (đang thiếu). Facebook đã đăng đều đặn, chụp ảnh chứng minh cho báo cáo.
3. Runbook vận hành cho người không kỹ thuật: cách bật tắt cron, đọc `run_log`, dùng công tắc dừng khẩn ở `/van-hanh`, cách xử ba bài fail còn lại, cách xem `/api/fb-diag`.
4. Danh sách việc còn nợ chính thức, đính kèm bản giao mã.

### Nhóm B, kênh còn thiếu

1. **YouTube Data API**: dây chuyền video đã xuất bản ngang, cần thêm bước gọi YouTube Data API đăng chế độ không công khai. Nhánh dữ liệu và duyệt tái dùng luồng Facebook.
2. **TikTok audit**: đã có API POST tự đăng qua `publishContentToTikTok`, nhưng bị TikTok chặn `SELF_ONLY` vì app chưa audit. Cần nộp Developer app review để mở public. Ngoài code, việc pháp lý và hồ sơ.
3. **Reel avatar AI** (sếp yêu cầu): thử HeyGen free (có watermark) trước, sếp xem có ưng dạng đó không, mới quyết chi $29/tháng. Nếu OK, mình sẽ code nút upload video ngoài + đăng dạng Reel qua endpoint `/{page-id}/video_reels`.

### Nhóm C, đo lường

1. Kéo Google Search Console về `mkt_metrics` (thứ hạng nhóm service và transaction theo tỉnh).
2. Kéo Google Analytics 4 về `mkt_metrics` (lượt truy cập và hành vi trên trang dịch vụ).
3. Kéo YouTube Analytics về `mkt_metrics` (view, watch time từng video).
4. Đo cuộc gọi và tin nhắn về tổng đài 1900 23 23 49 theo nguồn. Thước đo ra tiền thật, phối hợp Phòng Kinh doanh gắn nguồn.

### Nhóm D, dữ liệu thật của Phòng Kinh doanh (đường găng)

1. Chốt danh mục thiết bị SDVICO thật sự đang phân phối, hãng, model, thông số chính. Cập nhật `CLAUDE.md` mục 2, thay các `[CẦN XÁC NHẬN]`.
2. Giá lắp đặt, cước thuê bao, phạm vi bảo hành.
3. Danh sách tỉnh đang thật sự phủ dịch vụ lắp đặt và hỗ trợ.
4. Quy trình chuẩn khi tàu mất kết nối (khớp bài mẫu Phần L của `day2.md`).
5. Bản ghi hoặc thống kê câu hỏi ở tổng đài, làm mỏ từ khóa đuôi dài cho SEO.

### Nhóm E, dọn kỹ thuật

1. Đưa 3 bài fail sáng 17/8 (`883b743a`, `652022a7`, `71d4cced`) về trạng thái đăng lại được.
2. Đo tỷ lệ thành công cron trong `run_log` theo tuần, ra số cho báo cáo Nghiệm thu.
3. Đóng hoặc xóa các nhánh cũ không dùng (hiện có nhiều nhánh `claude/*`, phần lớn đã lâu không đụng).
4. Ghi chi phí mô hình theo tuần, cảnh báo khi chạm 80 phần trăm hạn mức 3.000.000 đồng.

## 4. Roadmap năm tuần tới

Mỗi tuần một mục tiêu chính, ba tới bốn việc chính (không dàn trải), deliverable đo được.

### Tuần 34, từ 18 tới 24 tháng 8. Ổn định và bàn giao

Mục tiêu tuần: dọn sạch việc dở, có runbook chuyển giao, khởi động nhịp làm việc với Phòng Kinh doanh.

Việc chính (đúng ba mục):

1. **Xử ba bài fail sáng 17/8**. Vào `/noi-dung` tab Đã duyệt, xóa từng bài, quay lại Hàng đợi duyệt bấm Duyệt lại (token FB đã cập nhật PAGE thật, sẽ đăng OK). Chụp ảnh chứng minh.
2. **Hẹn buổi làm việc với Phòng Kinh doanh tuần này**, gửi thư giao việc trước Thứ Ba. Mục tiêu buổi: chốt danh mục sản phẩm thật, thay `[CẦN XÁC NHẬN]` trong `CLAUDE.md`. Đây là đường găng, mọi việc SEO và nội dung sau đều phụ thuộc.
3. **Runbook vận hành v1** ở `docs/runbook-marketing.md`: hướng dẫn một người của Phòng Kinh doanh đọc là làm được không cần Bạn B ngồi cạnh. Có: cách vào Hàng đợi, cách bấm Duyệt hoặc Từ chối, cách bật công tắc dừng khẩn, cách xem `/api/fb-diag`, cách đọc trang Kế hoạch.

Deliverable đo được: ảnh chụp ba bài đã đăng lại, biên bản buổi làm với Phòng KD, đường dẫn `docs/runbook-marketing.md`.

Rủi ro: Phòng Kinh doanh có thể chậm hẹn. Nếu chậm, mọi kế hoạch tuần 36 trở đi trượt theo. Phải đẩy sớm ngày nào bớt tắc ngày đó.

### Tuần 35, từ 25 tới 31 tháng 8. Đo lường đầy đủ + kênh YouTube

Mục tiêu tuần: đóng nhóm C (thêm hai nguồn đo) và một phần nhóm B (YouTube tự đăng).

Việc chính (bốn mục):

1. **Kéo Google Search Console** vào `mkt_metrics`. Cần: quyền Search Console cho tên miền chính, service account. Trang Đo lường thêm cột thứ hạng.
2. **Kéo Google Analytics 4** vào `mkt_metrics`. Cần: property ID và service account. Trang Đo lường thêm cột lượt truy cập trang dịch vụ.
3. **YouTube Data API tự đăng**. Nối vào cuối `build-video.mjs`: video ngang xuất xong tự đăng YouTube chế độ không công khai. Cần OAuth Google.
4. **Sáu điều kiện chuyển đổi T3** rà chéo và ký. Người ký không phải người viết code.

Deliverable đo được: một video YouTube tự đăng không công khai, dashboard `/do-luong` có số Search Console và Analytics 4 thật, biên bản ký chuyển T3.

Phụ thuộc: quyền OAuth cho ba dịch vụ Google.

### Tuần 36, từ 1 tới 7 tháng 9. SEO địa phương và dữ liệu Phòng Kinh doanh

Mục tiêu tuần: khởi động SEO tự động trên trang thật, đóng nhóm D nếu Phòng KD đã họp xong ở tuần 34.

Việc chính (ba mục):

1. **Rà SEO tự động chạy trên sdvico.vn thật**, ra báo cáo lỗi xếp theo mức tác động, sửa top 5 lỗi nặng nhất.
2. **Sinh trang SEO địa phương** cho 5 tới 10 tỉnh Phòng KD đã xác nhận thật sự phủ dịch vụ, bám 60 từ khóa giao dịch địa phương trong kho.
3. **Bắt đầu đo cuộc gọi tổng đài theo nguồn**, phối hợp tổng đài gắn nguồn (bằng landing khác nhau, hoặc UTM chuyển hướng).

Deliverable đo được: báo cáo SEO trước sau, số trang tỉnh đã đăng, cột nguồn cuộc gọi bắt đầu có số trong `mkt_metrics`.

Rủi ro: nếu tuần 34 Phòng KD chưa họp, tuần 36 không có nội dung thật để làm SEO địa phương. Phương án dự phòng: dùng dữ liệu tối thiểu đang có trong `CLAUDE.md` mục 2, chấp nhận đăng chậm hơn.

### Tuần 37, từ 8 tới 14 tháng 9. Phễu Zalo và audit TikTok

Mục tiêu tuần: mở kênh chăm sóc Zalo (theo Phần P của `day2.md`), khởi động hồ sơ audit TikTok.

Việc chính (ba mục):

1. **Zalo OA**: soạn báo giá sơ bộ và tin nhắn thân thiện, đẩy vào `approval_queue` loại `mkt_send_message`, người bấm gửi (bám điều cấm 1).
2. **Nộp hồ sơ audit TikTok Developer**: chuẩn bị video demo, mô tả use case, cam kết điều khoản. Đây là việc pháp lý, ngoài code.
3. **Lịch nhắc hậu mãi 1, 3, 6 tháng** cho khách đã mua: soạn máy, người bấm gửi.

Deliverable đo được: 20 tin nhắn Zalo đã duyệt và gửi, hồ sơ TikTok đã nộp có ID reference, luồng nhắc hậu mãi có ít nhất 3 khách chạy.

Phụ thuộc: tài khoản Zalo OA của SDVICO, danh sách khách đã đồng ý nhận (Nghị định 13/2023), người phụ trách chăm sóc.

Ghi chú: email B2B đẩy sang giai đoạn hai (không cùng tuần với Zalo, kẻo dàn trải).

### Tuần 38, từ 15 tới 21 tháng 9. Đo và tối ưu

Mục tiêu tuần: đọc số ba tuần đầu chạy thật, chỉnh nội dung theo cái ra liên hệ.

Việc chính (ba mục):

1. **Báo cáo hai tuần**: nhóm nội dung nào kéo cuộc gọi, nhóm nào chỉ có view. Bám dữ liệu từ trang Kế hoạch.
2. **Điều chỉnh trọng số vòng xoay** theo kết quả: nhóm ra liên hệ tần suất cao hơn, nhóm chỉ view giảm hoặc đổi góc.
3. **Chốt danh sách giai đoạn hai**: A/B test, cá nhân hóa, email B2B, onboarding, tích hợp SDWork. Đây là các mục Phần 0 kế hoạch gốc đã cắt khỏi 7 ngày, giờ mới quay lại.

Deliverable đo được: báo cáo đọc số v1, ảnh chụp trang Kế hoạch tuần 39 sau khi Áp dụng trọng số mới, danh sách đề mục giai đoạn hai kèm ước lượng công.

## 5. Rủi ro và phụ thuộc

Đường găng: **dữ liệu Phòng Kinh doanh**. Nợ từ Ngày 1 kế hoạch gốc, chậm ngày nào là chậm ngày đó cho tuần 36 trở đi.

Rủi ro thứ hai: **cấp quyền OAuth Google** cho Search Console, Analytics 4, YouTube Data. Ba dịch vụ ba luồng OAuth, chậm quyền là chậm tuần 35.

Rủi ro thứ ba: **người duyệt cấp quản lý** cho nội dung chạm quy định IUU, Cục Thủy sản, Kiểm ngư (portrait và news tự bật `needs_gov_review`). Không có người duyệt thì nhóm bài quy định treo, mất cơ hội lan.

Rủi ro thứ tư: **chi phí mô hình**. Chưa có báo cáo gộp. Bật ngưỡng cảnh báo 80 phần trăm hạn mức 3.000.000 đồng cả tuần trong tuần 34.

Rủi ro thứ năm: **tài khoản Facebook Page thật**. Vi phạm chính sách có thể mất Page. Bám bảy điều cấm, `approval_queue` chặn bài trước khi đăng, không phá rào.

Rủi ro thứ sáu, kỹ thuật: **nhiều session Claude song song sửa cùng repo**. Handoff ghi rõ file bị revert lạ. Trước khi làm việc lớn, kiểm bằng `git log --oneline -5` xem có phiên khác vừa commit không.

## 6. Cách báo cáo hàng tuần

Thứ Sáu 16 giờ 30, chốt tuần một trang. Bốn phần:

1. **Đã xong trong tuần**, đối chiếu deliverable tuần đó của roadmap.
2. **Đang làm**, dự kiến xong lúc nào.
3. **Vướng**, cần cấp trên hoặc bộ phận khác gỡ.
4. **Số liệu định lượng**: bài đăng, cuộc gọi về, view, chi phí mô hình. Lấy từ `/do-luong` và `/ke-hoach`.

Đính kèm cố định: đường dẫn commit hoặc PR đã merge trong tuần, ảnh chụp bài đăng thật, bảng `mkt_metrics` tuần.

## 7. Phụ lục, đối chiếu roadmap và tài liệu gốc

Roadmap này bám ba tài liệu, đọc kèm khi cần chi tiết:

- Kế hoạch gốc 7 ngày: `docs/ke-hoach-7-ngay.md`, đặc biệt Phần 4 nghiệm thu, Phần 5 môi trường thử nghiệm, Phần 6 nguyên lý.
- Chiến lược và thực thi Marketing: `day2.md` và `day2-marketing-strategy.md`, đặc biệt Phần B kiến trúc, Phần F nhịp đăng, Phần P phễu B2C B2B.
- Bộ não dùng chung: `CLAUDE.md`, giữ bảy điều cấm và chuẩn giọng văn.

Handoff nội bộ trạng thái ngày 17/8: trong memory `sdvico-handoff-17-08`. Tham chiếu khi cần biết chi tiết deploy, token, cạm bẫy.

Cập nhật lần đầu: 18/8/2026.
