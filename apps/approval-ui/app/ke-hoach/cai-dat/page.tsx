import { getServerClient } from '../../../lib/supabase-server';
import { vnInt, proposalTargetWeekVN } from '../../../lib/plan';
import { loadShareGroups } from '../../../lib/posting-plan';
import { generatePlanNow } from '../../actions';
import { saveGoalFocusAndRegenerate, regenerateWeeklyProposalAction } from '../goal-actions';
import ProposeButton from '../propose-button';
import SaveGenerateButton from '../save-generate-button';
import GenerateButton from '../generate-button';
import { loadPlans, loadAppliedPlan, loadLastManualPlan, fmtDate, fmtDateTime } from '../shared';

export const dynamic = 'force-dynamic';
// Sinh kế hoạch gọi Gemini mất 30 giây tới ~2 phút (chuỗi 4 model fallback khi model đầu bị
// rate-limit). Server action saveGoalFocusAndRegenerate chạy trong function của trang này —
// KHÔNG set maxDuration thì bị cắt sớm, plan tạo được server-side nhưng response không về kịp
// browser -> UI không refresh (user 24/8: "bấm Lưu mà không cập nhật"). Cho 300s.
export const maxDuration = 300;

// TAB CÀI ĐẶT (23/10, đường dẫn riêng thay ?tab=cai-dat): mục tiêu tuần, sản phẩm tập trung, soạn lại kế hoạch.
export default async function Page() {
  const client = getServerClient();
  const [{ rows }, appliedRow, lastPlanLog, { data: goalRow }, { data: focusRow }, shareGroupRows] = await Promise.all([
    loadPlans(client),
    loadAppliedPlan(client),
    loadLastManualPlan(client),
    client.from('app_config').select('value, updated_at').eq('key', 'mkt_weekly_goal').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle(),
    loadShareGroups(client),
  ]);
  const goalText = ((goalRow as any)?.value?.text as string) || '';
  const focusVal = ((focusRow as any)?.value || {}) as { groups?: string[]; until?: string };
  const focusGroups = Array.isArray(focusVal.groups) ? focusVal.groups : [];
  const focusUntil = focusVal.until ? String(focusVal.until).slice(0, 10) : '';
  const focusActive = focusGroups.length > 0 && (!focusVal.until || new Date(focusVal.until).getTime() > Date.now());
  // 9/10 (review UI): cảnh báo hết hạn CHỈ dựa trên trường ngày có cấu trúc (mkt_focus.until, app_config.updated_at),
  // không đoán hiệu lực từ chữ trong ô mục tiêu. Hết hạn tập trung thì /api/rotate tự quay về đủ sản phẩm.
  const focusExpired = focusGroups.length > 0 && !!focusVal.until && new Date(focusVal.until).getTime() <= Date.now();
  const goalUpdatedAt = ((goalRow as any)?.updated_at as string) || null;
  const goalAgeDays = goalUpdatedAt ? Math.floor((Date.now() - new Date(goalUpdatedAt).getTime()) / 86400000) : null;
  // Nhóm chia sẻ: nguồn CHUNG với popover chia sẻ ở Duyệt bài (app_config qua /api/share-groups).
  const shareGroups: string[] = shareGroupRows.map((g) => g.label);

  const proposalWeek = proposalTargetWeekVN(new Date());
  const weeklyProposal = rows.find((r) => !r.applied && r.proposal?.week_start === proposalWeek.start) || null;

  const focusLine = (() => {
    const total = (appliedRow?.data?.content_suggestions || []).length;
    if (!focusActive || !total) return null;
    const keys = focusGroups.map((g) => String(g).toLowerCase().trim());
    const inFocus = (appliedRow!.data.content_suggestions || []).filter((sg: any) => {
      const pn = String(sg.product || '').toLowerCase();
      return keys.some((k) => pn === k || pn.includes(k) || k.includes(pn));
    }).length;
    const allIn = inFocus === total;
    return (
      <p className="sub" style={{ margin: '10px 0 0' }}>
        <b>{vnInt(inFocus)}/{vnInt(total)}</b> hướng đi bám sản phẩm tập trung ({focusGroups.join(', ')}){focusUntil ? `, đến ${fmtDate(focusUntil)}` : ''}.{allIn ? '' : ' Hướng ngoài phạm vi chờ tới khi hết hạn tập trung.'}
      </p>
    );
  })();

  return (
    <>
      <section className="blk kh-settings">
        <h2>Cài đặt tuần</h2>
        <form action={saveGoalFocusAndRegenerate}>
          <label>
            <b title="Câu ngắn bạn giao cho BOSS, được đưa vào prompt sinh hướng đi bài viết.">Mục tiêu tuần</b>
            <textarea name="goal_text" defaultValue={goalText} rows={12} placeholder="Ví dụ: tuần này ưu tiên lọc dầu SF-50, cần 20 cuộc gọi." />
            {goalUpdatedAt ? (
              <span className={goalAgeDays !== null && goalAgeDays > 7 ? 'err-note' : 'sub'} style={{ display: 'block', fontSize: '.85rem', marginTop: 4 }}>
                Sửa lần cuối {fmtDateTime(goalUpdatedAt)}
                {goalAgeDays !== null && goalAgeDays > 7 ? `, đã ${vnInt(goalAgeDays)} ngày chưa sửa. Rà lại nếu tuần này đã đổi mục tiêu.` : '.'}
              </span>
            ) : null}
          </label>
          <label>
            <b title="Máy chỉ đăng các sản phẩm liệt kê ở đây, sản phẩm khác bị chặn hoàn toàn.">Chỉ đăng sản phẩm này</b>
            <input name="focus_groups" defaultValue={focusGroups.join(', ')} placeholder="lọc dầu, lọc nước" />
          </label>
          <label className="kh-inline">
            <span className="sub">đến hết</span>
            <input type="date" name="focus_until" defaultValue={focusUntil} style={{ maxWidth: 160 }} />
          </label>
          {focusExpired ? (
            <p className="err-note" role="note" style={{ margin: '4px 0 0', fontSize: '.85rem' }}>
              Hạn chỉ đăng {focusGroups.join(', ')} đã hết ngày {fmtDate(focusUntil)}. Máy đang đăng đủ mọi sản phẩm. Muốn giữ giới hạn thì đặt ngày mới rồi lưu, không cần nữa thì xoá ô sản phẩm.
            </p>
          ) : null}
          <div className="settings-cta">
            <SaveGenerateButton />
          </div>
          {lastPlanLog ? (
            <p className={`sub ${lastPlanLog.status === 'error' ? 'err-note' : ''}`} style={{ margin: '8px 0 0' }}>
              Lần sinh gần nhất ({fmtDateTime(lastPlanLog.created_at)}):{' '}
              {lastPlanLog.status === 'ok'
                ? <>xong, {vnInt(Number(lastPlanLog.detail?.suggestions) || 0)} hướng</>
                : <>lỗi, {String(lastPlanLog.detail?.error || 'không rõ').slice(0, 160)}</>}
            </p>
          ) : null}
        </form>
        {focusLine}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <b style={{ display: 'block', marginBottom: 6 }}>Nhóm chia sẻ Facebook</b>
          {shareGroups.length ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {shareGroups.map((g) => (<span key={g} className="badge tone-default">{g}</span>))}
            </div>
          ) : <p className="sub" style={{ margin: 0 }}>Chưa có nhóm nào.</p>}
        </div>
      </section>
      <section className="blk">
        <h2>Soạn lại kế hoạch</h2>
        <div className="kh-strip">
          <ProposeButton action={regenerateWeeklyProposalAction} label={weeklyProposal ? '📝 Soạn lại đề xuất tuần sau' : '📝 Soạn đề xuất tuần sau'} />
          <GenerateButton action={generatePlanNow} />
        </div>
      </section>
    </>
  );
}
