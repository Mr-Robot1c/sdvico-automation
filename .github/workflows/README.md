# .github/workflows

Lịch chạy bằng GitHub Actions schedule. Không dùng n8n, không dùng Make.

Khóa và mật khẩu đặt trong GitHub Secrets, không viết thẳng vào file workflow.

## Có gì ở đây

| File | Lịch | Việc |
|---|---|---|
| `cron.yml` | Đã tắt lịch, chạy tay | Gọi ba endpoint trên Vercel: soạn bài, đăng Facebook đã duyệt, đăng LinkedIn đã duyệt. Lịch 15 phút đã chuyển sang cron-job.org, xem [docs/cron-job-org.md](../../docs/cron-job-org.md) |
| `hr.yml` | Đầu mỗi giờ | Ba bước nối nhau trong một lượt: nạp CV, chấm CV ẩn danh, soạn câu hỏi và thư mời |
| `hr-engage.yml` | 14:30 giờ VN mỗi ngày | Soạn một bài tương tác hâm nóng trang, đẩy hàng đợi duyệt. Dùng chung worker đăng Facebook với tin tuyển dụng |
| `deploy-vercel.yml` | Khi push vào main | Deploy giao diện duyệt lên Vercel |
| `hr-analyze.yml` | Chạy tay | Phân tích một mô tả công việc thành tiêu chí tuyển dụng |
| `hr-compose.yml` | Chạy tay | Soạn bài tuyển dụng Facebook cho một vị trí |
| `hr-post.yml` | Chạy tay | Đăng tin Facebook, có chế độ chạy thử |
| `daily-demo.yml` | Đã tắt lịch | Sinh mục demo cho hàng đợi duyệt, giữ lại để diễn thử |

## Secrets cần đặt

| Secret | Dùng ở đâu |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | hr, hr-analyze, hr-compose, hr-post |
| `GROQ_API_KEY` | Mọi workflow có gọi mô hình |
| `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT`, `MAIL_IMAP_USER`, `MAIL_IMAP_PASSWORD` | hr, bước nạp CV |
| `MAIL_INTAKE_ALLOWED_SENDERS` | hr, lọc người gửi ở giai đoạn thử |
| `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` | hr-post, hr-compose |
| `CRON_SECRET`, `VERCEL_URL` | cron.yml. `CRON_SECRET` phải trùng giá trị đặt trên Vercel |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` | deploy-vercel |
| `CV_BUCKET`, `HR_RETENTION_MONTHS` | hr, có thể để trống, code có giá trị mặc định |
| `HR_SCREEN_MODEL`, `HR_INTERVIEW_MODEL`, `HR_ANALYZE_MODEL`, `HR_POST_MODEL` | Chọn model, để trống thì dùng llama-3.3-70b-versatile |

## Hạn mức phút chạy

Repo private có 2.000 phút Actions miễn phí mỗi tháng. Điều nhiều người bỏ sót: **GitHub làm
tròn mỗi lượt chạy job lên một phút**, dù lệnh chỉ mất vài giây. Nghĩa là số tiền phụ thuộc
vào **số lượt chạy**, không phụ thuộc mỗi lượt nhanh hay chậm. Tối ưu cho chạy nhanh hơn
không cứu được gì khi số lượt vẫn nguyên.

Cách bố trí hiện tại, tính theo sàn một phút mỗi lượt:

| Việc | Lượt mỗi ngày | Phút mỗi tháng, tối thiểu |
|---|---|---|
| `hr.yml`, một giờ một lần | 24 | 720 |
| `hr-engage.yml`, một ngày một lần | 1 | 30 |
| `deploy-vercel.yml`, chỉ khi push | vài lượt | không đáng kể |
| Ba endpoint chạy nền | 0, đã sang cron-job.org | 0 |

Thực tế mỗi lượt `hr.yml` chạy khoảng một tới hai phút, nên ước chừng 1.500 phút một tháng,
nằm trong mức miễn phí và còn dư chỗ cho deploy và các lần bấm chạy tay.

Trước đây ba workflow riêng chạy 120 lượt một ngày, tức ít nhất 3.600 phút một tháng, vượt
mức miễn phí gần gấp đôi. Đó là lý do gộp lại.

Nếu sau này thêm việc nền, nhớ tính theo số lượt trước khi đặt lịch dày.
