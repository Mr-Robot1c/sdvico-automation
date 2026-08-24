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
//
// 24/8 (user "bam luu va sinh khong duoc"): ghi run_log task=mkt.plan_manual moi lan chay
// (ok / error + message). Trang /ke-hoach doc dong log moi nhat de hien "Lan sinh gan nhat:
// ✅ xong" hoac "⛔ loi <ly do>" duoi nut submit — truoc console.error, user khong thay gi.
async function regeneratePlanAndApply(client: ReturnType<typeof getServerClient>): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const startedAt = Date.now();
  try {
    const { id, plan } = await generateAndStorePlan(client, 'manual', { cadence: 'update' });
    if (!id) throw new Error('generateAndStorePlan tra ve id rong');
    await client.from('mkt_plans').update({ applied: false, applied_at: null }).eq('applied', true);
    await client.from('mkt_plans').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', id);
    try {
      await client.from('run_log').insert({
        task: 'mkt.plan_manual', actor: 'user', status: 'ok',
        detail: { planId: id, suggestions: plan.content_suggestions?.length || 0, ms: Date.now() - startedAt },
      });
    } catch { /* bo qua loi ghi log */ }
    return { ok: true, planId: id };
  } catch (e: any) {
    const err = String(e?.message || e).slice(0, 300);
    console.error('[goal] sinh lai ke hoach that bai:', err);
    try {
      await client.from('run_log').insert({
        task: 'mkt.plan_manual', actor: 'user', status: 'error',
        detail: { error: err, ms: Date.now() - startedAt },
      });
    } catch { /* bo qua */ }
    return { ok: false, error: err };
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

// GỘP: lưu Mục tiêu + Focus + sinh kế hoạch (user 24/8: "3 nút chả biết bấm gì, gộp lại 1
// nút cho dễ"). Trước là 2 form 2 nút, mỗi lần bấm là auto sinh plan mới -> 2 plan trong 30s
// nếu user đổi cả 2. Giờ 1 form, 1 nút = 1 plan.
export async function saveGoalFocusAndRegenerate(formData: FormData) {
  const text = String(formData.get('goal_text') || '').trim().slice(0, 2000);
  const raw = String(formData.get('focus_groups') || '');
  const groups = raw.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const untilDay = String(formData.get('focus_until') || '').trim();
  let until: string | null = null;
  if (untilDay && /^\d{4}-\d{2}-\d{2}$/.test(untilDay)) {
    until = new Date(`${untilDay}T23:59:59+07:00`).toISOString();
  } else if (groups.length) {
    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const dow = vn.getUTCDay();
    const daysToSun = dow === 0 ? 0 : 7 - dow;
    const sun = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + daysToSun));
    until = new Date(`${sun.toISOString().slice(0, 10)}T23:59:59+07:00`).toISOString();
  }
  const client = getServerClient();
  const nowIso = new Date().toISOString();
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    client.from('app_config').upsert({ key: 'mkt_weekly_goal', value: { text, updated_at: nowIso }, updated_at: nowIso }),
    client.from('app_config').upsert({ key: 'mkt_focus', value: { groups, until, updated_at: nowIso }, updated_at: nowIso }),
  ]);
  if (e1) throw new Error('Không lưu được mục tiêu: ' + e1.message);
  if (e2) throw new Error('Không lưu được sản phẩm tập trung: ' + e2.message);
  await regeneratePlanAndApply(client);
  try { await refreshLiveProposal(client); } catch (e: any) { console.error('[goal-focus] refresh live loi:', e?.message || e); }
  revalidatePath('/ke-hoach');
}

// Nhóm chia sẻ: từ 20/8 quản lý DUY NHẤT qua popover 📣 ở Quản lý bài viết (/api/share-groups,
// app_config 'mkt_share_groups' dạng {groups: [{id,label,url}]}). Trang Kế hoạch chỉ hiển thị.
// (saveShareGroups nhập tay cũ đã bỏ — hai nguồn từng lệch nhau, user bắt lỗi 20/8.)
