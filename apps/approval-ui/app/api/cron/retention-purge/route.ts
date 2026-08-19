// Vercel Cron: xóa hồ sơ ứng viên đã quá hạn lưu (retention_until < hôm nay).
// Nghị định 13/2023 + điều cấm 6: dữ liệu cá nhân KHÔNG lưu lâu hơn mức đã khai báo.
// Gọi bằng cron-job.org một lần mỗi ngày (giờ khuya, chống trùng với publish cron).
// Bảo vệ bằng CRON_SECRET.

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { verifyCronAuth } from '../../../../lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Ngưỡng an toàn: không xóa quá nhiều trong một lần chạy — nếu có sai sót phát hiện sớm.
// Người vận hành muốn xóa lô lớn thì tự chạy tay nhiều lần hoặc dọn qua SQL.
const MAX_PURGE_PER_RUN = 500;

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const client = getServerClient();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Lấy id các hồ sơ hết hạn để log trước khi xóa.
    const { data: expired, error: e1 } = await client
      .from('hr_candidates')
      .select('id, full_name, email, source, retention_until')
      .not('retention_until', 'is', null)
      .lt('retention_until', today)
      .limit(MAX_PURGE_PER_RUN);
    if (e1) throw new Error('Đọc hr_candidates lỗi: ' + e1.message);

    const ids = (expired || []).map((r: { id: string }) => r.id);
    if (ids.length === 0) {
      try { await client.from('run_log').insert({ task: 'hr.retention_purge', status: 'ok', detail: { purged: 0 } }); } catch {}
      return NextResponse.json({ purged: 0 });
    }

    // Xóa. hr_applications có on delete cascade nên tự dọn theo.
    const { error: e2 } = await client.from('hr_candidates').delete().in('id', ids);
    if (e2) throw new Error('Xóa hr_candidates lỗi: ' + e2.message);

    // Log chi tiết (không log full name để tránh vô tình giữ PII trong run_log — chỉ log id + source).
    const detail = {
      purged: ids.length,
      truncated: ids.length >= MAX_PURGE_PER_RUN,
      sources: (expired || []).reduce((acc: Record<string, number>, r: { source: string | null }) => {
        const k = r.source || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    };
    try { await client.from('run_log').insert({ task: 'hr.retention_purge', status: 'ok', detail }); } catch {}

    return NextResponse.json({ purged: ids.length, sources: detail.sources, truncated: detail.truncated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.retention_purge', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
