# CLAUDE.md — sdvico-automation

> Bộ não dùng chung cho hệ thống tự động hóa Tuyển dụng và Marketing của SDVICO.
> Nguồn gốc yêu cầu: "Giao việc 7 ngày: Tự động hóa Tuyển dụng và Marketing bằng Claude Code", ban hành 10/8/2026.
> Mọi Skill, Slash Command, script trong repo phải tuân file này. Đọc trước khi làm bất cứ việc gì.

Ghi chú: đây là dự án riêng cho SDVICO, tách khỏi thử nghiệm `auto-hire-market`. Kiến trúc ở đây đã chốt (Supabase, GitHub Actions), không bàn lại.

---

## 1. Bối cảnh công ty

- Tên: Công ty TNHH Hiệp Lực Phát Triển Việt, viết tắt SDVICO.
- Khẩu hiệu: "Công nghệ số cho ngành biển và thủy sản".
- Lĩnh vực: cung cấp sản phẩm và giải pháp công nghệ cho ngành biển và thủy sản, phục vụ ngư dân, tàu cá và doanh nghiệp trong ngành, hướng tới nâng cao hiệu quả đánh bắt và giảm chi phí đầu vào.
- Nguồn gốc: thành lập năm 2014, khởi đầu từ sản phẩm máy lọc nước biển thành nước ngọt cho tàu cá, do một nhóm giảng viên Trường Đại học Bà Rịa Vũng Tàu phát triển.
- Khách hàng mục tiêu: ngư dân, chủ tàu cá, doanh nghiệp ngành biển và thủy sản.
- Địa chỉ: 283 Nguyễn Hữu Cảnh, Phường Rạch Dừa, TP. Hồ Chí Minh (đơn vị hành chính sau khi Bà Rịa Vũng Tàu sáp nhập vào TP. Hồ Chí Minh).
- Liên hệ: website sdvico.vn, hotline 1900 23 23 49, hộp thư tuyển dụng tuyendung@sdvico.vn.
- Vai trò trong chuỗi: SDVICO vừa phát triển một số sản phẩm, khởi đầu là máy lọc nước, vừa phân phối và lắp đặt thiết bị của các hãng. SDVICO không sở hữu phần mềm của các hãng đối tác, xem điều cấm 4.

Nguyên tắc điền mục này: các dữ kiện lấy từ trang chính thức sdvico.vn, tra ngày 10/8/2026. Mục nào còn đánh dấu cần xác nhận thì Phòng Kinh doanh hoặc Phòng Nhân sự chốt lại. Không suy đoán, không lấy từ nguồn ngoài chưa kiểm chứng, điều cấm 5.

## 2. Danh mục sản phẩm

Nhóm sản phẩm theo trang sdvico.vn:

1. Thiết bị giám sát hành trình tàu cá: Viettel S-Tracking, Thuraya MarineStar MNB-01 loại hỗ trợ nghe gọi.
2. Điện thoại vệ tinh: XT-Pro.
3. Máy lọc nước biển thành nước ngọt, ví dụ máy lọc nước 80 lít.
4. Thiết bị xử lý dầu, giúp tiết kiệm dầu diesel cho tàu cá.
5. Dầu nhớt: PVOil Nano Graphene và PV Engine RMI Nano Graphene. SDVICO là nhà phân phối ủy quyền dầu nhớt PVOIL.

Thương hiệu và hãng nhắc trên trang: Viettel, Thuraya, PVOIL. Ngoài ra SDVICO hợp tác với VNPT và VISHIPEL trong lĩnh vực giải pháp kết nối, viễn thông và công nghệ hàng hải.

Đây chưa phải danh sách đầy đủ. SDVICO hợp tác với nhiều đơn vị khác nữa. Trước khi viết bài nhắc tên một hãng cụ thể mà chưa liệt kê ở đây, tra lại trang sdvico.vn hoặc hỏi Phòng Kinh doanh. Không tự thêm đối tác chưa xác nhận, điều cấm 5.

Ranh giới bắt buộc khi viết nội dung về sản phẩm:
- Phân biệt rõ sản phẩm do SDVICO phát triển, như máy lọc nước, với thiết bị SDVICO phân phối và lắp đặt, như thiết bị định vị và dầu nhớt.
- Với thiết bị của hãng, mô tả đúng vai trò của SDVICO là phân phối, cung cấp, lắp đặt, bảo hành. Không mô tả phần mềm của hãng như năng lực do SDVICO làm ra, điều cấm 4.
- Chỉ nêu tính năng có trong tài liệu chính thức của hãng hoặc do công ty cung cấp. Không tự thêm thông số, điều cấm 5.

`[CẦN XÁC NHẬN với Phòng Kinh doanh: giá niêm yết nếu được công bố, chính sách bảo hành, dịch vụ kèm theo, tài liệu kỹ thuật gốc để trích dẫn]`

## 3. Bảy điều cấm

Giữ nguyên, không đàm phán, kể cả khi gấp:

1. Máy soạn, người bấm gửi. Không tự động gửi thư hoặc tin nhắn tới ứng viên và khách hàng.
2. Không tự động loại ứng viên. Máy xếp hạng, người quyết.
3. Nội dung liên quan quy định nhà nước, IUU, Cục Thủy sản và Kiểm ngư phải qua duyệt của cấp quản lý trước khi đăng.
4. Không mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như năng lực của SDVICO. Công ty phân phối thiết bị, không sở hữu phần mềm của họ.
5. Không bịa số liệu, giải thưởng, khách hàng, đối tác.
6. Không đưa dữ liệu ứng viên ra khỏi hạ tầng công ty.
7. Không commit khóa và mật khẩu vào Git.

Cách thực thi trong code:
- Điều 1 và 2: mọi thư mời, thư từ chối, bài đăng đi qua bảng `approval_queue`, trạng thái mặc định `pending`, người bấm mới chuyển `approved`. Không có nhánh nào gọi thẳng hàm gửi mà bỏ qua hàng đợi.
- Điều 3: bản ghi `mkt_content` có cột `needs_gov_review`. Đặt true cho nội dung chạm quy định nhà nước, IUU, Cục Thủy sản và Kiểm ngư. Chưa có người duyệt cấp quản lý thì không cho đăng.
- Điều 6: dữ liệu ứng viên nằm trong Supabase của công ty, bật RLS. Không sao ra dịch vụ ngoài, không đưa vào prompt gửi ra ngoài phần nhận dạng cá nhân khi không cần.
- Điều 7: khóa và mật khẩu chỉ nằm trong biến môi trường và trình quản lý bí mật. File `.env` bị Git bỏ qua. Chỉ commit `.env.example` không có giá trị thật.

## 4. Chuẩn giọng văn

Nội dung sinh ra phải đọc như người Việt viết.

Quy tắc bắt buộc:
- Không dùng gạch dài. Không dùng mũi tên. Không dùng dấu chấm tròn giữa câu. Không dùng ký hiệu thay chữ "và".
- Số theo chuẩn Việt Nam, dùng dấu chấm ngăn cách hàng nghìn. Ví dụ 3.000.000 đồng.
- Câu rõ ràng, không sáo rỗng, không dịch máy. Không mở đầu bằng những cụm như "trong thế giới ngày nay".
- Xưng hô và giọng điệu gần gũi với ngư dân và chủ tàu, thực tế, dễ hiểu. Nhấn mạnh lợi ích cụ thể như ra khơi an toàn, tuân thủ quy định, tiết kiệm chi phí nhiên liệu và nước ngọt. Chuyên nghiệp nhưng tránh thuật ngữ rườm rà. `[Phòng Kinh doanh có thể tinh chỉnh tông giọng và bổ sung điều nên tránh nói]`
- Không hứa hẹn quá khả năng, không so sánh hạ thấp đối thủ, không bịa (nối điều cấm 5).

Kiểm thử giọng văn: Skill `brand-voice` và `product-boundary` phải bắt được các lỗi trên, kiểm trên tối thiểu 20 đoạn văn cài lỗi sẵn (theo lịch Ngày 2).

## 5. Kiến trúc và cấu trúc repo

Đã chốt, không bàn lại:
- Điều phối: GitHub Actions schedule và cron nội bộ. Không dùng n8n, không dùng Make.
- Suy luận ngôn ngữ: Claude Code chế độ headless.
- Dữ liệu: Supabase PostgreSQL và Supabase Storage.
- Giao diện duyệt: Next.js trên Vercel.
- Tự động thao tác web: Playwright chạy Chrome thật. Nguyên lý ở tài liệu kế hoạch Phần 5 và Phần 6, tóm tắt trong `packages/core`.
- Video: ffmpeg và Whisper trên máy nội bộ.

```
sdvico-automation/
  CLAUDE.md
  .claude/skills/      brand-voice, product-boundary, cv-screening, seo-brief
  .claude/commands/    hr-jd, hr-intake, mkt-brief, mkt-draft, mkt-publish
  packages/core/       supabase client, run_log, approval_queue, browser runner
  packages/hr/         phần Tuyển dụng
  packages/marketing/  phần Marketing
  apps/approval-ui/    giao diện duyệt
  supabase/migrations/ lược đồ và RLS
  .github/workflows/   lịch chạy
```

## 6. Dữ liệu

Bảng tối thiểu: `approval_queue`, `run_log`, `brand_assets`, `hr_jobs`, `hr_candidates`, `hr_applications`, `mkt_keywords`, `mkt_content`, `mkt_posts`, `mkt_metrics`.

Bật Row Level Security cho bảng có dữ liệu cá nhân, trọng tâm là `hr_candidates` và `hr_applications`. Backend dùng khóa service role và tự bỏ qua RLS. Ứng dụng duyệt dùng người đăng nhập nội bộ. Lược đồ và chính sách ở `supabase/migrations`, cách áp dụng ở `supabase/README.md`.

Quy tắc dữ liệu:
- Khử trùng lặp ứng viên theo email và số điện thoại, lưu ở cột `dedup_key`.
- Ghi consent và thời hạn lưu theo Nghị định 13/2023 ở `hr_candidates.consent_at` và `retention_until`.
- Mọi thao tác tự động ghi vào `run_log`, kèm ảnh chụp khi lỗi.

## 7. Quy tắc làm việc trong bảy ngày

- Chạy trước, đẹp sau.
- Mỗi giả định nghiệp vụ đi hỏi người đang làm việc đó, không suy đoán.
- Không ai merge code của chính mình, đổi vai review chéo mỗi cuối ngày.
- Vướng quá 2 giờ thì hỏi.
- Gặp rào chắn của nền tảng thì dừng, không phá rào (chi tiết Phần 6 của kế hoạch).

## Commit và bí mật

- Commit theo dạng `<loại>(<phạm vi>): <mô tả>`. Loại gồm feat, fix, refactor, docs, chore, test.
- Không commit `.env`, khóa API, mật khẩu, cookie, hồ sơ trình duyệt Playwright.
- Kết thúc thông điệp commit bằng dòng đồng tác giả theo quy ước của đội.

---

Nguồn dữ kiện công ty và sản phẩm: trang chính thức sdvico.vn, tra ngày 10/8/2026. Các mục còn đánh dấu cần xác nhận vẫn chờ Phòng Kinh doanh hoặc Phòng Nhân sự chốt.

Cập nhật lần cuối: 10/8/2026.
