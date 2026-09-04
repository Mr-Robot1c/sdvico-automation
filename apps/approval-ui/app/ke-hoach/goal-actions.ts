'use server';

// Mục tiêu tuần — cậu/sếp giao cho AI Planner (BOSS). Lưu app_config key 'mkt_weekly_goal'.
// BOSS đọc mục tiêu này ở 2 chỗ: narrative bản kế hoạch (lib/plan.ts) và prompt sinh
// hướng đi tuần (scripts/generate-plan-directions.mjs). Đây là chốt NGƯỜI GIAO VIỆC đầu
// vòng lặp trong flowchart v3 (docs/flowchart-v3.html) — máy không tự đặt mục tiêu.

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase-server';
import { generateAndStorePlan, weekWindowVN } from '../../lib/plan';
import { refreshLiveProposal } from '../../lib/plan-live';
import { loadPostingPlan, savePostingPlan, buildBossPostingPlan, pruneOverrides, normalizeSlot, MAX_SLOTS_PER_DAY, type PostingDay, type PostingSlot } from '../../lib/posting-plan';

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

// SINH BÀI NGAY theo kế hoạch (user 24/8: "doi ke hoach ma khong sinh bai moi, ket cai gi
// roi?"). Rotate co guard 1 bai/slot/ngay -> doi ke hoach giua ngay (2 slot da chay) thi
// khong tu sinh them, phai cho 7h sang mai. Nut nay goi /api/rotate?force=1 (bo guard) de
// nguoi quan ly thay bai theo ke hoach moi NGAY. Bai van vao Hang doi duyet, khong tu dang
// (dieu cam 1). Ghi run_log qua chinh route rotate; tra {ok, created, note} de UI hien.
export async function generatePostsNow(): Promise<{ ok: boolean; created: number; note: string }> {
  const secret = process.env.CRON_SECRET || '';
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/rotate?force=1`, {
      method: 'GET',
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      cache: 'no-store',
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, created: 0, note: `HTTP ${res.status}: ${String(j?.error || j?.note || '').slice(0, 200)}` };
    }
    const created = Number(j?.created ?? (Array.isArray(j?.results) ? j.results.length : 0)) || 0;
    revalidatePath('/ke-hoach');
    revalidatePath('/noi-dung');
    return { ok: true, created, note: created > 0 ? `Đã sinh ${created} bài vào Hàng đợi duyệt.` : (j?.note || 'Không sinh được bài (xem lý do bên dưới).') };
  } catch (e: any) {
    return { ok: false, created: 0, note: String(e?.message || e).slice(0, 200) };
  }
}

// Nhóm chia sẻ: từ 20/8 quản lý DUY NHẤT qua popover 📣 ở Quản lý bài viết (/api/share-groups,
// app_config 'mkt_share_groups' dạng {groups: [{id,label,url}]}). Trang Kế hoạch chỉ hiển thị.
// (saveShareGroups nhập tay cũ đã bỏ — hai nguồn từng lệch nhau, user bắt lỗi 20/8.)

// LỊCH ĐĂNG CỐ ĐỊNH (user 4/9: "kế hoạch cố định, muốn chỉnh thì chỉnh ngay hôm đó"). Form ở
// ke-hoach/posting-plan-form.tsx: mỗi thứ tối đa MAX_SLOTS_PER_DAY ô, tên field s_<dow>_<i>_{on,time,kind,channel,group}.
function readSlots(formData: FormData, prefix: string): PostingSlot[] {
  const slots: PostingSlot[] = [];
  for (let i = 0; i < MAX_SLOTS_PER_DAY; i++) {
    if (String(formData.get(`${prefix}_${i}_on`) || '') !== '1') continue;
    const s = normalizeSlot({
      time: formData.get(`${prefix}_${i}_time`),
      channel: formData.get(`${prefix}_${i}_channel`),
      kind: formData.get(`${prefix}_${i}_kind`),
      group_id: formData.get(`${prefix}_${i}_group`),
    });
    if (s) slots.push(s);
  }
  return slots;
}
async function afterPlanSaved(client: ReturnType<typeof getServerClient>, detail: Record<string, unknown>) {
  try { await refreshLiveProposal(client); } catch (e: any) { console.error('[posting-plan] refresh live loi:', e?.message || e); }
  try { await client.from('run_log').insert({ task: 'mkt.posting_plan_save', actor: 'user', status: 'ok', detail }); } catch { /* bo qua */ }
  revalidatePath('/ke-hoach'); revalidatePath('/tong-quan'); revalidatePath('/noi-dung');
}
export async function savePostingPlanAction(formData: FormData) {
  const client = getServerClient();
  const current = await loadPostingPlan(client);
  const days: Record<string, PostingDay> = {};
  for (let d = 0; d < 7; d++) days[String(d)] = { slots: readSlots(formData, `s_${d}`) };
  // Người sửa = lịch của TUẦN NÀY (week_start hôm nay); BOSS Thứ 2 tuần sau vẫn ra bản mới.
  await savePostingPlan(client, { version: 1, days, overrides: current.plan.overrides || {}, source: 'user', week_start: weekWindowVN(new Date()).start, notes: current.plan.notes || [], proposed_at: current.plan.proposed_at });
  await afterPlanSaved(client, { kind: 'week', slotsPerDay: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, v.slots.length])) });
}
export async function savePostingOverrideAction(formData: FormData) {
  const date = String(formData.get('ov_date') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ngày sửa riêng không hợp lệ');
  const client = getServerClient();
  const current = await loadPostingPlan(client);
  const overrides = { ...(current.plan.overrides || {}), [date]: { slots: readSlots(formData, 'ov') } };
  await savePostingPlan(client, { ...current.plan, overrides });
  await afterPlanSaved(client, { kind: 'override', date, slots: overrides[date].slots.length });
}
export async function clearPostingOverrideAction(formData: FormData) {
  const date = String(formData.get('ov_date') || '').trim();
  const client = getServerClient();
  const current = await loadPostingPlan(client);
  const overrides = { ...(current.plan.overrides || {}) };
  delete overrides[date];
  await savePostingPlan(client, { ...current.plan, overrides });
  await afterPlanSaved(client, { kind: 'override-clear', date });
}

// BOSS XẾP LẠI LỊCH (user 4/9 khuya): người bấm giữa tuần → xếp lại cho TUẦN NÀY; override ngày cũ bỏ, ngày tới giữ.
export async function proposePostingPlanAction() {
  const client = getServerClient();
  const current = await loadPostingPlan(client);
  const { plan, input } = await buildBossPostingPlan(client);
  await savePostingPlan(client, { ...plan, overrides: pruneOverrides(current.plan.overrides, plan.week_start || '') });
  try {
    await client.from('run_log').insert({ task: 'mkt.posting_plan_boss', actor: 'user', status: 'ok', detail: { groups: input.shareGroups.length, youtubeReady: input.youtubeReady, clipFolders: input.clipFolders, replaced: current.saved } });
  } catch { /* bo qua */ }
  await afterPlanSaved(client, { kind: 'boss', groups: input.shareGroups.length, youtubeReady: input.youtubeReady });
}
