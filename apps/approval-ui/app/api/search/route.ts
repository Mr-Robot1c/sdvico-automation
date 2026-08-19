import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { getSessionUser, authMode } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// Search endpoint dùng cho SearchDialog trong sidebar (Cmd/Ctrl+K).
// Điều cấm 6: chỉ người có tên trong hr_users mới được đọc PII ứng viên;
// dù đã qua middleware, route này vẫn tự kiểm quyền và LOẠI email/SĐT khỏi payload.
export async function GET(req: Request) {
  // Chế độ supabase: bắt buộc có phiên hợp lệ + email nằm trong hr_users.
  // Chế độ basic (một mật khẩu dùng chung): tin middleware, nhưng vẫn không trả email/phone.
  if (authMode() === 'supabase') {
    const user = await getSessionUser();
    if (!user) return new NextResponse('Cần đăng nhập', { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '6', 10) || 6));

  if (q.length < 2) {
    return NextResponse.json({ jobs: [], candidates: [], posts: [], employees: [], q });
  }

  const client = getServerClient();
  // ilike escape ký tự % và _ để không bị lộ pattern SQL.
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

  const [jobsRes, candsRes, postsRes, empsRes] = await Promise.all([
    client
      .from('hr_jobs')
      .select('id, title, department, location, status')
      .or(`title.ilike.${like},department.ilike.${like},location.ilike.${like}`)
      .in('status', ['draft', 'open'])
      .limit(limit),
    // Vẫn tìm theo email/phone (cho phép nhân sự dán email vào tra) nhưng KHÔNG trả về.
    client
      .from('hr_candidates')
      .select('id, full_name')
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(limit),
    client
      .from('hr_job_posts')
      .select('id, tieu_de, kenh, trang_thai')
      .ilike('tieu_de', like)
      .is('deleted_at', null)
      .limit(limit),
    // Nhân viên nội bộ, không phải PII ứng viên — vẫn cho hiển thị chức danh, KHÔNG email.
    client
      .from('hr_employees')
      .select('id, full_name, chuc_danh')
      .or(`full_name.ilike.${like},email.ilike.${like},chuc_danh.ilike.${like}`)
      .limit(limit),
  ]);

  return NextResponse.json({
    q,
    jobs: (jobsRes.data || []).map((j: Record<string, unknown>) => ({
      id: j.id, title: j.title, sub: [j.department, j.location].filter(Boolean).join(' · ') || null, status: j.status,
    })),
    // sub = null để giao diện tự tra chi tiết ở trang Hồ sơ (nơi có kiểm quyền chặt).
    candidates: (candsRes.data || []).map((c: Record<string, unknown>) => ({
      id: c.id, name: c.full_name || 'Chưa rõ tên', sub: null,
    })),
    posts: (postsRes.data || []).map((p: Record<string, unknown>) => ({
      id: p.id, title: p.tieu_de, sub: p.kenh || null, status: p.trang_thai,
    })),
    employees: (empsRes.data || []).map((e: Record<string, unknown>) => ({
      id: e.id, name: e.full_name || 'Chưa rõ tên', sub: e.chuc_danh || null,
    })),
  });
}
