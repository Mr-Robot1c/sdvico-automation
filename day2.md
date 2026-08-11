# NGÀY 2 (MARKETING): KẾ HOẠCH TỰ ĐỘNG HÓA VÀ CÁCH LÀM NỘI DUNG THU HÚT

Tài liệu này trả lời ba câu hỏi thực tế của Bạn B:
1. Tự động hóa marketing như thế nào cho đúng với hệ thống đã dựng.
2. Đăng trên các nền tảng ra sao để nội dung lan được, đúng luật, không mất tài khoản.
3. Video và bài viết phải theo định dạng nào để người xem dừng lại và liên hệ.

Đọc kèm `day2-marketing-strategy.md` (chiến lược định vị, phân khúc, kho từ khóa) và
`CLAUDE.md` (bảy điều cấm, chuẩn giọng văn). File này là phần thực thi của chiến lược đó.

Ba ràng buộc không được quên khi đọc toàn bộ bên dưới:
- Máy soạn, người bấm gửi. Mọi bài đăng đi qua `approval_queue`, người duyệt mới đăng.
- Nội dung chạm quy định nhà nước, IUU, Cục Thủy sản và Kiểm ngư phải qua duyệt cấp quản lý.
- Không bịa số liệu, giá, cước, khách hàng, đối tác. SDVICO phân phối thiết bị, không sở hữu
  phần mềm của Viettel, VNPT, Vishipel, Thuraya.

---

## PHẦN A. HIỂU ĐÚNG CHỮ "LÊN TREND" TRONG NGÀNH NÀY

Phải nói thẳng trước khi bàn kỹ thuật. Thiết bị giám sát tàu cá không phải hàng tiêu dùng.
Người mua không lướt mạng để giải trí rồi mua vì vui. Họ tìm khi đang lo một việc gấp: sắp
bị phạt, tàu đứt kết nối giữa biển, cước sắp hết hạn, thiết bị hỏng không ra khơi được.

Vì vậy "viral" kiểu triệu view của ngành giải trí là mục tiêu sai. Với SDVICO, thành công
thật gồm ba thứ đo được:
1. Khi ngư dân một tỉnh gõ Google "tàu mất kết nối làm sao", bài của SDVICO nằm đầu.
2. Khi có sự cố hoặc quy định mới, bài của SDVICO được chia sẻ thật trong nhóm nghề cá của tỉnh.
3. Mỗi bài đều dẫn được người đọc về số 1900 23 23 49 hoặc để lại liên hệ.

Con đường tới ba thứ đó là nội dung chạm đúng nỗi đau, đăng đều, đúng nơi bà con tụ họp, và
đúng định dạng của từng nền tảng. Không phải mua view, không phải tương tác ảo.

Nhắc lại điều cấm khi làm tăng trưởng, khớp Phần 6 của bản giao việc:
- Không tạo tài khoản phụ, không thích, bình luận, theo dõi hàng loạt bằng máy.
- Không mua lượt xem, lượt thích, người theo dõi.
- Không xoay proxy, không giả mạo dấu vân tay trình duyệt.

Lý do không chỉ là đạo đức. Tài khoản chính danh của công ty là tài sản không mua lại được.
Một lần bị đánh dấu gian lận tương tác có thể kéo sập cả Page thật. Rủi ro lớn hơn nhiều lần
cái lợi trước mắt.

---

## PHẦN B. KIẾN TRÚC TỰ ĐỘNG HÓA MARKETING

### B.1. Vòng đời một bài, gắn vào hệ thống đã dựng

Cỗ máy nội dung bốn bước đã chốt trong kế hoạch, đây là cách nó chạy tự động:

```
Chọn từ khóa (mkt_keywords)
   -> /mkt-brief   sinh đề cương, lưu mkt_content trạng thái brief
   -> /mkt-draft   viết bản nháp bằng skill brand-voice và product-boundary, trạng thái draft
   -> approval_queue   người duyệt đọc, sửa, bấm Duyệt hoặc Từ chối
   -> /mkt-publish   chỉ chạy sau khi duyệt, đăng qua API hoặc browser runner
   -> mkt_posts + run_log   ghi bài đã đăng và vết thao tác
```

Điểm mấu chốt: máy dừng lại ở `approval_queue`. Máy không tự đăng. Đây là cách bảy điều cấm
được thực thi ở tầng kiến trúc, không trông chờ kỷ luật con người.

### B.2. Nguồn kích hoạt tự động

Ba nguồn sinh việc cho cỗ máy nội dung, chạy theo lịch GitHub Actions:
- Theo kho từ khóa: mỗi ngày lấy vài từ khóa nhóm service và transaction chưa có bài, tự sinh brief.
  Ưu tiên nhóm service và transaction trước vì ra tiền nhanh và ít rào duyệt.
- Theo tin quy định: khi có nghị định hoặc thông báo mới (ví dụ Nghị định 41/2026, tin gỡ thẻ
  vàng IUU), sinh brief bài giải thích. Nhóm này bắt buộc gắn cờ chờ duyệt cấp quản lý.
- Theo bài đã đăng: một bài website tốt được tái sử dụng thành bài Facebook ngắn và kịch bản video
  (dây chuyền video Ngày 5). Một lần viết, nhiều lần dùng.

### B.3. Ai làm gì, máy hay người

| Việc | Máy làm | Người làm |
|---|---|---|
| Chọn từ khóa cần viết | Đề xuất theo độ ưu tiên | Chốt danh sách tuần |
| Viết đề cương và bản nháp | Toàn bộ | Không |
| Duyệt nội dung | Không | Bắt buộc, nhất là nội dung quy định |
| Đăng bài | Thực thi sau khi duyệt | Bấm Duyệt |
| Trả lời bình luận và tin nhắn | Không tự động | Người, hoặc gợi ý trả lời chờ người gửi |

Không để máy tự trả lời bình luận và tin nhắn. Đây vẫn là điều cấm số 1 mở rộng: máy soạn gợi ý,
người bấm gửi. Bình luận sai trên nội dung quy định là rủi ro pháp lý.

### B.4. Đăng bằng API hay bằng trình duyệt

Thứ tự ưu tiên bắt buộc: có API chính thức thì dùng API. Không có mới dùng trình duyệt.
- Facebook: dùng Graph API. Ngày 4 phát triển trên Test User và Page nháp (mức T1).
- YouTube: dùng Data API để đăng chế độ không công khai.
- Website sdvico.vn: đăng qua API của nền tảng web, hoặc browser runner nếu không có API.
- Sàn không có API và cấm tự động: dừng ở mức bán tự động. Máy soạn sẵn đúng định dạng, mở sẵn
  trang đăng, người bấm nút cuối. Chậm hơn ba mươi giây, đổi lại không mất tài khoản.

---

## PHẦN C. CHIẾN LƯỢC TỪNG NỀN TẢNG

### C.1. Website và SEO. Kênh chủ lực, tài sản lâu dài

Đây là nơi thu hoạch chính vì người ta Google khi cần lắp hoặc khi gặp sự cố. Khác với mạng xã
hội, một bài SEO tốt kéo khách nhiều năm, không trôi sau ba ngày.

Nguyên tắc nội dung SEO cho SDVICO:
- Trả lời ngay ở câu đầu. Người đọc và cả Google đều muốn câu trả lời ở trên cùng, không vòng vo.
  Bài "Tàu mất kết nối làm sao" thì đoạn đầu phải là các bước xử lý ngay, phần giải thích để sau.
- Một trang trả lời một ý định. Đừng gộp "giám sát là gì" với "lắp ở Bình Định" vào một trang.
  Kho từ khóa đã gán trang đích, bám theo đó.
- SEO địa phương là mỏ vàng. Mỗi tỉnh ven biển một trang dịch vụ riêng, vì lắp đặt và hỗ trợ là
  việc tại chỗ. Sáu mươi từ khóa giao dịch và dịch vụ theo tỉnh trong kho là để phục vụ việc này.
- Luôn có đường dẫn hành động: số 1900 23 23 49, nút gọi, ô để lại số điện thoại.

### C.2. Facebook. Nơi bà con ngư dân tụ họp

Cộng đồng nghề cá rất sống trên Facebook, theo nhóm tỉnh và nhóm nghề. Đây là kênh lan nhanh nhất
nếu nội dung chạm đúng.

Cách làm đúng:
- Nội dung ngắn, một ý một bài. Nhắc một quy định, giải một sự cố, một mẹo giữ kết nối.
- Video ngắn tự phát trong dòng thời gian, không bắt bấm sang nơi khác, vì nền tảng ưu tiên nội
  dung giữ người ở lại.
- Đăng lên Page chính danh của công ty. Việc chia sẻ vào nhóm nghề cá theo tỉnh do người làm, không
  để máy rải hàng loạt (tránh bị đánh dấu spam và tránh điều cấm tương tác giả).
- Bài nào chạm quy định thì qua duyệt cấp quản lý trước, không đăng nóng theo tin.

### C.3. YouTube và video dọc. Cầm tay chỉ việc

Hai loại video, hai mục đích:
- Video dọc 60 giây cho tương tác nhanh và cho nhóm Facebook, TikTok, Shorts. Mục tiêu là chạm nỗi
  đau và để lại số tổng đài.
- Video ngang 3 tới 5 phút cho YouTube, hướng dẫn xử lý sự cố từng bước. Loại này lên top tìm kiếm
  YouTube và sống lâu, vì người gặp sự cố hay tìm video cách làm.

Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép ghi trong `brand_assets`. Không lấy nhạc và hình
trôi nổi trên mạng (điều cấm bản quyền, khớp Ngày 5).

### C.4. Tổng đài và Zalo. Điểm chốt

Ngoài phạm vi tự động hóa tuần này, nhưng là nơi chuyển đổi cuối. Mọi nội dung ở ba kênh trên đều
phải dẫn về số 1900 23 23 49. Đo lường phải đếm được cuộc gọi và tin nhắn về từ từng kênh.

---

## PHẦN D. ĐỊNH DẠNG VIDEO ĐỂ NGƯỜI XEM DỪNG LẠI

### D.1. Video dọc 60 giây. Khung bốn nhịp

Người lướt quyết định xem tiếp hay bỏ trong ba giây đầu. Cấu trúc bắt buộc:

```
Giây 0 tới 3    Mồi. Nêu thẳng nỗi sợ hoặc câu hỏi.
                 Ví dụ: "Tàu đang ở ngoài khơi mà mất kết nối giám sát, phải làm gì ngay?"
Giây 3 tới 10   Xoáy vào hậu quả thật. Mất kết nối là không được ra khơi và có thể bị phạt.
Giây 10 tới 45  Giải pháp từng bước, ngắn gọn, mỗi bước một câu. Cầm tay chỉ việc.
Giây 45 tới 60  Chốt. "Gọi 1900 23 23 49 để được hỗ trợ tận bến." Hiện số to trên màn hình.
```

Quy tắc kỹ thuật cho video dọc:
- Tỷ lệ khung 9:16, chữ và hình chính nằm giữa màn hình, tránh mép trên dưới bị che.
- Phụ đề cháy chữ, tức chữ nằm cứng trên hình, vì đa số người xem tắt tiếng. Đây cũng là lý do dùng
  Whisper có từ điển thuật ngữ để không phiên âm sai tên thiết bị và từ kỹ thuật hàng hải.
- Câu ngắn, chữ to, đọc được trên điện thoại ngoài nắng.
- Một video một thông điệp. Đừng nhồi ba mẹo vào một video.
- Nhận diện thương hiệu chèn nhẹ ở góc, không che nội dung.

### D.2. Video ngang 3 tới 5 phút. Khung hướng dẫn

```
0 tới 15 giây    Nêu vấn đề và hứa hẹn kết quả. "Video này chỉ cách xử lý khi tàu mất tín hiệu VMS."
15 giây tới hết   Từng bước có đánh số, mỗi bước quay hoặc minh họa rõ.
                  Xen một tình huống thật đã xử lý (chỉ dùng tư liệu công ty, không dựng chuyện).
Phần cuối          Tóm tắt ba ý chính và lời kêu gọi liên hệ.
```

### D.3. Tiêu đề và ảnh đại diện

Dây chuyền video sinh ba tiêu đề và ba ảnh đại diện để người chọn (Ngày 5). Nguyên tắc:
- Tiêu đề bám từ khóa người thật sự gõ. "Cách xử lý khi tàu cá mất kết nối giám sát hành trình"
  tốt hơn tiêu đề bay bổng.
- Ảnh đại diện có mặt người và chữ to, dễ đọc ở kích thước nhỏ.
- Chỉ nêu con số khi là số thật đã được Phòng Kinh doanh xác nhận. Không bịa để câu view.

---

## PHẦN E. ĐỊNH DẠNG BÀI VIẾT ĐỂ GIỮ NGƯỜI ĐỌC VÀ LÊN TÌM KIẾM

### E.1. Công thức tiêu đề

Ba dạng tiêu đề hợp với ngành:
- Dạng câu hỏi bám nỗi đau: "Tàu cá mất kết nối giám sát hành trình, xử lý thế nào?"
- Dạng địa phương: "Lắp thiết bị giám sát tàu cá ở Bình Định, quy trình và hỗ trợ tận bến."
- Dạng các bước có số: "Năm bước cần làm ngay khi tàu mất tín hiệu giám sát."

### E.2. Bộ khung một bài chuẩn

```
Tiêu đề bám từ khóa.
Đoạn mở trả lời ngay ý chính, tối đa ba câu. Người vội đọc đoạn này là đủ dùng.
Mục lục nếu bài dài.
Các phần có tiêu đề phụ, mỗi phần một ý.
Hộp cảnh báo hoặc lưu ý khi cần, ví dụ nhắc thời hạn gia hạn cước.
Phần hỏi đáp ngắn ở cuối, gom các câu bà con hay hỏi ở tổng đài.
Lời kêu gọi liên hệ và số 1900 23 23 49.
```

### E.3. Viết cho người đọc trên điện thoại

- Câu ngắn, đoạn ngắn, mỗi đoạn hai tới ba câu. Bà con đọc trên điện thoại giữa lúc bận.
- Lời thường, tránh thuật ngữ rối. Giải thích từ kỹ thuật bằng lời dân dã.
- Giọng gần gũi, thực tế, tin cậy, không hoa mỹ, đúng skill brand-voice.
- Số theo chuẩn Việt Nam, dấu chấm ngăn cách hàng nghìn.
- Không hứa pháp lý tuyệt đối kiểu chắc chắn không bị phạt. Không nhận vơ phần mềm đối tác.

### E.4. Cái làm bài được chia sẻ

Bài được chia sẻ thật khi nó giúp người đọc giải quyết việc gấp và họ muốn người cùng nghề biết.
Ba loại nội dung dễ được chia sẻ trong ngành này:
- Hướng dẫn xử lý sự cố mất kết nối, vì ai cũng có thể gặp và ai cũng sợ.
- Giải thích quy định mới bằng lời dễ hiểu, ngay khi có tin. Nhóm này phải qua duyệt cấp quản lý.
- Nhắc mốc thời gian quan trọng, ví dụ hạn gia hạn cước, để bà con khỏi lỡ và bị đứt kết nối.

---

## PHẦN F. NHỊP ĐĂNG VÀ LỊCH NỘI DUNG

### F.1. Khung giờ theo nếp sinh hoạt ngư dân

Ngư dân xem điện thoại nhiều vào sáng sớm trước khi ra biển và chiều tối khi về bến. Ưu tiên đăng
quanh hai khung này. Con số cụ thể sẽ tinh chỉnh sau khi có dữ liệu Facebook Insights ở Ngày 6,
đừng chốt cứng khi chưa có số thật.

### F.2. Tần suất và trần an toàn

Bám nguyên lý 5 của Phần 6, đặt trần cứng trong code, thấp hơn hạn mức của nền tảng:
- Tối đa 3 bài mỗi ngày trên mỗi trang mạng xã hội.
- Bộ đếm lưu trong cơ sở dữ liệu, không giữ trong bộ nhớ. Vượt trần thì dừng, không xin chạy tiếp.
- Không chạy 24 giờ, giới hạn giờ hành chính, có ngày nghỉ. Nhịp độ của người, không phải của máy.

### F.3. Lịch nội dung tuần, duyệt theo lô

Máy sinh lịch nội dung cả tuần từ kho từ khóa và các bài đã có, người duyệt cả lô một lần thay vì
duyệt từng bài (Ngày 4). Một tuần mẫu cân bằng:
- Ba tới bốn bài nhóm dịch vụ và sự cố kết nối, đây là thế mạnh và ít đối thủ.
- Hai bài nhóm giao dịch theo tỉnh, phục vụ SEO địa phương.
- Một bài nhóm quy định, chỉ đăng sau khi cấp quản lý duyệt.
- Một tới hai video dọc tái sử dụng từ bài viết tốt trong tuần.

---

## PHẦN G. ĐO LƯỜNG ĐỂ BIẾT CÁI GÌ HIỆU QUẢ (NGÀY 6)

Không có số thì không biết nên làm tiếp cái gì. Kéo về bảng `mkt_metrics`:
- Thứ hạng từ khóa nhóm service và transaction theo từng tỉnh, từ Google Search Console.
- Lượt truy cập và hành vi trên các trang dịch vụ, từ Google Analytics.
- Tương tác và lượt chia sẻ bài Facebook theo nhóm nghề cá, từ Facebook Insights.
- Lượt xem và thời lượng xem video, từ YouTube.
- Quan trọng nhất và khó nhất: số cuộc gọi và tin nhắn về từ mỗi kênh. Đây là thước đo ra tiền thật,
  cần phối hợp với tổng đài để gắn nguồn.

Đọc số theo hướng: nhóm nội dung nào kéo được liên hệ thì làm nhiều hơn, nhóm chỉ có view mà không
ra liên hệ thì xem lại lời kêu gọi hành động.

---

## PHẦN H. VIỆC CỤ THỂ CỦA BẠN B, XẾP THEO THỨ TỰ LÀM

Đây là phần biến kế hoạch thành việc trong repo.

1. Hoàn tất hai skill nền `brand-voice` và `product-boundary`, kiểm thử trên 20 đoạn có lỗi cài sẵn.
   Đây là hàng rào để mọi nội dung sinh ra đúng giọng và không nói sai sản phẩm.
2. Viết `/mkt-brief` và `/mkt-draft`, nối vào bảng `mkt_content`, ra một bản nháp nằm trong hàng đợi
   duyệt. Kho từ khóa đã có 152 mục để chọn.
3. Viết `/mkt-publish` chạy sau khi duyệt. Ngày 3 chưa đăng thật, chỉ nối dây chuyền.
4. Rà SEO tự động bằng Playwright và Lighthouse, xếp lỗi theo mức tác động, biết sửa gì trước.
5. Ngày 4: đăng Facebook qua Graph API trên Test User và Page nháp, sinh lịch nội dung tuần, duyệt lô.
6. Ngày 5: dây chuyền video, xuất bản dọc 60 giây và ngang 3 tới 5 phút, chỉ dùng tư liệu trong
   `brand_assets`.
7. Ngày 6: kéo số về `mkt_metrics`, đọc số, chỉnh nội dung theo cái ra liên hệ.

Việc làm được ngay không cần chờ cấp quyền: mục 1, 2, 3. Việc cần dữ liệu Phòng Kinh doanh: mọi bài
có giá, cước, thông số, phạm vi bảo hành. Chưa có thì viết chung chung, không bịa.

---

## PHẦN I. DỮ LIỆU CÒN THIẾU ĐỂ NỘI DUNG KHÔNG BỊA

Nhắc lại từ mục 10 chiến lược, xin Phòng Kinh doanh sớm:
- Danh mục thiết bị thật đang phân phối, hãng, model, thông số chính.
- Giá lắp đặt và cước thuê bao theo từng loại.
- Phạm vi và điều kiện bảo hành.
- Các tỉnh đang thật sự phủ dịch vụ lắp đặt và hỗ trợ.
- Quy trình chuẩn khi tàu mất kết nối, để bài hướng dẫn khớp cách công ty làm thật.

Và xin bản ghi hoặc thống kê câu hỏi ở tổng đài 1900 23 23 49. Đây là mỏ từ khóa đuôi dài và cũng là
nguồn đề tài nội dung sát nhu cầu nhất.

---

## PHẦN J. NGÂN HÀNG CÂU MỒI (ba giây đầu video, câu mở bài)

Câu mồi quyết định người xem ở lại hay lướt qua. Nguyên tắc: chạm thẳng nỗi sợ hoặc câu hỏi gấp,
không rào đón. Dùng lại và xoay vòng các mẫu sau, thay tên tỉnh và tình huống cho hợp.

- Tàu đang ngoài khơi mà mất kết nối giám sát, làm gì trước tiên?
- Cước giám sát hành trình sắp hết hạn, không gia hạn kịp thì chuyện gì xảy ra?
- Thiết bị giám sát báo lỗi, tàu có được ra khơi không?
- Bị nhắc mất tín hiệu giám sát nhiều lần, hậu quả tới đâu?
- Tàu sắp tới kỳ đăng kiểm mà thiết bị giám sát trục trặc, xử lý ra sao?
- Mua thiết bị giám sát tàu cá, làm sao khỏi chọn nhầm loại không hợp quy định?
- Ba dấu hiệu cho thấy thiết bị giám sát trên tàu sắp hỏng.
- Ở [tỉnh], lắp và bảo trì thiết bị giám sát tàu cá tận bến ra sao?
- Mất kết nối lúc nửa đêm, gọi ai để được hỗ trợ ngay?
- Thiết bị vẫn sáng đèn nhưng bờ không thấy tín hiệu, lỗi nằm ở đâu?

Cấm khi viết mồi: không dọa sai kiểu chắc chắn bị phạt nặng, không nêu con số phạt cụ thể nếu chưa
được duyệt và kiểm chứng. Mồi chạm cảm xúc thật, không bịa để câu view.

---

## PHẦN K. NGÂN HÀNG TIÊU ĐỀ THEO NHÓM Ý ĐỊNH

Bám bốn nhóm trong kho từ khóa. Thay [tỉnh] bằng tỉnh thật đang phủ dịch vụ.

Nhóm dịch vụ và sự cố (ưu tiên làm trước, ít rào duyệt):
- Tàu cá mất kết nối giám sát hành trình, năm việc cần làm ngay.
- Gia hạn cước giám sát hành trình tàu cá, làm sớm để khỏi đứt kết nối.
- Thiết bị giám sát tàu cá báo lỗi không lên tín hiệu, cách kiểm tra nhanh.
- Thay thiết bị giám sát hành trình tàu cá, khi nào cần và lưu ý gì.

Nhóm giao dịch địa phương (phục vụ SEO tỉnh):
- Lắp thiết bị giám sát tàu cá ở [tỉnh], quy trình và hỗ trợ tận bến.
- Đại lý thiết bị giám sát hành trình tàu cá tại [tỉnh].

Nhóm so sánh (dẫn về trang tư vấn):
- Chọn thiết bị giám sát tàu cá, những tiêu chí quan trọng nhất.
- So sánh các loại thiết bị giám sát hành trình tàu cá theo nhu cầu sử dụng.

Nhóm thông tin quy định (bắt buộc qua duyệt cấp quản lý trước khi đăng):
- Tàu cá bao nhiêu mét phải lắp thiết bị giám sát hành trình.
- Quy định mới về giám sát hành trình tàu cá, những điểm chủ tàu cần biết.

---

## PHẦN L. KỊCH BẢN VIDEO DỌC 60 GIÂY MẪU

Đề tài: Tàu mất kết nối giám sát, làm gì trước tiên. Đây là khung mẫu, các bước kỹ thuật cụ thể phải
khớp quy trình thật của SDVICO (xin Phòng Kinh doanh, mục I). Chỗ cần số liệu thật đánh dấu trong ngoặc.

```
[0 tới 3 giây, mồi, mặt người nói thẳng vào máy]
Lời thoại: Tàu đang ngoài khơi mà mất kết nối giám sát, đừng hoảng, làm theo mấy bước này.
Chữ cháy trên hình: TÀU MẤT KẾT NỐI, LÀM GÌ TRƯỚC?

[3 tới 10 giây, hậu quả, giữ nhịp nhanh]
Lời thoại: Mất kết nối là bờ không thấy tàu, ảnh hưởng chuyến biển và việc tuân thủ.
Chữ cháy: MẤT KẾT NỐI = RỦI RO CHO CHUYẾN BIỂN

[10 tới 45 giây, giải pháp từng bước, mỗi bước một câu, có số thứ tự]
Bước 1: Kiểm tra nguồn điện và cầu chì của thiết bị.
Bước 2: Kiểm tra ăng-ten, xem có bị che, gãy, lỏng dây không.
Bước 3: Khởi động lại thiết bị theo hướng dẫn.
Bước 4: Nếu vẫn không lên tín hiệu, ghi lại thời điểm và liên hệ hỗ trợ ngay.
(Các bước trên là khung chung. Bước chi tiết theo từng dòng thiết bị: Phòng Kinh doanh xác nhận.)

[45 tới 60 giây, chốt, hiện số to]
Lời thoại: Chưa xử lý được thì gọi ngay để được hỗ trợ tận bến.
Chữ cháy: HỖ TRỢ 1900 23 23 49
```

Ghi chú sản xuất: phụ đề cháy chữ toàn bộ, chữ to đọc được ngoài nắng, chỉ dùng hình trong
`brand_assets`, Whisper có từ điển thuật ngữ để không phiên âm sai tên thiết bị.

---

## PHẦN M. BÀI VIẾT MẪU (KHUNG ĐÃ ĐIỀN)

Đề tài nhóm dịch vụ, ít rào duyệt. Minh họa cách áp bộ khung Phần E.

```
Tiêu đề: Tàu cá mất kết nối giám sát hành trình, năm việc cần làm ngay

[Đoạn mở, trả lời ngay, tối đa ba câu]
Khi tàu mất kết nối giám sát, việc đầu tiên là bình tĩnh kiểm tra nguồn điện và ăng-ten của thiết bị,
sau đó khởi động lại. Nếu vẫn không lên tín hiệu, hãy ghi lại thời điểm và liên hệ hỗ trợ ngay để được
xử lý tận bến. Dưới đây là năm việc làm theo thứ tự.

[Các bước, mỗi bước một tiêu đề phụ]
1. Kiểm tra nguồn điện và cầu chì.
2. Kiểm tra ăng-ten và dây kết nối.
3. Khởi động lại thiết bị.
4. Ghi lại thời điểm và hiện tượng.
5. Liên hệ hỗ trợ nếu chưa khắc phục được.

[Hộp lưu ý]
Gia hạn cước đúng hạn cũng giúp tránh gián đoạn kết nối. Kiểm tra hạn cước định kỳ.

[Hỏi đáp ngắn, gom câu hỏi thật ở tổng đài]
Mất kết nối bao lâu thì cần báo? Thiết bị sáng đèn mà bờ không thấy tín hiệu là lỗi gì?

[Kêu gọi liên hệ]
Cần hỗ trợ nhanh, gọi 1900 23 23 49, có mặt lắp đặt và bảo trì tận bến.
```

Lưu ý tuân thủ trong bài mẫu: không nêu mức phạt, không nêu tên phần mềm đối tác, không hứa pháp lý
tuyệt đối. Các bước kỹ thuật chi tiết chốt lại theo quy trình thật của công ty.

---

## PHẦN N. LỊCH NỘI DUNG MỘT TUẦN MẪU

Cân bằng theo mục F.3, ưu tiên dịch vụ và giao dịch, để quy định làm sau vì cần duyệt. Máy sinh cả lô,
người duyệt một lần.

| Thứ | Kênh | Nhóm | Đề tài mẫu |
|---|---|---|---|
| Hai | Website và Facebook | Dịch vụ | Tàu mất kết nối, năm việc cần làm ngay |
| Ba | Facebook | Giao dịch địa phương | Lắp và bảo trì thiết bị giám sát tàu cá ở [tỉnh] |
| Tư | Website | Dịch vụ | Gia hạn cước đúng hạn để khỏi đứt kết nối |
| Năm | Facebook, video dọc | Dịch vụ | Video 60 giây xử lý khi mất tín hiệu |
| Sáu | Website | So sánh | Tiêu chí chọn thiết bị giám sát tàu cá |
| Bảy | Facebook | Giao dịch địa phương | Đại lý thiết bị giám sát tàu cá tại [tỉnh] |
| Chờ duyệt | Website và Facebook | Quy định | Bài giải thích quy định mới, đăng sau khi cấp quản lý duyệt |

---

## PHẦN O. CHIẾN THUẬT LAN TRONG CỘNG ĐỒNG NGHỀ CÁ (HỢP LỆ)

Cách lan bền và không mất tài khoản, tất cả đều là việc thật, không phải tương tác ảo.

- Bám tin quy định đúng lúc. Khi có nghị định hoặc thông báo mới, ra bài giải thích dễ hiểu sớm là
  cách lan nhanh nhất, vì ai cũng cần hiểu. Nhóm này bắt buộc qua duyệt cấp quản lý trước.
- Đăng đúng nơi bà con tụ họp. Nhân viên chia sẻ bài lên nhóm nghề cá theo tỉnh mà mình tham gia thật,
  kèm một câu dẫn hữu ích. Không để máy rải hàng loạt, tránh bị đánh dấu spam và tránh điều cấm.
- Trả lời bình luận thật, nhanh và có ích. Một câu trả lời đúng lúc khi bà con hỏi về sự cố kéo được
  niềm tin hơn nhiều bài quảng cáo. Máy gợi ý câu trả lời, người bấm gửi.
- Nội dung giải quyết việc gấp thì tự được chia sẻ. Tập trung vào xử lý sự cố kết nối và nhắc mốc gia
  hạn cước, đây là thứ bà con muốn người cùng nghề biết.
- Đăng đều tay hơn đăng dồn. Nền tảng và người xem đều thưởng cho sự đều đặn. Lịch tuần ở Phần N giúp
  giữ nhịp mà không vượt trần an toàn.
- Đọc số rồi làm nhiều hơn cái hiệu quả. Ngày 6 có dữ liệu, nhóm nội dung nào ra liên hệ thật thì tăng,
  nhóm chỉ có view thì xem lại lời kêu gọi hành động.

Không làm, nhắc lại cho chắc: không mua lượt xem và người theo dõi, không tài khoản phụ, không thích và
bình luận hàng loạt bằng máy, không xoay proxy. Cái giá của mất tài khoản chính danh lớn hơn nhiều lần.
