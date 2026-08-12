# Hướng dẫn vận hành từ đầu

> Dành cho người chưa thiết lập gì. Làm tuần tự từ trên xuống. Mỗi phần ghi rõ cần khóa gì và làm ở đâu.
> Nguyên tắc bí mật xuyên suốt: khóa và mật khẩu điền vào `.env` cục bộ, biến môi trường Vercel, hoặc GitHub Secrets. Không dán vào chat, không commit vào Git (điều cấm 7).

## 0. Bức tranh tổng thể

Hệ thống có bốn chỗ chạy, mỗi chỗ một việc:

- **Supabase**: cơ sở dữ liệu và kho lưu CV. Trái tim dữ liệu.
- **Vercel**: chạy giao diện duyệt (trang web nội bộ để bạn xem, sửa, bấm Duyệt).
- **GitHub Actions**: chạy theo lịch các việc nền (nạp CV, chấm CV, soạn thư phỏng vấn).
- **Máy cục bộ của bạn**: chạy các lệnh thủ công (đăng tin Facebook, chạy thử).

Thứ tự thiết lập: lấy khóa, dựng cơ sở dữ liệu, chạy thử trên máy, đưa giao diện lên Vercel, bật lịch tự động, rồi chạy thử một vòng đầy đủ.

## 1. Tài khoản cần có

1. **GitHub**: đã có repo `ggakasr/sdvico-automation` (private).
2. **Supabase**: tạo tài khoản tại supabase.com, gói miễn phí đủ dùng.
3. **Groq**: tạo tài khoản tại console.groq.com, khóa miễn phí. Dùng để chấm CV và viết JD.
4. **Vercel**: tạo tài khoản tại vercel.com, nối với GitHub.
5. **Facebook**: một tài khoản Facebook thật của bạn để tạo app test. Xem `docs/facebook-test-setup.md`.
6. **Hộp thư nhận CV**: giai đoạn test dùng một Gmail riêng, bật xác thực hai bước và tạo App Password. Trước khi có CV thật của ứng viên, phải đổi sang hộp thư công ty (điều cấm 6).

## 2. Lấy khóa

**Supabase** (Project Settings, mục API):
- `SUPABASE_URL`: địa chỉ project.
- `SUPABASE_SERVICE_ROLE_KEY`: khóa service role, rất nhạy, chỉ để ở backend và Vercel, không đưa xuống trình duyệt.

**Groq** (console.groq.com/keys):
- `GROQ_API_KEY`.

**Facebook test** (làm theo `docs/facebook-test-setup.md`):
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`.

**Hộp thư IMAP** (Gmail test):
- `MAIL_IMAP_HOST=imap.gmail.com`, `MAIL_IMAP_PORT=993`, `MAIL_IMAP_USER` là địa chỉ Gmail, `MAIL_IMAP_PASSWORD` là App Password 16 ký tự (không phải mật khẩu tài khoản).

## 3. Dựng cơ sở dữ liệu Supabase

1. Tạo một project Supabase mới.
2. Mở **SQL Editor**, chạy lần lượt sáu file trong `supabase/migrations/` theo đúng thứ tự này (dán nội dung từng file rồi Run):
   1. `20260810090000_init.sql` (mười bảng nền)
   2. `20260810090100_rls.sql` (bật Row Level Security)
   3. `20260810140000_core.sql` (bảng cấu hình và bộ đếm)
   4. `20260811100000_management.sql` (nền tảng và tin đăng)
   5. `20260812090000_hr_social_posts.sql` (nội dung bài đăng Facebook)
   6. `20260812100000_hr_jobs_group.sql` (nhóm ngành cho vị trí)
3. Mở **Storage**, tạo một bucket tên `cv`, để **Private** (riêng tư). Đây là nơi lưu file CV.
4. Kiểm nhanh: vào Table Editor, thấy đủ các bảng `hr_jobs`, `hr_candidates`, `hr_applications`, `hr_job_posts`, `approval_queue`. Bảng `hr_candidates` và `hr_applications` phải có RLS bật.

Chi tiết thêm ở `supabase/README.md`.

## 4. Chạy thử trên máy cục bộ

1. Cài **Node.js 22** trở lên.
2. Ở thư mục repo, cài phụ thuộc một lần:
```bash
npm install
```
3. Tạo file `.env` ở gốc repo từ mẫu, rồi điền khóa:
```bash
cp .env.example .env
```
Điền tối thiểu: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`. Thêm `MAIL_IMAP_*` nếu chạy nạp CV, thêm `FACEBOOK_*` nếu đăng Facebook.
4. Chạy thử nạp một CV mà không cần hộp thư:
```bash
node packages/hr/src/intake/run.mjs --dry-run --file duong/dan/cv.pdf
```
5. Chạy giao diện duyệt ở máy: tạo file `apps/approval-ui/.env.local` với `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `APP_PASSWORD=matkhau-tuy-chon`, rồi:
```bash
npm run ui:dev
```
Mở http://localhost:3000, đăng nhập bằng `APP_USER` (mặc định sdvico) và `APP_PASSWORD` vừa đặt.

## 5. Đưa giao diện lên Vercel

Các tính năng mới hiện nằm ở nhánh `claude/automation-progress-summary-8ce55a`, chưa lên nhánh chính. Vercel thường deploy nhánh `main`, nên cần đưa code lên trước.

1. Đẩy nhánh lên GitHub rồi gộp vào `main`. Cách an toàn, có xem lại:
```bash
git push -u origin claude/automation-progress-summary-8ce55a
```
Rồi vào GitHub tạo Pull Request từ nhánh này vào `main`, xem lại và Merge. Vercel sẽ tự deploy lại `main`.

2. Nếu Vercel chưa có project cho repo này: vào vercel.com, Add New Project, chọn repo `sdvico-automation`. Đặt **Root Directory** là `apps/approval-ui` (vì đây là monorepo). Framework để Next.js.

3. Đặt biến môi trường trong Vercel (Project Settings, Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY` (để trang Tạo JD viết được bằng AI)
   - `APP_USER` (mặc định sdvico)
   - `APP_PASSWORD` (bắt buộc, nếu để trống app tự khóa ở môi trường thật để bảo vệ dữ liệu ứng viên)
   - `CV_BUCKET=cv`

4. Deploy. Mở URL Vercel, đăng nhập bằng `APP_USER` và `APP_PASSWORD`.

## 6. Bật lịch tự động (GitHub Actions)

Các việc nền chạy theo lịch qua GitHub Actions. Cần nạp khóa vào Secrets.

1. Vào GitHub repo, Settings, Secrets and variables, Actions, thêm các Repository secrets:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`
   - `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT`, `MAIL_IMAP_USER`, `MAIL_IMAP_PASSWORD`
   - `MAIL_INTAKE_ALLOWED_SENDERS` (giai đoạn test đặt chính địa chỉ của bạn, để chỉ nạp CV bạn tự gửi)
2. Các workflow đã có:
   - `hr-intake.yml`: nạp CV từ hộp thư, 30 phút một lần.
   - `hr-screen.yml`: chấm CV, mỗi giờ hai lần.
   - `hr-interview.yml`: soạn câu hỏi và thư mời phỏng vấn cho hồ sơ đã đưa vào phỏng vấn.
   - `hr-analyze.yml`: phân tích JD, chạy tay.
   - `daily-demo.yml`: đã tắt lịch.

## 7. Đăng tin Facebook (chạy trên máy cục bộ)

Phần này chưa có lịch tự động, chạy tay khi cần. Cần `.env` đủ `SUPABASE_*`, `GROQ_API_KEY`, và bốn khóa `FACEBOOK_*`.

1. Soạn bài và đẩy hàng đợi: bấm nút Soạn bài Facebook ở trang Vị trí và Đăng tin trong giao diện, hoặc chạy:
```bash
node packages/hr/src/post/queue-facebook.mjs
```
2. Vào giao diện, tab Tin đăng để xem và sửa, rồi bấm Duyệt ở trang Duyệt.
3. Đăng thử trước, không đăng thật:
```bash
node packages/hr/src/post/publish-facebook.mjs
```
4. Đăng thật lên Page nháp:
```bash
node packages/hr/src/post/publish-facebook.mjs --live
```

## 8. Chạy thử một vòng đầy đủ

1. **Tạo JD**: mở giao diện, trang Tạo JD, chọn nhóm ngành, nhập thông tin vị trí, bấm Tạo bốn bản JD. Sửa nếu cần, bấm Hoàn thành. Vị trí chuyển sang đang tuyển.
2. **Đăng tin**: trang Vị trí và Đăng tin, bấm Soạn bài Facebook cho vị trí đó, sang trang Duyệt bấm Duyệt, rồi chạy `publish-facebook.mjs --live`. Kiểm bài trên Page nháp.
3. **Nhận CV**: gửi một CV test vào hộp thư. Chờ workflow nạp, hoặc chạy `node packages/hr/src/intake/run.mjs`.
4. **Chấm và phỏng vấn**: chờ workflow chấm, xem điểm ở trang Hồ sơ, bấm đưa vào phỏng vấn, chờ workflow soạn thư mời, duyệt ở trang Duyệt.

## 9. Trước khi chuyển sang dùng thật

- Đổi hộp thư test sang hộp thư công ty trước khi CV thật của ứng viên chảy vào (điều cấm 6).
- Chuẩn bị mẫu văn bản đồng ý xử lý dữ liệu theo Nghị định 13/2023.
- Facebook: chỉ chuyển từ Page nháp sang Page thật khi đã chạy sạch nhiều lần, và có người duyệt cuối cho nội dung chạm quy định nhà nước (điều cấm 3).
- Mọi thư và bài đăng luôn qua bước người bấm Duyệt. Không có đường tự gửi (điều cấm 1).

## Tóm tắt khóa theo nơi đặt

| Nơi | Khóa cần đặt |
|---|---|
| `.env` ở gốc (máy cục bộ) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, MAIL_IMAP_*, FACEBOOK_*, HR_FB_MAX_PER_DAY |
| `apps/approval-ui/.env.local` (giao diện local) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, APP_PASSWORD |
| Vercel Environment Variables | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, APP_USER, APP_PASSWORD, CV_BUCKET |
| GitHub Actions Secrets | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, MAIL_IMAP_*, MAIL_INTAKE_ALLOWED_SENDERS |
