# Supabase: lược đồ, migration, RLS

Thư mục này chứa lược đồ cơ sở dữ liệu và chính sách bảo mật cấp dòng (RLS).

- `migrations/20260810090000_init.sql`: tạo mười bảng tối thiểu.
- `migrations/20260810090100_rls.sql`: bật RLS và chính sách v1.
- `migrations/20260810140000_core.sql`: bảng app_config cho công tắc dừng khẩn và daily_counters cho bộ đếm hạn mức, kèm RLS.

## Cách áp dụng

Máy phát triển hiện chưa cài Supabase CLI và Docker, nên chưa chạy migration cục bộ. Chọn một trong hai cách sau, chạy bằng tài khoản của bạn. Không đưa khóa cho ai và không commit khóa vào Git (điều cấm 7).

### Cách 1: Dán vào SQL Editor trên Supabase (nhanh nhất, không cần cài đặt)

1. Mở dự án Supabase của công ty, vào mục SQL Editor.
2. Mở `migrations/20260810090000_init.sql`, dán toàn bộ, chạy.
3. Mở `migrations/20260810090100_rls.sql`, dán toàn bộ, chạy.
4. Mở `migrations/20260810140000_core.sql`, dán toàn bộ, chạy.
5. Vào Table Editor kiểm tra đủ các bảng. Vào Authentication và Policies kiểm tra RLS đã bật ở `hr_candidates` và `hr_applications`.

### Cách 2: Dùng Supabase CLI

1. Cài CLI theo hướng dẫn chính thức của Supabase.
2. `supabase login`, rồi `supabase link --project-ref <mã dự án của bạn>`.
3. `supabase db push` để áp dụng các file trong `migrations/` theo thứ tự thời gian.

## Kiểm tra RLS đã đúng

Sau khi áp dụng, chạy trong SQL Editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Cột `rowsecurity` phải là true cho cả mười bảng. Với khóa anon, truy vấn `hr_candidates` phải trả về rỗng vì không có chính sách cho anon.

## Lưu ý phân quyền

Backend và các tác vụ theo lịch dùng khóa service role, tự bỏ qua RLS. Ứng dụng duyệt dùng người đăng nhập nội bộ, thuộc vai trò authenticated. Chính sách v1 cho phép mọi người đăng nhập thao tác. Việc siết theo vai trò cụ thể để ở giai đoạn làm cứng.
