# CLAUDE.md — sdvico-automation

> Bộ não dùng chung cho hệ thống tự động hóa Tuyển dụng và Marketing của SDVICO.
> Nguồn gốc yêu cầu: "Giao việc 7 ngày: Tự động hóa Tuyển dụng và Marketing bằng Claude Code", ban hành 10/8/2026.
> Mọi Skill, Slash Command, script trong repo phải tuân file này. Đọc trước khi làm bất cứ việc gì.

Ghi chú: đây là dự án riêng cho SDVICO, tách khỏi thử nghiệm `auto-hire-market`. Kiến trúc ở đây đã chốt (Supabase, GitHub Actions), không bàn lại.

---

## 1. Bối cảnh công ty

- Tên: Công ty TNHH Hiệp Lực Phát Triển Việt (viết tắt SDVICO).
- Lĩnh vực: phân phối thiết bị giám sát hành trình tàu cá và thiết bị liên lạc hàng hải cho ngành thủy sản. `[CẦN XÁC NHẬN với Phòng Kinh doanh: mô tả chính thức ngành nghề, quy mô, địa bàn]`
- Kênh liên hệ đã biết: tên miền sdvico.vn, hộp thư tuyển dụng tuyendung@sdvico.vn, tổng đài 1900 23 23 49.
- Vai trò trong chuỗi: SDVICO **phân phối thiết bị**. SDVICO **không sở hữu phần mềm** của các hãng đối tác (xem điều cấm 4).
- `[CẦN XÁC NHẬN: tầm nhìn, giá trị cốt lõi, khách hàng mục tiêu, khu vực hoạt động, số năm kinh nghiệm]`

Nguyên tắc điền mục này: chỉ ghi điều đã được Phòng Nhân sự hoặc Phòng Kinh doanh xác nhận. Không suy đoán, không lấy từ nguồn ngoài chưa kiểm chứng (điều cấm 5).

## 2. Danh mục sản phẩm

Thiết bị đối tác mà SDVICO phân phối (nêu trong văn bản giao việc): Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya.

Ranh giới bắt buộc khi viết nội dung về sản phẩm:
- Mô tả đúng vai trò: SDVICO là nhà phân phối, cung cấp, lắp đặt, bảo hành thiết bị. Không mô tả phần mềm của đối tác như năng lực do SDVICO làm ra.
- Chỉ nêu tính năng có trong tài liệu chính thức của hãng hoặc do công ty cung cấp. Không tự thêm thông số.

`[CẦN XÁC NHẬN với Phòng Kinh doanh: danh mục sản phẩm đầy đủ, nhóm sản phẩm, giá niêm yết nếu được công bố, chính sách bảo hành, dịch vụ kèm theo, tài liệu kỹ thuật gốc để trích dẫn]`

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
- Xưng hô và giọng điệu phù hợp ngành thủy sản và khách hàng là chủ tàu, doanh nghiệp, ngư dân. `[CẦN XÁC NHẬN: tông giọng thương hiệu mong muốn, điều nên tránh nói]`
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

Cập nhật lần cuối: 10/8/2026.
