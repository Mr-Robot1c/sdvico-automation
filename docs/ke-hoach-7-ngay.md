# GIAO VIỆC 7 NGÀY: TỰ ĐỘNG HÓA TUYỂN DỤNG VÀ MARKETING BẰNG CLAUDE CODE

Đơn vị: Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)
Người giao: Phó Giám đốc phụ trách Chiến lược và Công nghệ
Thực hiện: 02 kỹ sư mới tốt nghiệp (Bạn A phụ trách Tuyển dụng, Bạn B phụ trách Marketing)
Thời gian: 07 ngày, không gia hạn
Ngày ban hành: 10/8/2026

---

## PHẦN 0. ĐIỀU KIỆN ĐỂ 7 NGÀY LÀ KHẢ THI

Bảy ngày đủ để dựng xong bộ khung chạy được thật, không đủ để tối ưu. Ba điều kiện bắt buộc, thiếu một là không cam kết tiến độ:

1. Môi trường thử nghiệm và tài khoản test được cấp trước 09 giờ ngày thứ nhất. Tài khoản thật của công ty cấp trước 09 giờ ngày thứ sáu. Danh sách ở Phần 8. Chậm một ngày cấp quyền là chậm một ngày giao hàng.
2. Hai bạn được giải phóng hoàn toàn khỏi việc khác trong bảy ngày.
3. Có một người của Phòng Nhân sự và một người của Phòng Kinh doanh trực sẵn để trả lời nghiệp vụ trong ngày, không hẹn lịch.

Phạm vi cắt bỏ có chủ đích, làm ở giai đoạn sau: tối ưu thứ hạng từ khóa, thử nghiệm A/B, cá nhân hóa nội dung theo phân khúc, tự động hóa onboarding, tích hợp SDWork.

---

## PHẦN 1. BẢY ĐIỀU CẤM

Giữ nguyên, không đàm phán, kể cả khi gấp:

1. Máy soạn, người bấm gửi. Không tự động gửi thư hoặc tin nhắn tới ứng viên và khách hàng.
2. Không tự động loại ứng viên. Máy xếp hạng, người quyết.
3. Nội dung liên quan quy định nhà nước, IUU, Cục Thủy sản và Kiểm ngư phải qua duyệt của cấp quản lý trước khi đăng.
4. Không mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như năng lực của SDVICO. Công ty phân phối thiết bị, không sở hữu phần mềm của họ.
5. Không bịa số liệu, giải thưởng, khách hàng, đối tác.
6. Không đưa dữ liệu ứng viên ra khỏi hạ tầng công ty.
7. Không commit khóa và mật khẩu vào Git.

Nội dung sinh ra phải đọc như người Việt viết. Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu, ký hiệu thay chữ "và". Số theo chuẩn Việt Nam, dấu chấm ngăn cách hàng nghìn.

---

## PHẦN 2. KIẾN TRÚC. QUYẾT XONG, KHÔNG BÀN LẠI

Điều phối: GitHub Actions schedule và cron nội bộ. Không dùng n8n, không dùng Make.
Suy luận ngôn ngữ: Claude Code chế độ headless, `claude -p "<lệnh>" --allowedTools ... --output-format stream-json`.
Việc lặp lại đóng gói thành Skill và Slash Command trong repo.
Dữ liệu: Supabase PostgreSQL và Supabase Storage.
Giao diện duyệt: Next.js trên Vercel.
Tự động thao tác web: Playwright chạy Chrome thật, môi trường thử nghiệm ở Phần 5, nguyên lý vận hành ở Phần 6.
Video: ffmpeg và Whisper trên máy nội bộ.

```
sdvico-automation/
  CLAUDE.md
  .claude/skills/     brand-voice, product-boundary, cv-screening, seo-brief
  .claude/commands/   hr-jd, hr-intake, mkt-brief, mkt-draft, mkt-publish
  packages/core/      supabase client, run_log, approval_queue, browser runner
  packages/hr/        Bạn A
  packages/marketing/ Bạn B
  apps/approval-ui/   giao diện duyệt
  .github/workflows/  lịch chạy
```

Bảng dữ liệu tối thiểu: `approval_queue`, `run_log`, `brand_assets`, `hr_jobs`, `hr_candidates`, `hr_applications`, `mkt_keywords`, `mkt_content`, `mkt_posts`, `mkt_metrics`. Bật Row Level Security cho bảng có dữ liệu cá nhân.

---

## PHẦN 3. LỊCH BẢY NGÀY

### Ngày 1. Nền chung. Hai bạn làm cùng

Sáng: dựng repo, viết CLAUDE.md gồm bối cảnh công ty, danh mục sản phẩm, bảy điều cấm, chuẩn giọng văn. Dựng Supabase, chạy migration, bật RLS.

Chiều: `packages/core` gồm client Supabase, hàm ghi run_log, hàm đẩy approval_queue, và browser runner (Phần 5). Approval UI tối giản: danh sách chờ, nút Duyệt, nút Từ chối, ô ghi chú. Một GitHub Action chạy thử theo lịch.

Chốt cuối ngày: một tác vụ chạy theo lịch, sinh một mục chờ duyệt, người duyệt bấm, trạng thái đổi trong cơ sở dữ liệu. Không đạt mốc này thì dừng, báo ngay, không đi tiếp.

### Ngày 2. Đầu vào

Bạn A: lệnh `/hr-jd` sinh mô tả công việc bốn phiên bản độ dài cho bốn kênh. Đường nạp CV từ hộp thư tuyendung@sdvico.vn, chạy 30 phút một lần, trích PDF và DOCX, OCR cho CV ảnh, chuẩn hóa thành JSON, khử trùng lặp theo email và số điện thoại, lưu Storage và ghi bản ghi.

Bạn B: kho từ khóa tối thiểu 150 mục, phân loại theo ý định tìm kiếm, gán trang đích. Nguồn: gợi ý tìm kiếm Google, câu hỏi thật trong hộp thư và tổng đài 1900 23 23 49, từ khóa đối thủ. Skill `brand-voice` và `product-boundary`, kiểm thử trên 20 đoạn văn có lỗi cài sẵn.

### Ngày 3. Xử lý

Bạn A: skill `cv-screening`. Thang điểm cố định theo vị trí, không để mô hình tự nghĩ tiêu chí. Bỏ tên, giới tính, tuổi, ảnh, quê quán khỏi dữ liệu đưa vào chấm. Đầu ra gồm điểm từng trục, ba câu tóm tắt, ba điểm mạnh, ba điểm cần làm rõ khi phỏng vấn.

Bạn B: rà soát SEO tự động bằng Playwright và Lighthouse, xếp lỗi theo mức tác động. Cỗ máy nội dung bốn bước: `/mkt-brief`, `/mkt-draft`, người duyệt, `/mkt-publish`.

### Ngày 4. Đăng tự động trên môi trường thử nghiệm. Ngày quan trọng nhất

Toàn bộ ngày 4 chạy trên tài khoản test và bản sao trang cục bộ. Không đụng tới tài khoản thật của công ty.

Bạn A: luồng đăng tin tuyển dụng bằng Playwright, chạy trên bản sao trang cục bộ (mức T0) rồi lên trang thật ở chế độ diễn tập, dừng trước nút gửi cuối cùng.

Bạn B: đăng bài qua Graph API trên Test User và Page nháp của app ở chế độ phát triển. Lịch nội dung tuần sinh tự động, người duyệt theo lô.

Đọc Phần 5 và Phần 6 trước khi viết dòng code đầu tiên.

### Ngày 5. Hoàn tất chuỗi

Bạn A: bộ câu hỏi phỏng vấn sinh riêng theo từng ứng viên, 8 câu kỹ thuật bám dự án ứng viên đã ghi, 4 câu hành vi, 1 bài về nhà 3 giờ kèm barem. Đề xuất ba khung giờ phỏng vấn và sinh thư mời chờ duyệt.

Bạn B: dây chuyền video. Sinh kịch bản từ bài đã đăng, ghép hình từ kho tư liệu công ty, phụ đề bằng Whisper có từ điển thuật ngữ chuyên ngành, chèn nhận diện, xuất bản dọc 60 giây và bản ngang 3 tới 5 phút, sinh ba tiêu đề và ba ảnh đại diện. Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép ghi trong `brand_assets`.

### Ngày 6. Đo lường và làm cứng

Kéo số liệu Google Search Console, Analytics, Facebook Insights, YouTube về `mkt_metrics`. Dashboard tuyển dụng: số ứng viên theo nguồn, tỷ lệ chuyển đổi từng bước, thời gian mỗi bước.

Làm cứng: thử lại có giãn cách khi lỗi, công tắc dừng khẩn cho toàn bộ tác vụ đăng bài, cảnh báo khi chi phí mô hình chạm 80 phần trăm hạn mức, ghi log đầy đủ.

### Ngày 7. Chuyển sang tài khoản công ty và bàn giao

Điều kiện chuyển đổi: mọi luồng đã chạy sạch trên môi trường test, mục 5.4 ký xác nhận đủ.

Sáng: đổi cấu hình sang tài khoản thật, chạy chế độ diễn tập một vòng đầy đủ, người vận hành xem ảnh chụp từng bước rồi mới mở khóa. Chạy thật với hạn mức tối thiểu: 1 tin tuyển dụng, 1 bài website, 1 bài Facebook, 1 video ở chế độ không công khai. Theo dõi 2 giờ, không có bất thường mới nâng hạn mức.

Chiều: demo 30 phút cho Ban Giám đốc, Phòng Nhân sự, Phòng Kinh doanh. Bàn giao mã nguồn, tài liệu vận hành, danh sách việc còn nợ.

---

## PHẦN 4. NGHIỆM THU

| Chỉ tiêu | Mức đạt sau 7 ngày |
|---|---|
| CV được chấm tự động trong ngày nhận | Trên 90 phần trăm |
| Độ chính xác trích xuất trường bắt buộc từ CV | Tối thiểu 90 phần trăm |
| Thời gian soạn một mô tả công việc | Dưới 20 phút |
| Luồng đăng tin chạy sạch trên môi trường test | 3 kênh, mỗi kênh 5 lần liên tiếp không lỗi |
| Tin tuyển dụng đăng lên tài khoản thật | 1 vị trí, có kiểm chứng bằng ảnh chụp |
| Bài viết website đăng qua hệ thống | 3 bài trên staging, 1 bài trên trang thật |
| Bài Facebook | 5 bài trên Page nháp, 1 bài trên Page thật |
| Video hoàn chỉnh | 1 bản dọc và 1 bản ngang, đăng chế độ không công khai |
| Tác vụ theo lịch chạy thành công | Tối thiểu 95 phần trăm ngày 6 và 7 |
| Chi phí mô hình | Dưới 3.000.000 đồng cho cả tuần |

Chấm điểm: hệ thống chạy thật 45, đạt chỉ tiêu định lượng 25, tuân thủ bảy điều cấm 20, chất lượng mã nguồn và tài liệu 10. Hạng mục tuân thủ chấm có hoặc không, vi phạm mất trọn 20 điểm.

---

## PHẦN 5. MÔI TRƯỜNG THỬ NGHIỆM. LÀM TRƯỚC, TÀI KHOẢN CÔNG TY SAU

### 5.1. Nguyên tắc

Tài khoản chính danh của SDVICO trên các sàn tuyển dụng và Facebook là tài sản không thay thế được. Mất Page có 5.000 người theo dõi vì một vòng lặp sai thì không mua lại được bằng tiền. Vì vậy toàn bộ phát triển và thử lỗi diễn ra trên môi trường test, tài khoản thật chỉ dùng ở ngày cuối và chỉ ở chế độ hạn mức tối thiểu.

Đây không phải là thận trọng thừa. Lỗi phổ biến nhất khi tự động hóa trình duyệt là vòng lặp thử lại không giới hạn khi chọn nhầm phần tử. Trên môi trường test, lỗi đó tốn nửa giờ. Trên tài khoản thật, lỗi đó khóa tài khoản.

### 5.2. Bốn mức thử nghiệm

**Mức T0. Bản sao trang cục bộ.** Lưu lại HTML của trang đăng tin bằng `page.content()` hoặc bằng chức năng lưu trang của trình duyệt, phục vụ bằng máy chủ tĩnh cục bộ, cho Playwright chạy vào đó. Mức này kiểm được toàn bộ logic định vị phần tử, điền biểu mẫu, xử lý lỗi, thử lại, và chạy được hàng trăm lần trong một buổi mà không chạm tới sàn. Đây là nơi hai bạn sống trong ngày 3 và ngày 4.

Kèm theo: dùng `page.route` để chặn và giả lập phản hồi mạng, kiểm được các nhánh lỗi như hết phiên, quá hạn mức, máy chủ trả lỗi.

**Mức T1. Sandbox chính thức của nền tảng.** Facebook có cơ chế sẵn: đưa app về chế độ phát triển, tạo Test User, tạo Page thử của Test User. Đây là công cụ Meta cung cấp cho đúng mục đích này, dùng thoải mái, không rủi ro. Toàn bộ luồng Graph API của Bạn B phát triển ở đây.

Google Search Console và Analytics gắn vào tên miền phụ staging, không gắn vào tên miền chính.

**Mức T2. Tài khoản thử hợp lệ của chính công ty.** Gồm: một trang Facebook mới lập của công ty ở chế độ chưa công bố, một kênh YouTube riêng đăng chế độ không công khai, một bản website staging, một hộp thư test riêng thay cho tuyendung@sdvico.vn, một dự án Supabase riêng.

Với sàn tuyển dụng, nếu sàn có gói dùng thử cho nhà tuyển dụng thì đăng ký chính danh công ty và dùng gói đó. Nếu không có, dừng ở mức T0 và chuyển thẳng lên mức T3.

**Mức T3. Chế độ diễn tập trên tài khoản thật.** Chạy hết luồng trên trang thật, dừng lại trước nút gửi cuối cùng, chụp màn hình toàn trang và lưu lại. Người vận hành xem ảnh, xác nhận nội dung và vị trí đúng, rồi mới cho phép mở nút gửi. Tối thiểu 5 lần diễn tập sạch cho mỗi luồng.

### 5.3. Điều cấm khi làm môi trường test

Không tạo tài khoản cá nhân giả, không dùng tên người không có thật, không dùng số điện thoại và thư điện tử ảo để lập tài khoản trên sàn. Tài khoản giả vừa vi phạm điều khoản nền tảng, vừa là thứ mà hệ thống bảo mật phát hiện nhanh nhất, và một tài khoản giả bị đánh dấu có thể kéo theo cả tài khoản thật đăng nhập cùng thiết bị.

Mọi tài khoản test phải là tài khoản chính danh SDVICO, khai đúng, chỉ khác ở chỗ chưa công bố ra ngoài.

Dữ liệu ứng viên thử nghiệm phải là dữ liệu tổng hợp do hai bạn tự dựng, tối thiểu 60 hồ sơ có đủ các trường hợp khó: CV ảnh chụp, CV hai cột, CV tiếng Anh, CV thiếu số điện thoại, CV trùng người. Không dùng CV thật của ứng viên để thử nghiệm cho tới khi có mẫu văn bản đồng ý theo Nghị định 13/2023. Khi dùng CV thật để đo độ chính xác ở ngày 6, dữ liệu phải nằm trong hạ tầng công ty và có sự đồng ý của Phòng Nhân sự.

### 5.4. Điều kiện chuyển từ test sang tài khoản thật

Chỉ mở khóa tài khoản thật khi đủ cả sáu:

1. Luồng chạy sạch 20 lần liên tiếp ở mức T0.
2. Luồng chạy sạch 5 lần ở mức T1 hoặc T2.
3. Trần hạn mức ngày đã cài trong code và đã kiểm chứng bằng cách cố tình vượt.
4. Công tắc dừng khẩn đã kiểm chứng, tắt được tác vụ đang chạy trong dưới 30 giây.
5. Mọi nhánh lỗi đều dừng và đẩy vào hàng đợi duyệt, không có nhánh nào thử lại quá 3 lần.
6. Có người vận hành ngồi cạnh trong lần chạy thật đầu tiên.

Sáu điều kiện này do người còn lại kiểm tra chéo và ký xác nhận, không phải người viết code tự đánh giá.

---

## PHẦN 6. TỰ ĐỘNG ĐĂNG BẰNG PLAYWRIGHT VÀ NGUYÊN LÝ TRÁNH BỊ CHẶN

### 6.1. Phạm vi cho phép

Chỉ tự động thao tác trên tài khoản chính danh của SDVICO, đăng nội dung của SDVICO, trong khối lượng mà một nhân viên làm thủ công cũng làm được. Đây là tự động hóa công việc của chính mình, không phải thu thập dữ liệu của người khác, không phải tạo tài khoản hàng loạt, không phải tương tác giả.

Thứ tự ưu tiên bắt buộc: có API chính thức thì dùng API. Không có API mới dùng trình duyệt. Không được dùng trình duyệt để lách giới hạn mà API đã đặt ra.

Trước khi tự động hóa một sàn, đọc điều khoản sử dụng của sàn đó và ghi kết luận vào tài liệu. Sàn nào cấm rõ ràng thì dừng ở mức bán tự động: hệ thống soạn sẵn nội dung đúng định dạng, mở sẵn trang đăng, người bấm nút cuối. Chậm hơn ba mươi giây, nhưng không mất tài khoản.

### 6.2. Bảy nguyên lý kỹ thuật

**Nguyên lý 1. Đăng nhập là thao tác rủi ro nhất. Đăng nhập càng ít càng tốt.**

Tuyệt đại đa số trường hợp khóa tài khoản bắt đầu từ việc đăng nhập lặp lại. Giải pháp: dùng persistent context, giữ nguyên hồ sơ trình duyệt và cookie giữa các lần chạy.

```
const ctx = await chromium.launchPersistentContext(
  '/var/lib/sdvico/profiles/topcv',
  { channel: 'chrome', headless: false, viewport: { width: 1440, height: 900 } }
);
```

Mỗi tài khoản một thư mục hồ sơ riêng, không dùng chung. Phiên hết hạn thì cảnh báo cho người vận hành đăng nhập lại bằng tay một lần, không tự động đăng nhập lại vòng lặp.

**Nguyên lý 2. Dùng Chrome thật, không dùng trình duyệt rút gọn.**

Đặt `channel: 'chrome'` để chạy Chrome cài trên máy. Chạy chế độ có giao diện trên máy chủ nội bộ có màn hình ảo. Không cần và không được dùng các gói giả mạo dấu vân tay trình duyệt. Với tài khoản chính danh của công ty, việc che giấu là không cần thiết và làm tăng rủi ro pháp lý.

**Nguyên lý 3. Một địa chỉ mạng ổn định, không xoay proxy.**

Chạy từ mạng văn phòng hoặc một máy chủ có địa chỉ cố định. Địa chỉ mạng nhảy liên tục là tín hiệu bất thường mạnh nhất đối với hệ thống bảo mật của sàn. Đây là điểm khác biệt cơ bản giữa tự động hóa hợp lệ và hành vi bị chặn.

**Nguyên lý 4. Nhịp độ của người, không phải nhịp độ của máy.**

- Giãn cách ngẫu nhiên giữa các thao tác, từ 800 tới 3.000 mili giây.
- Gõ chữ theo từng ký tự có độ trễ, dùng `type` với `delay`, không dùng `fill` cho ô nội dung dài.
- Cuộn trang trước khi bấm phần tử nằm ngoài vùng nhìn.
- Không chạy nhiều phiên song song trên cùng một tài khoản. Xếp hàng tuần tự.
- Không chạy 24 giờ. Giới hạn trong khung giờ hành chính, có ngày nghỉ.

**Nguyên lý 5. Hạn mức tự đặt, thấp hơn hạn mức của sàn.**

Đặt trần cứng trong code: tối đa 5 tin tuyển dụng mỗi ngày trên mỗi sàn, tối đa 3 bài mỗi ngày trên mỗi trang mạng xã hội. Vượt trần thì dừng, không xin phép chạy tiếp. Ghi bộ đếm vào cơ sở dữ liệu, không giữ trong bộ nhớ.

**Nguyên lý 6. Chờ theo trạng thái, không chờ theo thời gian.**

Không dùng `waitForTimeout` cố định để chờ trang tải. Dùng `waitForSelector` và `expect` của Playwright. Ưu tiên định vị phần tử theo vai trò và nhãn (`getByRole`, `getByLabel`) thay vì theo lớp CSS sinh tự động, vì lớp CSS đổi mỗi lần sàn cập nhật giao diện.

Mỗi lần thất bại phải chụp màn hình và lưu HTML vào Storage để truy vết. Không có ảnh chụp thì không sửa được lỗi trên máy chủ.

**Nguyên lý 7. Gặp rào là dừng, không phá rào.**

Gặp mã xác nhận hình ảnh, xác thực hai bước, hoặc thông báo hoạt động bất thường thì dừng ngay tác vụ, chụp màn hình, đẩy vào `approval_queue` cho người xử lý bằng tay. Nghiêm cấm dùng dịch vụ giải mã xác nhận hình ảnh. Việc cần giải mã xác nhận là tín hiệu rõ ràng rằng sàn không muốn tự động hóa ở điểm đó, và hệ thống phải tôn trọng tín hiệu đó.

Sau một lần bị chặn: dừng tài khoản đó tối thiểu 24 giờ, báo cáo, đánh giá lại trước khi chạy tiếp. Thử lại ngay lập tức là cách nhanh nhất để mất tài khoản vĩnh viễn.

### 6.3. Bốn thứ tuyệt đối không làm

1. Không dùng gói giả mạo dấu vân tay trình duyệt, không sửa thuộc tính nhận diện tự động hóa.
2. Không xoay proxy, không dùng proxy dân cư.
3. Không dùng dịch vụ giải mã xác nhận hình ảnh.
4. Không tạo tài khoản phụ, không tương tác giả (thích, bình luận, theo dõi hàng loạt).

Bốn thứ này chuyển hoạt động từ tự động hóa công việc hợp lệ sang hành vi vi phạm điều khoản và có thể vi phạm pháp luật. Rủi ro mất tài khoản chính danh của công ty và rủi ro pháp lý lớn hơn nhiều lần giá trị tiết kiệm được.

### 6.4. Thiết kế bắt buộc của browser runner

Viết một lần trong `packages/core`, cả hai bạn dùng chung:

- Quản lý hàng đợi tuần tự theo từng tài khoản.
- Nạp và giữ hồ sơ trình duyệt theo tài khoản.
- Bộ đếm hạn mức ngày lưu trong cơ sở dữ liệu.
- Ghi `run_log` cho mỗi thao tác, kèm ảnh chụp khi lỗi.
- Công tắc dừng khẩn đọc từ một bản ghi cấu hình, kiểm tra trước mỗi thao tác.
- Chế độ diễn tập: chạy hết luồng, dừng trước nút gửi cuối cùng, chụp màn hình để người kiểm tra. Mọi luồng mới phải qua chế độ diễn tập tối thiểu 5 lần trước khi cho chạy thật.

---

## PHẦN 7. CÁCH LÀM VIỆC TRONG BẢY NGÀY

Chốt tiến độ hai lần mỗi ngày, 09 giờ và 17 giờ, mỗi lần 10 phút. Ba dòng: xong gì, đang làm gì, vướng gì.

Vướng quá 2 giờ thì hỏi. Trong tuần này không có chỗ cho việc tự loay hoay.

Chạy trước, đẹp sau. Ngày 4 phải có tin tuyển dụng thật đăng lên sàn thật, dù giao diện xấu.

Không ai merge code của chính mình. Đổi vai review chéo mỗi cuối ngày.

Mỗi giả định nghiệp vụ đi hỏi người đang làm việc đó, không suy đoán. Bạn A ngồi với Phòng Nhân sự tối thiểu hai lần trong tuần. Bạn B ngồi với Phòng Kinh doanh tối thiểu hai lần.

---

## PHẦN 8. CẤP QUYỀN

### 8.1. Trước 09 giờ ngày thứ nhất. Môi trường thử nghiệm

1. Tài khoản GitHub tổ chức, quyền tạo repo và chạy Actions.
2. Dự án Supabase riêng cho hệ thống này.
3. Hộp thư test riêng, không phải tuyendung@sdvico.vn.
4. App Facebook chính danh công ty ở chế độ phát triển, quyền tạo Test User và Page thử.
5. Trang Facebook mới của công ty, chế độ chưa công bố.
6. Kênh YouTube riêng cho thử nghiệm.
7. Tên miền phụ staging của sdvico.vn, gắn Search Console và Analytics riêng.
8. Máy chủ nội bộ có màn hình ảo cho Playwright và ffmpeg.
9. Hạn mức chi phí mô hình và cảnh báo khi chạm 80 phần trăm.
10. Xác nhận sàn tuyển dụng nào có gói dùng thử cho nhà tuyển dụng.

### 8.2. Trước 09 giờ ngày thứ sáu. Tài khoản thật

11. Hộp thư tuyendung@sdvico.vn, quyền đọc qua giao thức chuẩn.
12. Tài khoản nhà tuyển dụng trên các sàn đang dùng. Mật khẩu và phương thức xác thực hai bước do người vận hành giữ, không giao cho hai bạn.
13. Quyền quản trị Facebook Page thật và đưa app lên chế độ hoạt động.
14. Google Search Console và Analytics của tên miền chính.
15. Quyền đăng bài lên sdvico.vn.
16. Người có quyền duyệt cuối cho nội dung liên quan quy định nhà nước.
17. Mẫu văn bản đồng ý xử lý dữ liệu ứng viên theo Nghị định 13/2023 và thời hạn lưu trữ.

---

Ban hành ngày 10 tháng 8 năm 2026.
