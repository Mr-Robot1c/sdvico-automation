import { getServerClient } from '../../lib/supabase-server';
import type { Plan, Tier } from '../../lib/plan';
import { vnInt, vnDec1 } from '../../lib/plan';
import { generatePlanNow, applyPlanWeights, clearPlanWeights, deletePlan } from '../actions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  period_start: string | null;
  period_end: string | null;
  generated_by: string;
  data: Plan;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
};

const TIER_LABEL: Record<Tier, { text: string; icon: string; cls: string }> = {
  winner: { text: 'Đẩy mạnh', icon: '🏆', cls: 'tone-ok' },
  watch: { text: 'Giữ nhịp', icon: '➖', cls: 'tone-default' },
  weak: { text: 'Đổi góc', icon: '⚠️', cls: 'tone-no' },
  insufficient: { text: 'Chưa đủ dữ liệu', icon: '⏳', cls: 'tone-default' }
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return day && m && y ? `${day}/${m}/${y}` : d;
}

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_plans')
    .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
    .order('created_at', { ascending: false })
    .limit(12);

  const rows = (data || []) as Row[];
  const latest = rows[0];
  const history = rows.slice(1);
  const appliedRow = rows.find((r) => r.applied);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kế hoạch</h1>
          <p className="sub">
            Bot đọc số liệu Đo lường rồi định hướng marketing tuần tới. Tự chạy thứ 4 và chủ nhật. Máy đề xuất, người quyết.
          </p>
        </div>
        <div className="head-actions">
          <form action={generatePlanNow}>
            <button className="btn ok" type="submit">✨ Tạo kế hoạch ngay</button>
          </form>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {appliedRow ? (
        <p className="err" role="status">
          Đang áp dụng trọng số của kế hoạch sinh lúc {fmtDateTime(appliedRow.created_at)}. Vòng xoay sinh bài đang ưu tiên theo bản này.
        </p>
      ) : null}

      {!latest ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🧭</div>
          <p>Chưa có kế hoạch nào.</p>
          <p className="sub">
            Bấm <b>Tạo kế hoạch ngay</b> để bot đọc số liệu Đo lường và đề xuất hướng đi. Cần có bài đã đăng và số liệu rồi kế hoạch mới có căn cứ.
          </p>
        </div>
      ) : (
        <>
          <section className="plan-card">
            <div className="plan-meta">
              <span className="badge">{latest.generated_by === 'cron' ? '🤖 Tự động' : '✍️ Tạo tay'}</span>
              <span className="sub">Sinh lúc {fmtDateTime(latest.created_at)}</span>
              {latest.period_start ? (
                <span className="sub">Tuần {fmtDate(latest.period_start)} đến {fmtDate(latest.period_end)}</span>
              ) : null}
              {latest.applied ? <span className="badge tone-ok">✓ Đang áp dụng</span> : null}
            </div>

            <div className="plan-top">
              <div className="plan-narrative">
                {(latest.data.narrative || []).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <aside className="plan-stats" aria-label="Tóm tắt số liệu">
                <div className="stat-tile">
                  <div className="stat-num">{vnInt(latest.data.summary?.totalPosts || 0)}</div>
                  <div className="stat-lbl">Bài có số liệu</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num">{vnInt(latest.data.summary?.totalEngagement || 0)}</div>
                  <div className="stat-lbl">Lượt tương tác</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num">{vnInt(latest.data.summary?.totalConversions || 0)}</div>
                  <div className="stat-lbl">Đơn hoặc lead</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num">{vnInt(latest.data.summary?.ranked || 0)}<span className="stat-sub">/{vnInt(latest.data.summary?.totalProducts || 0)}</span></div>
                  <div className="stat-lbl">Sản phẩm đủ mẫu</div>
                </div>
                <div className="stat-tile wide">
                  <div className="stat-num">{vnInt(latest.data.weeklyBudget || 0)} <span className="stat-sub">bài/tuần</span></div>
                  <div className="stat-lbl">{latest.data.summary?.topProduct ? `Dẫn đầu: ${latest.data.summary.topProduct}` : 'Ngân sách gợi ý tuần tới'}</div>
                </div>
              </aside>
            </div>

            <div className="plan-actions" style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              {latest.applied ? (
                <form action={clearPlanWeights}>
                  <button className="btn ghost" type="submit">Gỡ áp dụng</button>
                </form>
              ) : (
                <form action={applyPlanWeights}>
                  <input type="hidden" name="plan_id" value={latest.id} />
                  <button className="btn ok" type="submit" title="Vòng xoay sinh bài sẽ ưu tiên sản phẩm theo trọng số bên dưới">
                    Áp dụng trọng số
                  </button>
                </form>
              )}
            </div>

            {latest.data.products?.length ? (
              <div className="tablewrap">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th className="center">Hướng</th>
                      <th className="num">Số bài</th>
                      <th className="num">Tương tác/bài</th>
                      <th className="num">Đơn/bài</th>
                      <th className="num">Bài/tuần</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.data.products.map((p) => {
                      const t = TIER_LABEL[p.tier];
                      return (
                        <tr key={p.product}>
                          <td>{p.product}</td>
                          <td className="center"><span className={`badge ${t.cls}`}>{t.icon} {t.text}</span></td>
                          <td className="num">{vnInt(p.count)}</td>
                          <td className="num">{vnInt(p.avgEng)}</td>
                          <td className="num">{p.avgConv > 0 ? vnDec1(p.avgConv) : '—'}</td>
                          <td className="num"><b>{vnInt(p.postsPerWeek)}</b></td>
                          <td className="sub">{p.note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sub">Bản kế hoạch này chưa có sản phẩm nào đủ số liệu để xếp.</p>
            )}
          </section>

          {history.length ? (
            <>
              <h2 style={{ marginTop: 28 }}>Lịch sử kế hoạch</h2>
              <div className="tablewrap">
                <table className="datatable">
                  <thead>
                    <tr><th>Sinh lúc</th><th>Loại</th><th>Tuần</th><th>Dẫn đầu</th><th className="num">Đủ mẫu</th><th className="center"></th></tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id}>
                        <td>{fmtDateTime(r.created_at)}</td>
                        <td>{r.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}{r.applied ? ' · đang áp' : ''}</td>
                        <td className="sub">{r.period_start ? `${fmtDate(r.period_start)}–${fmtDate(r.period_end)}` : '—'}</td>
                        <td>{r.data?.summary?.topProduct || '—'}</td>
                        <td className="num">{vnInt(r.data?.summary?.ranked || 0)}</td>
                        <td className="center">
                          <form action={deletePlan}>
                            <input type="hidden" name="plan_id" value={r.id} />
                            <button className="btn no sm" type="submit" aria-label="Xóa kế hoạch">Xóa</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
