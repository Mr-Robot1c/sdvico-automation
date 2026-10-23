import { getServerClient } from '../../../lib/supabase-server';
import { buildWeekPlanView, weekRowsOf } from '../../../lib/week-plan';
import { loadPostingPlan } from '../../../lib/posting-plan';
import PostingPlanForm, { type PlanChangeLog } from '../posting-plan-form';
import { loadAppliedPlan } from '../shared';

export const dynamic = 'force-dynamic';
// Nút "BOSS xếp lại lịch" chạy model trong function của trang này.
export const maxDuration = 300;

// TAB LỊCH ĐĂNG (23/10, đường dẫn riêng thay ?tab=lich-dang). Form cần lô nhóm + bài từng ô của tuần
// nên vẫn dựng bảng tuần, nhưng các truy vấn chạy song song.
export default async function Page() {
  const client = getServerClient();
  const [appliedRow, pp, { data: focusRow }, { data: logRows }] = await Promise.all([
    loadAppliedPlan(client),
    loadPostingPlan(client),
    client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle(),
    // 15/9: nhật ký máy/người đổi lịch đăng (run_log), hiện dưới khối Lịch đăng cố định.
    client
      .from('run_log')
      .select('created_at, actor, detail')
      .in('task', ['mkt.posting_plan_save', 'mkt.posting_plan_boss'])
      .order('created_at', { ascending: false })
      .limit(8),
  ]);
  const week = await buildWeekPlanView(client, appliedRow?.data || null, new Date(), { pp, focus: (focusRow as any)?.value || null });
  const changeLog: PlanChangeLog[] = ((logRows || []) as any[]).map((r) => ({
    at: String(r.created_at), actor: String(r.actor || ''), kind: String(r.detail?.kind || (r.detail?.reason ? 'boss' : '')),
    summary: String(r.detail?.summary || (r.detail?.slotsPerDay ? 'lưu lịch (bản cũ chưa ghi chi tiết)' : r.detail?.reason ? `BOSS xếp: ${r.detail.reason}` : '')),
    changes: Array.isArray(r.detail?.changes) ? r.detail.changes.map((x: any) => String(x)) : [],
  }));

  return (
    <PostingPlanForm
      pp={pp}
      lots={Object.fromEntries(week.days.filter((d) => d.lot).map((d) => [d.date, d.lot!]))}
      rowsByDate={Object.fromEntries(week.days.map((d) => [d.date, weekRowsOf(d)]))}
      changeLog={changeLog}
    />
  );
}
