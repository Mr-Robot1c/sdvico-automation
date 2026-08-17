// Danh sách trắng người được vào giao diện duyệt.
// Chỉ admin đã đăng nhập mới đọc/ghi được bảng này qua các server action.
// Điều cấm 6: dữ liệu ứng viên chỉ cấp cho nhân sự có tên tuổi rõ ràng.

import 'server-only';
import { getServerClient } from './supabase-server';
import { getSessionUser } from './auth';

export type HrUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'staff';
  created_at: string;
  disabled_at: string | null;
};

export async function requireAdmin(): Promise<{ email: string; fullName: string | null } | { error: string }> {
  const u = await getSessionUser();
  if (!u) return { error: 'Cần đăng nhập bằng magic link để dùng trang này. Đặt AUTH_MODE=supabase.' };
  if (u.role !== 'admin') return { error: 'Chỉ quản trị mới quản lý người dùng.' };
  return { email: u.email, fullName: u.fullName };
}

export async function listUsers(): Promise<HrUser[]> {
  const client = getServerClient();
  const { data, error } = await client
    .from('hr_users')
    .select('id, email, full_name, role, created_at, disabled_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error('Đọc hr_users lỗi: ' + error.message);
  return (data || []) as HrUser[];
}
