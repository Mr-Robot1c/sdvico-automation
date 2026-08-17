// Lớp đăng nhập của giao diện duyệt. Chấp nhận hai chế độ, chọn bằng biến môi trường AUTH_MODE.
//
//   basic     (mặc định) — HTTP Basic Auth như cũ. Một mật khẩu dùng chung, không truy được
//              ai đã bấm cái gì. Không thay đổi hành vi hiện tại của app.
//
//   supabase  — magic link qua Supabase Auth. Chỉ email nằm trong bảng hr_users được vào.
//              Người bấm được truy vết trong cột decided_by/viewed_by.
//
// Chuyển chế độ mà không phải sửa code: đặt AUTH_MODE=supabase trên Vercel, redeploy.
// Chưa setup xong Supabase Auth (bật provider Email, cấu hình SMTP, thêm hr_users) thì để
// nguyên basic để app không hỏng. Hướng dẫn ở docs/dang-nhap-supabase-auth.md.

import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getServerClient } from './supabase-server';

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: 'admin' | 'staff';
};

export function authMode(): 'basic' | 'supabase' {
  return process.env.AUTH_MODE === 'supabase' ? 'supabase' : 'basic';
}

// Client kết nối tới Supabase Auth qua cookie của trình duyệt. Chỉ dùng cho việc xác thực,
// không thay thế getServerClient (vẫn dùng service role để đọc/ghi dữ liệu HR).
export function getAuthClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY để dùng magic link.');
  const jar = cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        // API Route và Server Action mới được phép set cookie; ở đây bọc trong try để không
        // ném lỗi khi gọi từ Server Component (Next 14 chặn).
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // eo
        }
      },
    },
  });
}

// Trả về người đang đăng nhập nếu đang dùng chế độ supabase và có phiên hợp lệ + email
// nằm trong hr_users. Trong chế độ basic hoặc chưa đăng nhập, trả null.
// KHÔNG ném lỗi để bọc gọn cho server component. Người gọi tự chọn cách xử lý null.
export async function getSessionUser(): Promise<SessionUser | null> {
  if (authMode() !== 'supabase') return null;

  try {
    const authClient = getAuthClient();
    const { data: { user }, error } = await authClient.auth.getUser();
    if (error || !user?.email) return null;

    // Tra danh sách trắng bằng service role (RLS chặn client đọc bảng này).
    const admin = getServerClient();
    const { data } = await admin
      .from('hr_users')
      .select('id, email, full_name, role, disabled_at')
      .ilike('email', user.email)
      .maybeSingle();
    if (!data || data.disabled_at) return null;

    return {
      id: data.id as string,
      email: data.email as string,
      fullName: (data.full_name as string | null) ?? null,
      role: (data.role as 'admin' | 'staff') ?? 'staff',
    };
  } catch {
    return null;
  }
}
