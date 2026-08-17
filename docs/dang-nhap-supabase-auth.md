# Bật đăng nhập theo từng người (magic link)

> Thay cho HTTP Basic Auth dùng chung mật khẩu. Mỗi nhân sự có tài khoản riêng, có audit ai bấm gì.
> Chưa làm xong toàn bộ các bước dưới thì đừng đổi `AUTH_MODE=supabase`, giữ nguyên `basic` để app không hỏng.

## Vì sao đổi

- Hiện một mật khẩu `APP_PASSWORD` dùng chung. Ai có mật khẩu thấy toàn bộ CV, không truy được ai đã bấm Duyệt. Điều cấm 6 và điều cấm 1 đều dính.
- Magic link không cần mật khẩu. Nhân sự nhập email, nhận link qua mail công ty, bấm là vào.
- Mỗi hành động (bấm Duyệt, xem hồ sơ) sẽ ghi lại email người bấm.

## Điều kiện tiên quyết

- Đã có project Supabase và Auth mặc định đang bật (bật sẵn khi tạo project mới).
- Có quyền admin trong project Supabase để cấu hình.

## Bước 1. Áp migration bảng danh sách trắng

Vào Supabase SQL Editor, chạy nguyên file `supabase/migrations/20260815000000_hr_users.sql`. Có bảng `hr_users` là xong.

## Bước 2. Cấu hình Supabase Auth

Vào Supabase project, mục **Authentication**.

1. **Providers**: xác nhận **Email** đang bật (mặc định bật).
2. **URL Configuration**:
   - **Site URL**: `https://ten-app.vercel.app` (địa chỉ Vercel của bạn, không có dấu gạch chéo cuối).
   - **Redirect URLs**: thêm `https://ten-app.vercel.app/api/auth/callback`. Nếu chạy thử ở máy thì thêm cả `http://localhost:3000/api/auth/callback`.
3. **Email Templates**, mục **Magic Link**: có thể sửa nội dung mail cho gọn (không bắt buộc). Nội dung mặc định của Supabase đã đủ.
4. **Email**, mục **SMTP Settings**:
   - **Bỏ qua** nếu chỉ dùng thử: Supabase có SMTP mặc định, giới hạn khoảng 4 mail một giờ, đủ cho vài nhân sự đăng nhập test.
   - **Cấu hình SMTP riêng** khi dùng thật: dùng chính SMTP của công ty (`SMTP_USER`/`SMTP_PASS` đang dùng để gửi thư ứng viên), để mail không bị rate limit và không đến từ địa chỉ `noreply@supabase.io`.

## Bước 3. Thêm nhân sự vào danh sách trắng

SQL Editor:

```sql
insert into public.hr_users (email, full_name, role) values
  ('ha@sdvico.vn', 'Nguyễn Thị Hà', 'admin'),
  ('minh@sdvico.vn', 'Trần Văn Minh', 'staff');
```

Role có hai giá trị: `admin` và `staff`. Hiện code chưa phân quyền chi tiết theo role, chỉ hiện nhãn ở sidebar. Sau này chặn thêm hành động theo role thì dùng cột này.

Vô hiệu hóa một tài khoản (không xóa, để giữ audit):

```sql
update public.hr_users set disabled_at = now() where email = 'nguoinghi@sdvico.vn';
```

## Bước 4. Đặt biến môi trường trên Vercel

Vào Project Settings, Environment Variables.

| Biến | Giá trị |
|---|---|
| `AUTH_MODE` | `supabase` |
| `SUPABASE_ANON_KEY` | anon public key ở Supabase, Settings → API. Khóa này an toàn để chạy ở client |

Chú ý: `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` đã có sẵn, không đụng.

Sau khi lưu, vào **Deployments**, bản trên cùng, ba chấm, **Redeploy**. Biến mới cần deploy mới có hiệu lực.

## Bước 5. Kiểm

1. Mở `https://ten-app.vercel.app`. Nếu chưa đăng nhập, app tự chuyển sang `/dang-nhap`.
2. Nhập email đã thêm vào `hr_users`, bấm **Gửi link đăng nhập**.
3. Mở mail, bấm link. Trình duyệt về trang chính, chân sidebar hiện tên và email.
4. Bấm **Đăng xuất**. App chuyển về `/dang-nhap`.

Ai không có trong `hr_users`, nhập email cũng thấy thông báo trung tính "Email chưa được cấp quyền vào giao diện. Liên hệ quản trị". Không lộ danh sách trắng.

## Quay lại chế độ Basic Auth

Nếu có vấn đề gấp, đặt `AUTH_MODE=basic` (hoặc xóa biến này) rồi redeploy. App quay lại cổng mật khẩu chung như trước, `APP_PASSWORD` vẫn còn đó.

## Lưu ý bảo mật

- `APP_PASSWORD` vẫn còn khi chuyển sang chế độ supabase, nhưng không được dùng. Bạn có thể xóa biến này sau khi đã chạy ổn định vài tuần với magic link.
- Danh sách trắng `hr_users` được bảo vệ bằng RLS (chính sách chặn hết). Chỉ backend dùng service role đọc được.
- Cookie phiên do Supabase quản lý, HttpOnly, Secure. Không nằm trong Local Storage.
- Link magic hết hạn sau vài phút và chỉ dùng được một lần. Ai lấy được link cũng không dùng lại được sau khi bạn đã bấm.
