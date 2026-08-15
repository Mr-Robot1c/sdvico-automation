# .github/workflows

Lịch chạy bằng GitHub Actions schedule. Không dùng n8n, không dùng Make.

Khóa và mật khẩu đặt trong GitHub Secrets, không viết thẳng vào file workflow.

## Có gì ở đây

| File | Lịch | Việc |
|---|---|---|
| `cron.yml` | 15 phút một lần | Gọi ba endpoint trên Vercel: soạn bài, đăng Facebook đã duyệt, đăng LinkedIn đã duyệt |
| `hr-intake.yml` | 30 phút một lần | Nạp CV từ hộp thư, trích, chuẩn hóa, khử trùng lặp |
| `hr-screen.yml` | Phút 15 và 45 mỗi giờ | Chấm CV ẩn danh, xếp hạng. Không tự loại ai, điều cấm 2 |
| `hr-interview.yml` | Phút 25 mỗi giờ | Soạn câu hỏi và thư mời cho hồ sơ đã đưa vào phỏng vấn |
| `deploy-vercel.yml` | Khi push vào main | Deploy giao diện duyệt lên Vercel |
| `hr-analyze.yml` | Chạy tay | Phân tích một mô tả công việc thành tiêu chí tuyển dụng |
| `hr-compose.yml` | Chạy tay | Soạn bài tuyển dụng Facebook cho một vị trí |
| `hr-post.yml` | Chạy tay | Đăng tin Facebook, có chế độ chạy thử |
| `daily-demo.yml` | Đã tắt lịch | Sinh mục demo cho hàng đợi duyệt, giữ lại để diễn thử |

## Secrets cần đặt

| Secret | Dùng ở đâu |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | hr-intake, hr-screen, hr-interview, hr-analyze, hr-compose, hr-post |
| `GROQ_API_KEY` | Mọi workflow có gọi mô hình |
| `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT`, `MAIL_IMAP_USER`, `MAIL_IMAP_PASSWORD` | hr-intake |
| `MAIL_INTAKE_ALLOWED_SENDERS` | hr-intake, lọc người gửi ở giai đoạn thử |
| `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` | hr-post, hr-compose |
| `CRON_SECRET`, `VERCEL_URL` | cron.yml. `CRON_SECRET` phải trùng giá trị đặt trên Vercel |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` | deploy-vercel |
| `CV_BUCKET`, `HR_RETENTION_MONTHS` | hr-intake, có thể để trống, code có giá trị mặc định |
| `HR_SCREEN_MODEL`, `HR_INTERVIEW_MODEL`, `HR_ANALYZE_MODEL`, `HR_POST_MODEL` | Chọn model, để trống thì dùng llama-3.3-70b-versatile |

## Hạn mức phút chạy, cần theo dõi

Repo private chỉ có 2.000 phút Actions miễn phí mỗi tháng, và GitHub làm tròn mỗi job lên
một phút. Đây là lý do `cron.yml` gộp ba lệnh gọi vào một job thay vì tách ba workflow.

Ước tính hiện tại: `cron.yml` khoảng 96 phút một ngày, `hr-intake` và `hr-screen` mỗi cái
khoảng 48 lượt một ngày và có bước `npm ci` nên nặng hơn. Cộng lại vẫn vượt mức miễn phí.
Nếu Actions báo hết phút thì có hai đường: giãn `cron.yml` xuống 30 phút một lần, hoặc
chuyển phần gọi endpoint sang một dịch vụ ping bên ngoài như cron-job.org, giữ Actions cho
các việc cần checkout code.
