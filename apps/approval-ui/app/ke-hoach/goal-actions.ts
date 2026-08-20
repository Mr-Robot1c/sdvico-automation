'use server';

// Mục tiêu tuần — cậu/sếp giao cho AI Planner (BOSS). Lưu app_config key 'mkt_weekly_goal'.
// BOSS đọc mục tiêu này ở 2 chỗ: narrative bản kế hoạch (lib/plan.ts) và prompt sinh
// hướng đi tuần (scripts/generate-plan-directions.mjs). Đây là chốt NGƯỜI GIAO VIỆC đầu
// vòng lặp trong flowchart v3 (docs/flowchart-v3.html) — máy không tự đặt mục tiêu.

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase-server';
import { generateAndStorePlan } from '../../lib/plan';
import { refreshLiveProposal } from '../../lib/plan-live';

// NGƯỜI GIAO VIỆC vừa đổi mục tiêu / sản phẩm tập trung -> BOSS sinh lại kế hoạch NGAY và ÁP DỤNG
// luôn (user 19/8: "đã note mục tiêu mới mà BOSS vẫn giữ kế hoạch cũ không cập nhật"). Đây là
// quyết định của người (mục tiêu), không phải máy tự quyết; bản mới thay bản đang áp. Lỗi sinh
// kế hoạch (Gemini) thì vẫn giữ mục tiêu đã lưu, kế hoạch cũ còn nguyên, không chặn người dùng.
async function regeneratePlanAndApply(client: ReturnType<typeof getServerClient>) {
  try {
    const { id } = await generateAndStorePlan(client, 'manual', { cadence: 'update' });
    if (!id) return;
    await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
    await client.from('mkt_plans').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', id);
  } catch (e: any) {
    console.error('[goal] sinh lai ke hoach theo muc tieu that bai:', e?.message || e);
  }
}

export async function saveWeeklyGoal(formData: FormData) {
  const text = String(formData.get('goal_text') || '').trim().slice(0, 2000);
  const client = getServerClient();
  const { error } = await client.from('app_config').upsert({
    key: 'mkt_weekly_goal',
    value: { text, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Không lưu được mục tiêu: ' + error.message);
  await regeneratePlanAndApply(client);
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
  await regeneratePlanAndApply(client);
  try { await refreshLiveProposal(client); } catch (e: any) { console.error('[focus] refresh live loi:', e?.message || e); }
  revalidatePath('/ke-hoach');
}

// Danh sách NHÓM Facebook người dùng đang ở (user 20/8: "t đang ở trong 4 group"). Lưu app_config
// 'mkt_share_groups' = { groups: [...tên nhóm] }. BOSS đọc để xếp lịch chia sẻ theo ngày trong
// đề xuất sống (lib/plan-live.ts). Chỉ là gợi ý cho người chia sẻ tay (Meta chặn tự đăng group).
export async function saveShareGroups(formData: FormData) {
  const raw = String(formData.get('share_groups') || '');
  const groups = raw.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const client = getServerClient();
  const { error } = await client.from('app_config').upsert({
    key: 'mkt_share_groups',
    value: { groups, updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Không lưu được nhóm chia sẻ: ' + error.message);
  // Cập nhật đề xuất sống ngay để lịch theo ngày có nhóm mới.
  try { await refreshLiveProposal(client); } catch (e: any) { console.error('[groups] refresh live loi:', e?.message || e); }
  revalidatePath('/ke-hoach');
}
