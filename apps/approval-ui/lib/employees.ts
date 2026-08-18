// Quản lý nhân viên sau khi đã nhận việc thật. Dữ liệu nhạy cảm hơn hr_candidates (BHXH,
// CCCD, hợp đồng) — bảng hr_employees/hr_employee_documents không cấp policy RLS nào cho
// authenticated (xem 20260818010000_hr_employees.sql), nên MỌI hàm ở đây bắt buộc nhận
// SessionUser và tự kiểm role admin bên trong, không để trang gọi thẳng service role mà quên
// kiểm quyền (điều cấm 6: dữ liệu nhân sự chỉ người có thẩm quyền mới xem được).
//
// Ngoài role admin, còn bắt buộc AUTH_MODE=supabase (đăng nhập theo từng người) đang chạy
// thật — ở chế độ basic (mật khẩu chung) không có cách nào phân biệt ai đang xem, nên
// getSessionUser() trả null và mọi hàm dưới đây tự chặn.

import 'server-only';
import { getServerClient } from './supabase-server';
import { getSessionUser, authMode } from './auth';

export const EMPLOYEE_DOCS_BUCKET = 'employee-documents';

export type EmployeeGuardResult = { email: string; fullName: string | null } | { error: string };

export async function requireEmployeeAdmin(): Promise<EmployeeGuardResult> {
  if (authMode() !== 'supabase') {
    return { error: 'Trang nhân viên chỉ dùng được khi đã bật đăng nhập theo từng người (AUTH_MODE=supabase). Dữ liệu ở đây nhạy cảm hơn hồ sơ ứng viên, không mở được ở chế độ mật khẩu chung.' };
  }
  const u = await getSessionUser();
  if (!u) return { error: 'Cần đăng nhập bằng magic link để dùng trang này.' };
  if (u.role !== 'admin') return { error: 'Chỉ quản trị mới xem và quản lý hồ sơ nhân viên.' };
  return { email: u.email, fullName: u.fullName };
}

export type Employee = {
  id: string;
  candidate_id: string | null;
  application_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  chuc_danh: string | null;
  phong_ban: string | null;
  ngay_bat_dau: string | null;
  trang_thai: 'active' | 'probation' | 'left';
  so_bhxh: string | null;
  so_cccd: string | null;
  onboarding_checklist: { label: string; done: boolean }[];
  created_by: string | null;
  created_at: string;
};

export type EmployeeDocument = {
  id: string;
  employee_id: string;
  loai: 'hop_dong' | 'bang_cap' | 'bhxh' | 'cccd' | 'khac';
  storage_path: string;
  ghi_chu: string | null;
  uploaded_by: string | null;
  created_at: string;
};

// Mọi hàm dưới đây nhận sẵn kết quả requireEmployeeAdmin() để không gọi lại getSessionUser()
// nhiều lần trên cùng một trang — nhưng vẫn kiểm 'error' in guard trước khi chạm dữ liệu.
export async function listEmployees(guard: EmployeeGuardResult): Promise<Employee[]> {
  if ('error' in guard) throw new Error(guard.error);
  const client = getServerClient();
  const { data, error } = await client
    .from('hr_employees')
    .select('id, candidate_id, application_id, full_name, email, phone, chuc_danh, phong_ban, ngay_bat_dau, trang_thai, so_bhxh, so_cccd, onboarding_checklist, created_by, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Đọc hr_employees lỗi: ' + error.message);
  return (data || []) as Employee[];
}

export async function getEmployee(
  guard: EmployeeGuardResult,
  id: string
): Promise<{ employee: Employee; documents: (EmployeeDocument & { signedUrl: string | null })[] } | null> {
  if ('error' in guard) throw new Error(guard.error);
  const client = getServerClient();
  const { data: employee } = await client
    .from('hr_employees')
    .select('id, candidate_id, application_id, full_name, email, phone, chuc_danh, phong_ban, ngay_bat_dau, trang_thai, so_bhxh, so_cccd, onboarding_checklist, created_by, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!employee) return null;

  const { data: docs } = await client
    .from('hr_employee_documents')
    .select('id, employee_id, loai, storage_path, ghi_chu, uploaded_by, created_at')
    .eq('employee_id', id)
    .order('created_at', { ascending: false });

  const documents = await Promise.all(
    ((docs || []) as EmployeeDocument[]).map(async (d) => {
      const { data: s } = await client.storage.from(EMPLOYEE_DOCS_BUCKET).createSignedUrl(d.storage_path, 3600);
      return { ...d, signedUrl: s?.signedUrl || null };
    })
  );

  return { employee: employee as Employee, documents };
}
