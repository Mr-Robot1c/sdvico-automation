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
