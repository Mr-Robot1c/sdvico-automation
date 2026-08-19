import { getServerClient } from '../../lib/supabase-server';
import type { Plan, Tier } from '../../lib/plan';
import { vnInt, vnDec1 } from '../../lib/plan';
import { generatePlanNow, applyPlanWeights, clearPlanWeights, deletePlan } from '../actions';
import { saveWeeklyGoal, saveFocus } from './goal-actions';
import GenerateButton from './generate-button';

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

export default async function Page({ searchParams }: { searchParams?: { xem?: string } }) {
  const client = getServerClient();
  const [{ data, error }, { data: goalRow }, { data: focusRow }] = await Promise.all([
    client
      .from('mkt_plans')
      .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
      .order('created_at', { ascending: false })
      .limit(12),
    client.from('app_config').select('value').eq('key', 'mkt_weekly_goal').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle()
  ]);
  const goalText = ((goalRow as any)?.value?.text as string) || '';
  const goalUpdatedAt = ((goalRow as any)?.value?.updated_at as string) || null;
  // Sản phẩm tập trung tuần (vòng xoay chỉ lấy các folder này tới ngày `until`).
  const focusVal = ((focusRow as any)?.value || {}) as { groups?: string[]; until?: string };
  const focusGroups = Array.isArray(focusVal.groups) ? focusVal.groups : [];
  const focusUntil = focusVal.until ? String(focusVal.until).slice(0, 10) : '';
  const focusActive = focusGroups.length > 0 && (!focusVal.until || new Date(focusVal.until).getTime() > Date.now());

  const rows = (data || []) as Row[];

  // ?xem=<id>: xem lại một bản kế hoạch cũ trong thẻ chính (thay vì bản mới nhất).
  // Bản cũ ngoài 12 dòng đầu thì nạp riêng theo id.
  const viewId = searchParams?.xem || null;
  let viewing: Row | null = viewId ? rows.find((r) => r.id === viewId) || null : null;
  if (viewId && !viewing) {
    const { data: one } = await client
      .from('mkt_plans')
      .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
      .eq('id', viewId)
      .maybeSingle();
    viewing = (one as Row) || null;
  }

  const latest = viewing || rows[0];
  const history = rows.filter((r) => r.id !== latest?.id);
  const appliedRow = rows.find((r) => r.applied);

  // Tóm tắt bản đang áp dụng cho banner (hiện ngay sau khi bấm Áp dụng): ưu tiên vòng xoay,
  // số hướng đi còn lại, mục tiêu bản đó bám theo.
  const ap = appliedRow?.data;
  const apTop = (ap?.products || [])
    .filter((p) => p.postsPerWeek > 0)
    .sort((a, b) => b.postsPerWeek - a.postsPerWeek)
    .slice(0, 3)
    .map((p) => `${p.product} ${vnInt(p.postsPerWeek)} bài/tuần`);
  const apSug = ap?.content_suggestions || [];
  const apSugUsed = apSug.filter((s) => s.used_at).length;

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
          <GenerateButton action={generatePlanNow} />
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <section className="goal-card">
        <form action={saveWeeklyGoal}>
          <div className="goal-head">
            <b>🎯 Mục tiêu tuần giao cho BOSS</b>
            {goalUpdatedAt ? <span className="sub">Cập nhật {fmtDateTime(goalUpdatedAt)}</span> : null}
          </div>
          <p className="sub" style={{ margin: '4px 0 8px' }}>
            Viết như giao việc cho nhân viên: ưu tiên sản phẩm nào, cần bao nhiêu cuộc gọi hoặc lượt xem, có chạy quảng cáo không.
            Bỏ trống cũng được, khi đó BOSS tự định hướng dựa trên dữ liệu các AI đã học.
          </p>
          <textarea
            name="goal_text"
            defaultValue={goalText}
            rows={2}
            placeholder="Ví dụ: tuần này ưu tiên máy lọc dầu SF-50, cần 20 cuộc gọi về tổng đài, chưa chạy quảng cáo trả phí."
          />
          <div style={{ marginTop: 8 }}>
            <button className="btn ok" type="submit">Lưu mục tiêu</button>
          </div>
        </form>

        {/* Tập trung sản phẩm tuần: vòng xoay CHỈ sinh bài cho các sản phẩm này tới ngày hết hạn,
            rồi tự trở lại đủ sản phẩm (user 19/8: "tuần này up lọc dầu với lọc nước"). */}
        <form action={saveFocus} style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div className="goal-head">
            <b>🎯 Tuần này chỉ đăng sản phẩm</b>
            {focusGroups.length ? (
              <span className={`sub ${focusActive ? '' : 'muted'}`}>
                {focusActive ? `Đang áp: ${focusGroups.join(', ')}${focusUntil ? ` (đến hết ${focusUntil.split('-').reverse().join('/')})` : ''}` : 'Đã hết hạn, vòng xoay đủ sản phẩm'}
              </span>
            ) : null}
          </div>
          <p className="sub" style={{ margin: '4px 0 8px' }}>
            Gõ tên sản phẩm cách nhau dấu phẩy (khớp theo tên folder Kho tư liệu, ví dụ: <code>lọc dầu, lọc nước</code>). Để trống và Lưu = bỏ tập trung.
          </p>
          <div className="row" style={{ alignItems: 'center' }}>
            <input className="note" name="focus_groups" defaultValue={focusGroups.join(', ')} placeholder="lọc dầu, lọc nước" style={{ maxWidth: 360 }} aria-label="Sản phẩm tập trung" />
            <label className="sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              đến hết ngày
              <input type="date" name="focus_until" defaultValue={focusUntil} className="note" style={{ maxWidth: 170, flex: '0 0 auto' }} aria-label="Đến ngày" />
            </label>
            <button className="btn ok" type="submit">Lưu</button>
          </div>
        </form>
      </section>

      {appliedRow ? (
        <div className="applied-banner" role="status">
          <b>✓ Đang áp dụng kế hoạch sinh lúc {fmtDateTime(appliedRow.created_at)}.</b>
          {apTop.length ? (
            <p>Vòng xoay sinh bài ưu tiên: {apTop.join(', ')}{(ap?.products?.length || 0) > 3 ? ' và các sản phẩm còn lại giữ nhịp tối thiểu' : ''}.</p>
          ) : (
            <p>Chưa có sản phẩm nào đủ số liệu, vòng xoay chọn đều các folder.</p>
          )}
          {apSug.length ? (
            <p>
              {vnInt(apSug.length - apSugUsed)} hướng đi tuần chưa dùng ({vnInt(apSugUsed)} đã dùng). Mỗi ngày vòng xoay lấy một hướng, sinh cặp bài thử A với B kèm video shorts, người duyệt mới đăng.
            </p>
          ) : null}
          {ap?.goal ? <p className="sub">Bản này bám mục tiêu: {ap.goal}</p> : null}
        </div>
      ) : null}

      {viewing ? (
        <p className="err" role="status">
          Đang xem lại bản kế hoạch cũ sinh lúc {fmtDateTime(viewing.created_at)}. <a href="/ke-hoach">Về bản mới nhất</a>
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
              {latest.data.cadence === 'weekly' ? (
                <span className="badge">📅 Kế hoạch tuần (Thứ 2)</span>
              ) : latest.data.cadence === 'update' ? (
                <span className="badge">🔁 Cập nhật giữa tuần (Thứ 6)</span>
              ) : null}
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
                <div className="stat-tile" title="Sản phẩm phải có từ 3 bài trở lên (có số liệu) mới đủ để xếp thắng/thua. Số dưới ngưỡng đang gom thêm dữ liệu.">
                  <div className="stat-num">{vnInt(latest.data.summary?.ranked || 0)}<span className="stat-sub">/{vnInt(latest.data.summary?.totalProducts || 0)}</span></div>
                  <div className="stat-lbl">Sản phẩm đủ số liệu để xếp hạng</div>
                </div>
                <div className="stat-tile wide">
                  <div className="stat-num">{vnInt(latest.data.weeklyBudget || 0)} <span className="stat-sub">bài/tuần</span></div>
                  <div className="stat-lbl">{latest.data.summary?.topProduct ? `Dẫn đầu: ${latest.data.summary.topProduct}` : 'Ngân sách gợi ý tuần tới'}</div>
                </div>
                {latest.data.summary?.knowledge ? (
                  <>
                    <div className="stat-tile" title="Số bản ghi tri thức nội bộ 7 ngày qua (file thả vào bucket kho-tri-thuc-noi-bo).">
                      <div className="stat-num">{vnInt(latest.data.summary.knowledge.internal || 0)}</div>
                      <div className="stat-lbl">Nguồn nội bộ (7 ngày)</div>
                    </div>
                    <div className="stat-tile" title="Số nguồn tri thức public bot học từ web mỗi Chủ nhật.">
                      <div className="stat-num">{vnInt(latest.data.summary.knowledge.publicSrc || 0)}</div>
                      <div className="stat-lbl">Nguồn public (7 ngày)</div>
                    </div>
                  </>
                ) : null}
              </aside>
            </div>

            {latest.data.content_suggestions?.length ? (
              <section className="content-directions" style={{ margin: '16px 0' }}>
                <h2 style={{ marginBottom: 8 }}>Hướng đi tuần tới</h2>
                <p className="sub" style={{ marginTop: 0 }}>
                  Bot đọc kho tri thức rồi đề xuất {latest.data.content_suggestions.length} bài đăng cụ thể. Mỗi gợi ý bám nguồn thật, không sinh chung chung.
                </p>
                <ul className="directions-list">
                  {latest.data.content_suggestions.map((d, i) => (
                    <li key={i} className="direction-item">
                      <div className="direction-head">
                        <b>{d.title}</b>
                        <span className="badge tone-default" style={{ marginLeft: 8 }}>{d.kind}</span>
                        {d.needs_gov_review ? <span className="badge tone-no" style={{ marginLeft: 6 }}>⚠️ cần duyệt QL</span> : null}
                      </div>
                      <div className="sub">Sản phẩm: {d.product}</div>
                      <p style={{ margin: '4px 0' }}>{d.why}</p>
                      <div className="sub">Dựa trên: {(d.sources || []).join(', ')}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {latest.data.summary?.knowledge && (
              latest.data.summary.knowledge.internalHighlights?.length ||
              latest.data.summary.knowledge.publicHighlights?.length
            ) ? (
              <details className="knowledge-detail" style={{ margin: '12px 0' }}>
                <summary style={{ cursor: 'pointer' }}>
                  Xem chi tiết nguồn tri thức đã dùng
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <b>Nội bộ:</b>
                    {latest.data.summary.knowledge.internalHighlights?.length ? (
                      <ul>
                        {latest.data.summary.knowledge.internalHighlights.map((h) => (
                          <li key={h.id}>
                            {h.title || '(không tiêu đề)'}
                            {h.needs_gov_review ? <span className="badge tone-no" style={{ marginLeft: 6 }}>⚠️</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="sub">chưa có nguồn nội bộ tuần này</p>
                    )}
                    <a className="sub" href="/kho-tri-thuc">Mở Kho tri thức</a>
                  </div>
                  <div>
                    <b>Public:</b>
                    {latest.data.summary.knowledge.publicHighlights?.length ? (
                      <ul>
                        {latest.data.summary.knowledge.publicHighlights.map((h) => (
                          <li key={h.id}>
                            <a href={h.source_url} target="_blank" rel="noopener noreferrer">
                              {h.source_title || h.source_url}
                            </a>
                            {h.needs_gov_review ? <span className="badge tone-no" style={{ marginLeft: 6 }}>⚠️</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="sub">chưa có nguồn public tuần này</p>
                    )}
                  </div>
                </div>
              </details>
            ) : null}

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
                        <td><a href={`/ke-hoach?xem=${r.id}`} title="Xem lại bản kế hoạch này">{fmtDateTime(r.created_at)}</a></td>
                        <td>{r.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}{r.applied ? ' · đang áp' : ''}</td>
                        <td className="sub">{r.period_start ? `${fmtDate(r.period_start)}–${fmtDate(r.period_end)}` : '—'}</td>
                        <td>{r.data?.summary?.topProduct || '—'}</td>
                        <td className="num">{vnInt(r.data?.summary?.ranked || 0)}</td>
                        <td className="center">
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <a className="btn ghost sm" href={`/ke-hoach?xem=${r.id}`}>Xem</a>
                            <form action={deletePlan}>
                              <input type="hidden" name="plan_id" value={r.id} />
                              <button className="btn no sm" type="submit" aria-label="Xóa kế hoạch">Xóa</button>
                            </form>
                          </div>
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
