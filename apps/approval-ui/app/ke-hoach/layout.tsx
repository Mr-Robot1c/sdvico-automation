import type { ReactNode } from 'react';
import { getServerClient } from '../../lib/supabase-server';
import { vnInt } from '../../lib/plan';
import { applyPlanWeights } from '../actions';
import { loadPlans, loadLastManualPlan, fmtDateTime } from './shared';

// 23/10 (web chậm + rối): phần đầu chung của các tab Kế hoạch. Layout không dựng lại khi đổi tab,
// nên đổi tab chỉ tải phần thân. Hàng tab do RootShell vẽ (lib/routes.ts SECTION_GROUPS).
export const dynamic = 'force-dynamic';

export default async function KeHoachLayout({ children }: { children: ReactNode }) {
  const client = getServerClient();
  const [{ rows, error }, lastPlanLog] = await Promise.all([loadPlans(client), loadLastManualPlan(client)]);
  const learnSuggestion = rows.find((r) => r.origin === 'learn-weekly' && !r.applied);

  // Banner kết quả bấm "Lưu & sinh kế hoạch mới": chỉ hiện 60 giây đầu, F5 là tự ẩn.
  const ageSec = lastPlanLog ? (Date.now() - new Date(lastPlanLog.created_at).getTime()) / 1000 : Infinity;
  const ok = lastPlanLog?.status === 'ok';

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kế hoạch</h1>
        </div>
        {learnSuggestion ? (
          <form action={applyPlanWeights} title={`Đề xuất cuối tuần từ số liệu, sinh ${fmtDateTime(learnSuggestion.created_at)}`}>
            <input type="hidden" name="plan_id" value={learnSuggestion.id} />
            <button className="btn ok" type="submit">Áp dụng đề xuất mới</button>
          </form>
        ) : null}
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error}</p> : null}

      {ageSec <= 60 ? (
        <section role="status" className={`blk ${ok ? 'tone-ok' : 'tone-red'}`}>
          <b>{ok ? (lastPlanLog.detail?.proposal ? 'Đã soạn đề xuất tuần sau' : 'Đã thay đổi kế hoạch mới') : 'Sinh kế hoạch thất bại'}</b>
          <div className="sub" style={{ marginTop: 2 }}>
            {ok
              ? (lastPlanLog.detail?.proposal
                  ? <>Bản đề xuất có {vnInt(Number(lastPlanLog.detail?.suggestions) || 0)} hướng đi, chưa áp. Thứ 2 8h máy tự áp, hoặc bấm Áp ngay ở tab Tuần này.</>
                  : <>Bản mới có {vnInt(Number(lastPlanLog.detail?.suggestions) || 0)} hướng đi và đã được áp.</>)
              : <>Lý do: {String(lastPlanLog.detail?.error || 'không rõ').slice(0, 200)}. Kế hoạch cũ vẫn giữ nguyên.</>}
          </div>
        </section>
      ) : null}

      {children}
    </main>
  );
}
