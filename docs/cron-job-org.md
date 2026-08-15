# Chuyển lịch chạy nền sang cron-job.org

> Thay cho GitHub Actions schedule. Làm một lần, khoảng mười lăm phút.
> Việc nền của hệ thống là ba lệnh gọi HTTP tới app trên Vercel, nên dịch vụ nào gọi cũng được.

## Vì sao đổi

GitHub Actions có hai điểm vướng với việc gọi endpoint mỗi 15 phút:

1. Job hỏng là GitHub gửi mail báo, mỗi 15 phút một lần.
2. Repo private chỉ có 2.000 phút miễn phí mỗi tháng, mà GitHub làm tròn mỗi lượt chạy lên
   một phút dù lệnh curl chỉ mất vài giây. Riêng lịch 15 phút đã tốn khoảng 96 phút một ngày,
   tức là hết sạch hạn mức trong ba tuần, chưa tính đường nạp CV và chấm CV.

cron-job.org gọi HTTP thẳng, không dựng máy ảo, gói miễn phí đủ cho ba job này.

Workflow `cron.yml` vẫn còn nhưng đã tắt lịch, giữ nút Run workflow để chạy tay khi cần
chẩn đoán hoặc muốn thúc worker chạy ngay.

## Trước khi dựng, kiểm endpoint còn sống

Làm bước này trước. Nếu endpoint đang lỗi thì chuyển sang cron-job.org cũng chỉ đổi chỗ báo lỗi.

Thay hai giá trị trong lệnh dưới rồi chạy ở máy. `CRON_SECRET` lấy đúng giá trị đang đặt
trong Vercel, mục Project Settings, Environment Variables.

```bash
curl -i -H "Authorization: Bearer DAN_CRON_SECRET_VAO_DAY" https://TEN-APP.vercel.app/api/cron/compose
```

Đọc mã trả về:

| Mã | Nghĩa | Cách chữa |
|---|---|---|
| 200 | Chạy tốt | Dựng tiếp bên dưới |
| 401 | Sai hoặc thiếu `CRON_SECRET` | Đặt lại biến này trên Vercel, redeploy, rồi dùng đúng giá trị đó cho cron-job.org |
| 503 | Thiếu `APP_PASSWORD` trên Vercel | Đặt biến đó rồi redeploy |
| 404 | Sai địa chỉ app, hoặc bản deploy chưa có route này | Kiểm lại tên app và xem deploy mới nhất đã xanh chưa |
| 500 | Endpoint chạy nhưng vấp lỗi bên trong | Đọc nội dung trả về, thường là thiếu biến Supabase hoặc Facebook |

## Dựng ba job trên cron-job.org

1. Vào https://cron-job.org, tự tạo tài khoản và đăng nhập. Việc này bạn tự làm, không giao cho máy.
2. Bấm **Create cronjob**. Làm ba lần, mỗi lần một dòng trong bảng sau.

| Tên job | URL | Lịch |
|---|---|---|
| SDVICO soạn bài | `https://TEN-APP.vercel.app/api/cron/compose` | Mỗi 15 phút |
| SDVICO đăng Facebook | `https://TEN-APP.vercel.app/api/cron/publish` | Mỗi 15 phút |
| SDVICO đăng LinkedIn | `https://TEN-APP.vercel.app/api/cron/linkedin-publish` | Mỗi 15 phút |

3. Với mỗi job, mở tab **Advanced** rồi đặt:

   - **Request method**: GET.
   - **Headers**: thêm một dòng, tên `Authorization`, giá trị `Bearer ` rồi dán `CRON_SECRET`
     ngay sau dấu cách. Đây là chỗ duy nhất phải dán bí mật, và nó chỉ là chìa mở worker,
     không phải khóa dữ liệu ứng viên.
   - **Request timeout**: 60 giây. Ba endpoint đều khai `maxDuration = 60`.
   - **Treat redirects as success**: tắt.
   - **Notify on failure**: bật, để biết khi worker chết. Nếu muốn bớt mail thì đặt báo sau
     vài lượt hỏng liên tiếp thay vì hỏng lượt nào báo lượt đó.

4. Lệch giờ ba job cho đỡ chạm nhau: soạn bài chạy phút 0, 15, 30, 45; đăng Facebook chạy
   phút 5, 20, 35, 50; đăng LinkedIn chạy phút 10, 25, 40, 55. Đăng bài phải chạy sau soạn bài
   thì bài mới duyệt xong mới kịp lên.

5. Bấm **Save**, rồi bấm **Run now** một lần cho từng job. Xem tab **History**, cả ba phải
   trả 200. Job LinkedIn trả 200 kèm `linkedin_not_configured` là đúng khi chưa đặt token.

## Sau khi dựng xong

- Vào GitHub, tab Actions, xác nhận `Cron — Chu kỳ 15 phút (chạy tay)` không còn tự chạy nữa.
  Mail báo lỗi sẽ ngừng.
- Hai secret `CRON_SECRET` và `VERCEL_URL` trên GitHub vẫn giữ, vì nút chạy tay còn dùng.
- Đường nạp CV (`hr-intake`), chấm CV (`hr-screen`) và soạn thư phỏng vấn (`hr-interview`)
  vẫn ở GitHub Actions. Ba việc đó cần checkout code và chạy Node nên không chuyển đi được,
  và lịch của chúng thưa hơn nhiều.

## Nếu muốn quay lại GitHub Actions

Mở `.github/workflows/cron.yml`, thêm lại hai dòng dưới vào mục `on`, rồi tắt ba job bên
cron-job.org để khỏi chạy chồng:

```yaml
  schedule:
    - cron: '*/15 * * * *'
```
