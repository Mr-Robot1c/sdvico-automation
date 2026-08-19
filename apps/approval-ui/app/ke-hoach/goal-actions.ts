'use server';

// Mục tiêu tuần — cậu/sếp giao cho AI Planner (BOSS). Lưu app_config key 'mkt_weekly_goal'.
// BOSS đọc mục tiêu này ở 2 chỗ: narrative bản kế hoạch (lib/plan.ts) và prompt sinh
// hướng đi tuần (scripts/generate-plan-directions.mjs). Đây là chốt NGƯỜI GIAO VIỆC đầu
// vòng lặp trong flowchart v3 (docs/flowchart-v3.html) — máy không tự đặt mục tiêu.

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase-server';

export async function saveWeeklyGoal(formData: FormData) {
  const text = String(formData.get('goal_text') || '').trim().slice(0, 2000);
  const client = getServerClient();
  const { error } = await client.from('app_config').upsert({
    key: 'mkt_weekly_goal',
    value: { text, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Không lưu được mục tiêu: ' + error.message);
  revalidatePath('/ke-hoach');
}

// Sản phẩm TẬP TRUNG tuần (user 19/8: "tuần này up lọc dầu với lọc nước"). Lưu app_config key
// 'mkt_focus' = { groups: [...từ khoá], until: ISO cuối ngày VN, updated_at }. /api/rotate đọc:
// còn hạn -> vòng xoay CHỈ lấy folder khớp từ khoá; hết hạn -> tự trở lại đủ sản phẩm.
// Để trống groups và Lưu = bỏ tập trung.
export async function saveFocus(formData: FormData) {
  const raw = String(formData.get('focus_groups') || '');
  const groups = raw.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const untilDay = String(formData.get('focus_until') || '').trim(); // "YYYY-MM-DD" hoặc rỗng
  // Hết ngày theo giờ VN (23:59:59 +07:00). Không chọn ngày -> mặc định hết Chủ nhật tuần này (VN).
  let until: string | null = null;
  if (untilDay && /^\d{4}-\d{2}-\d{2}$/.test(untilDay)) {
    until = new Date(`${untilDay}T23:59:59+07:00`).toISOString();
  } else if (groups.length) {
    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const dow = vn.getUTCDay(); // 0 = CN
    const daysToSun = dow === 0 ? 0 : 7 - dow;
    const sun = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + daysToSun));
    until = new Date(`${sun.toISOString().slice(0, 10)}T23:59:59+07:00`).toISOString();
  }
  const client = getServerClient();
  const { error } = await client.from('app_config').upsert({
    key: 'mkt_focus',
    value: { groups, until, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Không lưu được sản phẩm tập trung: ' + error.message);
  revalidatePath('/ke-hoach');
}
