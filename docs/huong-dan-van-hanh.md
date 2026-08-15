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
2. Mở **SQL Editor**, chạy lần lượt **tất cả** file trong `supabase/migrations/` theo đúng thứ tự tên file (dán nội dung từng file rồi Run). Tên file bắt đầu bằng ngày giờ nên cứ sắp xếp tăng dần là đúng thứ tự. Bốn file đầu dựng nền, các file sau thêm cột và bảng cho từng tính năng:
   1. `20260810090000_init.sql` (mười bảng nền)
   2. `20260810090100_rls.sql` (bật Row Level Security)
   3. `20260810140000_core.sql` (bảng cấu hình và bộ đếm)
   4. `20260811100000_management.sql` (nền tảng và tin đăng)
   5. Các file `202608...` còn lại: bài đăng Facebook và LinkedIn, nhóm ngành, ảnh và poster, số lượng cần tuyển, quyền lợi, lịch phỏng vấn.

   Áp thiếu một file thì giao diện sẽ báo lỗi thiếu cột, không mất dữ liệu. Cứ chạy nốt file còn thiếu là xong.
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

Toàn bộ tính năng đã nằm ở nhánh `main`. Mỗi lần push vào `main` có đụng `apps/approval-ui`, workflow `deploy-vercel.yml` tự deploy bản production. Không cần bấm gì thêm.

1. Nếu Vercel chưa có project cho repo này: vào vercel.com, Add New Project, chọn repo `sdvico-automation`. Đặt **Root Directory** là `apps/approval-ui` (vì đây là monorepo). Framework để Next.js.

2. Đặt biến môi trường trong Vercel (Project Settings, Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY` (để trang Tạo JD viết được bằng AI)
   - `APP_USER` (mặc định sdvico)
   - `APP_PASSWORD` (bắt buộc, nếu để trống app tự khóa ở môi trường thật để bảo vệ dữ liệu ứng viên)
   - `CRON_SECRET` (bắt buộc, phải trùng với secret cùng tên trên GitHub, nếu không worker nền không gọi vào được)
   - `CV_BUCKET=cv`
   - `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` (để giao diện đăng bài lên Page)
   - `UNSPLASH_ACCESS_KEY` (tùy chọn, để bài đăng có ảnh nền)
   - `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (để gửi thư mời phỏng vấn. Bỏ trống hai cái đầu thì dùng lại `MAIL_IMAP_USER` và `MAIL_IMAP_PASSWORD`)
   - `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_URN` (chỉ khi bật kênh LinkedIn)

3. Để deploy tự động chạy được, thêm hai secret vào GitHub: `VERCEL_TOKEN` và `VERCEL_PROJECT_ID`.

4. Mở URL Vercel, đăng nhập bằng `APP_USER` và `APP_PASSWORD`.

Lưu ý gói Hobby không cho đặt cron trong `vercel.json`, nên file đó để rỗng và lịch chạy nằm hết ở GitHub Actions.

## 6. Bật lịch tự động (GitHub Actions)

Các việc nền chạy theo lịch qua GitHub Actions. Cần nạp khóa vào Secrets.

1. Vào GitHub repo, Settings, Secrets and variables, Actions, thêm các Repository secrets:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`
   - `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT`, `MAIL_IMAP_USER`, `MAIL_IMAP_PASSWORD`
   - `MAIL_INTAKE_ALLOWED_SENDERS` (giai đoạn test đặt chính địa chỉ của bạn, để chỉ nạp CV bạn tự gửi)
   - `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`
   - `CRON_SECRET` và `VERCEL_URL` (địa chỉ đầy đủ của app, dạng https://ten-app.vercel.app, không có dấu gạch chéo cuối)
   - `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`
2. Danh sách workflow, lịch chạy và secrets tương ứng ở `.github/workflows/README.md`.
3. Kiểm nhanh: vào tab Actions, chọn `Cron — Chu kỳ 15 phút`, bấm Run workflow. Cả ba bước phải trả HTTP 200. Bước LinkedIn trả 200 kèm `linkedin_not_configured` là bình thường khi chưa đặt token.

Chú ý hạn mức: repo private chỉ có 2.000 phút Actions miễn phí mỗi tháng. Nếu Actions báo hết phút, giãn `cron.yml` xuống 30 phút một lần hoặc chuyển phần gọi endpoint sang dịch vụ ping bên ngoài.

## 7. Đăng tin Facebook

Chạy tự động qua giao diện, không cần gõ lệnh.

1. Trang Vị trí, bấm Soạn bài. Máy viết nội dung và sinh poster, đẩy vào hàng đợi duyệt.
2. Trang Duyệt và gửi, xem lại nội dung, sửa nếu cần, bấm Duyệt. Đây là cổng của điều cấm 1.
3. Bài đã duyệt được worker `cron.yml` đăng lên Page trong vòng 15 phút. Đặt giờ hẹn thì Facebook tự đăng đúng giờ.
4. Bài đăng hỏng hoặc thừa thì xóa trong giao diện, hệ thống gỡ luôn khỏi Facebook.

Vẫn giữ đường chạy tay trên máy khi cần chẩn đoán, cần `.env` đủ `SUPABASE_*`, `GROQ_API_KEY` và các khóa `FACEBOOK_*`:

```bash
node packages/hr/src/post/queue-facebook.mjs
```

```bash
node packages/hr/src/post/publish-facebook.mjs --live
```

Bỏ cờ `--live` thì chỉ in ra, không đăng thật.

## 8. Chạy thử một vòng đầy đủ

1. **Tạo JD**: mở giao diện, trang Tạo JD, chọn nhóm ngành, nhập thông tin vị trí, bấm Tạo bốn bản JD. Sửa nếu cần, bấm Hoàn thành. Vị trí chuyển sang đang tuyển.
2. **Đăng tin**: trang Vị trí, bấm Soạn bài cho vị trí đó. Sang trang Duyệt và gửi, xem poster và nội dung, bấm Duyệt. Chờ tối đa 15 phút cho worker đăng, hoặc chạy tay workflow `Cron — Chu kỳ 15 phút` cho nhanh. Kiểm bài trên Page nháp.
3. **Nhận CV**: gửi một CV test vào hộp thư. Chờ workflow nạp, hoặc chạy `node packages/hr/src/intake/run.mjs`.
4. **Chấm và xếp hạng**: chờ workflow chấm, xem điểm ở trang Hồ sơ ứng viên.
5. **Mời phỏng vấn**: bấm đưa hồ sơ vào phỏng vấn. Máy soạn câu hỏi và thư mời, đẩy vào hàng đợi. Bấm Duyệt thì thư đi và ứng viên nhận được link tự chọn khung giờ.
6. **Chốt kết quả**: sau phỏng vấn, đánh dấu đã phỏng vấn rồi bấm nhận hoặc từ chối. Thư kết quả cũng qua bước người bấm.

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
| Vercel Environment Variables | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, APP_USER, APP_PASSWORD, CRON_SECRET, CV_BUCKET, FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN, UNSPLASH_ACCESS_KEY, SMTP_*, LINKEDIN_* |
| GitHub Actions Secrets | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, MAIL_IMAP_*, MAIL_INTAKE_ALLOWED_SENDERS, FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN, CRON_SECRET, VERCEL_URL, VERCEL_TOKEN, VERCEL_PROJECT_ID |

Danh sách đầy đủ kèm giải thích từng biến ở `.env.example`.
