import { getServerClient } from '../../lib/supabase-server';
import type { Plan, Tier } from '../../lib/plan';
import { vnInt, vnDec1 } from '../../lib/plan';
import { generatePlanNow, applyPlanWeights, clearPlanWeights, deletePlan } from '../actions';
import { saveWeeklyGoal, saveFocus } from './goal-actions';
import GenerateButton from './generate-button';

export const dynamic = 'force-dynamic';

// TRANG KE HOACH sap xep lai 20/8 (user: "gon gang - the hien day du cac plan"):
//   1. HOM NAY: dang san pham nao may bai, content, chia se nhom nao (tu de xuat song).
//   2. KE HOACH TUAN: bang 7 ngay + so bai moi san pham.
//   3. HUONG DI BAI VIET: cac goc bai BOSS de xuat tu tri thuc (dung/chua dung).
//   4. CAI DAT (thu gon): muc tieu tuan, san pham tap trung, nhom chia se.
//   5. Chi tiet + lich su: giau trong <details>, bam moi xo ra.

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
  insufficient: { text: 'Gom số liệu', icon: '⏳', cls: 'tone-default' }
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch { return iso; }
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return day && m && y ? `${day}/${m}/${y}` : d;
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams?: { xem?: string } }) {
  const client = getServerClient();
  const [{ data, error }, { data: goalRow }, { data: focusRow }, { data: sgRow }] = await Promise.all([
    client
      .from('mkt_plans')
      .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
      .order('created_at', { ascending: false })
      .limit(12),
    client.from('app_config').select('value').eq('key', 'mkt_weekly_goal').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'mkt_share_groups').maybeSingle()
  ]);
  const goalText = ((goalRow as any)?.value?.text as string) || '';
  const focusVal = ((focusRow as any)?.value || {}) as { groups?: string[]; until?: string };
  const focusGroups = Array.isArray(focusVal.groups) ? focusVal.groups : [];
  const focusUntil = focusVal.until ? String(focusVal.until).slice(0, 10) : '';
  const focusActive = focusGroups.length > 0 && (!focusVal.until || new Date(focusVal.until).getTime() > Date.now());
  // Nhóm chia sẻ: nguồn CHUNG với popover 📣 ở Quản lý bài viết (app_config qua /api/share-groups).
  // Phần tử có thể là object {id,label,url} — lấy label hiển thị.
  const shareGroupsRaw = Array.isArray((sgRow as any)?.value?.groups) ? (sgRow as any).value.groups : [];
  const shareGroups: string[] = shareGroupsRaw
    .map((x: any) => (typeof x === 'string' ? x.trim() : String(x?.label || x?.id || '').trim()))
    .filter(Boolean);

  const rows = (data || []) as Row[];
  const planRows = rows.filter((r) => r.data?.origin !== 'live');
  const liveProposal = rows.find((r) => r.data?.origin === 'live');
  const liveData = liveProposal?.data;
  const appliedRow = rows.find((r) => r.applied);
  const learnSuggestion = rows.find((r) => r.data?.origin === 'learn-weekly' && !r.applied);

  // ?xem=<id>: xem lai ban cu trong khoi chi tiet.
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
  const latest = viewing || planRows[0];
  const history = planRows.filter((r) => r.id !== latest?.id);

  // Hom nay lam gi (tu lich cua de xuat song).
  const today = todayVN();
  const todayPlan = liveData?.daily_schedule?.find((d) => d.date === today) || null;

  // Huong di bai viet tu ban DANG AP (content_suggestions).
  const suggestions = appliedRow?.data?.content_suggestions || [];
  const sugFresh = suggestions.filter((s) => !s.used_at);
  const sugUsed = suggestions.filter((s) => s.used_at);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kế hoạch</h1>
          <p className="sub">
            BOSS đọc số liệu rồi tự cập nhật đề xuất mỗi 30 phút, mỗi tối tự áp trọng số, cuối tuần báo cáo. Bài vẫn chờ người bấm Duyệt mới đăng.
          </p>
        </div>
        <div className="head-actions">
          <GenerateButton action={generatePlanNow} />
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {/* ===== 1. HOM NAY ===== */}
      <section className="plan-card" style={{ borderLeft: '6px solid var(--accent, #1f5fbf)', marginBottom: 14 }}>
        <b style={{ fontSize: '1.05rem' }}>📌 Hôm nay ({fmtDate(today)})</b>
        {todayPlan ? (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <div>
              <b>Đăng bài bán:</b>{' '}
              {todayPlan.sales.length
                ? todayPlan.sales.map((s) => `${s.product} (${vnInt(s.count)} bài)`).join(', ')
                : 'không có bài bán hôm nay'}
              {' · '}<b>Bài content:</b> {vnInt(todayPlan.contentCount)}
            </div>
            <div>
              <b>Chia sẻ vào nhóm:</b>{' '}
              {todayPlan.groups.length ? todayPlan.groups.join(', ') : (shareGroups.length ? 'nghỉ hôm nay' : 'chưa nhập nhóm (mở Cài đặt bên dưới)')}
            </div>
            <p className="sub" style={{ margin: 0 }}>
              Máy tự sinh bài lúc 8h và 13h rồi chờ trong Hàng đợi duyệt. Việc của người: bấm Duyệt, và tự tay chia sẻ bài vào nhóm nêu trên (Facebook không cho máy đăng nhóm).
            </p>
          </div>
        ) : (
          <p className="sub" style={{ margin: '6px 0 0' }}>
            Chưa có lịch hôm nay. Đề xuất sống sẽ tự sinh trong vòng 30 phút tới, hoặc lưu lại Cài đặt bên dưới để sinh ngay.
          </p>
        )}
      </section>

      {/* ===== 2. KE HOACH TUAN ===== */}
      {liveData ? (
        <section className="plan-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b style={{ fontSize: '1.05rem' }}>📆 Kế hoạch tuần</b>
            <span className="sub">Cập nhật {fmtDateTime(liveProposal!.created_at)} · tự làm mới mỗi 30 phút</span>
          </div>

          {liveData.products?.length ? (
            <div className="tablewrap" style={{ marginTop: 10 }}>
              <table className="datatable">
                <thead><tr><th>Sản phẩm</th><th className="num">Bài/tuần</th><th className="num">Tương tác/bài</th><th>Hướng</th></tr></thead>
                <tbody>
                  {liveData.products.map((p) => {
                    const t = TIER_LABEL[p.tier];
                    return (
                      <tr key={p.product}>
                        <td>{p.product}</td>
                        <td className="num"><b>{vnInt(p.postsPerWeek)}</b></td>
                        <td className="num">{p.avgEng > 0 ? vnInt(p.avgEng) : '—'}</td>
                        <td><span className={`badge ${t.cls}`}>{t.icon} {t.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {liveData.daily_schedule?.length ? (
            <div className="tablewrap" style={{ marginTop: 12 }}>
              <table className="datatable">
                <thead><tr><th>Ngày</th><th>Bài bán</th><th className="num">Content</th><th>Chia sẻ nhóm</th></tr></thead>
                <tbody>
                  {liveData.daily_schedule.map((d) => (
                    <tr key={d.date} className={d.date === today ? 'row-today' : undefined}>
                      <td>{d.date === today ? '👉 ' : ''}<b>{d.dow}</b> <span className="sub">{fmtDate(d.date)}</span></td>
                      <td>{d.sales.length ? d.sales.map((s) => `${s.product} (${vnInt(s.count)})`).join(', ') : '—'}</td>
                      <td className="num">{vnInt(d.contentCount)}</td>
                      <td className="sub">{d.groups.length ? d.groups.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ===== 3. HUONG DI BAI VIET ===== */}
      {suggestions.length ? (
        <section className="plan-card" style={{ marginBottom: 14 }}>
          <b style={{ fontSize: '1.05rem' }}>🧭 Hướng đi bài viết ({vnInt(sugFresh.length)} chưa dùng, {vnInt(sugUsed.length)} đã dùng)</b>
          <p className="sub" style={{ margin: '4px 0 8px' }}>
            BOSS đề xuất góc bài từ kho tri thức. Mỗi ngày vòng xoay lấy một hướng, sinh cặp bài thử A và B, người duyệt mới đăng.
          </p>
          <ul className="directions-list" style={{ margin: 0 }}>
            {suggestions.map((d, i) => (
              <li key={i} className="direction-item" style={d.used_at ? { opacity: 0.55 } : undefined}>
                <div className="direction-head">
                  <b>{d.title}</b>
                  <span className="badge tone-default" style={{ marginLeft: 8 }}>{d.product}</span>
                  {d.used_at ? <span className="badge tone-ok" style={{ marginLeft: 6 }}>✓ đã dùng</span> : null}
                  {d.needs_gov_review ? <span className="badge tone-no" style={{ marginLeft: 6 }}>⚠️ cần duyệt QL</span> : null}
                </div>
                <p className="sub" style={{ margin: '2px 0 0' }}>{d.why}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ===== De xuat hoc tuan (Chu nhat) — chi hien khi co ===== */}
      {learnSuggestion ? (
        <section className="plan-card" style={{ borderLeft: '6px solid var(--ok, #1a9e6f)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <b>🧪 Đề xuất cuối tuần từ số liệu</b>
              <p className="sub" style={{ margin: '4px 0' }}>
                Sinh lúc {fmtDateTime(learnSuggestion.created_at)}. {(learnSuggestion.data.narrative || [])[0] || ''}
              </p>
            </div>
            <form action={applyPlanWeights}>
              <input type="hidden" name="plan_id" value={learnSuggestion.id} />
              <button className="btn ok" type="submit">Áp dụng đề xuất</button>
            </form>
          </div>
        </section>
      ) : null}

      {/* ===== 4. CAI DAT (thu gon) ===== */}
      <details className="plan-card" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem' }}>
          ⚙️ Cài đặt cho BOSS
          <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>
            {focusActive ? `tập trung: ${focusGroups.join(', ')}` : 'đủ sản phẩm'} · {shareGroups.length} nhóm chia sẻ
          </span>
        </summary>

        <form action={saveWeeklyGoal} style={{ marginTop: 12 }}>
          <b>🎯 Mục tiêu tuần</b>
          <p className="sub" style={{ margin: '2px 0 6px' }}>Viết như giao việc. Bỏ trống thì BOSS tự định hướng theo dữ liệu.</p>
          <textarea name="goal_text" defaultValue={goalText} rows={4} placeholder="Ví dụ: tuần này ưu tiên máy lọc dầu SF-50, cần 20 cuộc gọi về tổng đài." />
          <div style={{ marginTop: 6 }}><button className="btn ok" type="submit">Lưu mục tiêu</button></div>
        </form>

        <form action={saveFocus} style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <b>🎯 Tuần này chỉ đăng sản phẩm</b>
          <p className="sub" style={{ margin: '2px 0 6px' }}>
            Gõ tên cách nhau dấu phẩy (ví dụ <code>lọc dầu, lọc nước</code>). Trống và Lưu = đủ sản phẩm.
            {focusGroups.length ? ` Đang: ${focusGroups.join(', ')}${focusUntil ? ` (đến ${fmtDate(focusUntil)})` : ''}.` : ''}
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

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <b>👥 Nhóm chia sẻ (Facebook groups bạn đang ở)</b>
          <p className="sub" style={{ margin: '2px 0 6px' }}>
            Dùng CHUNG danh sách với nút <b>📣 Chia sẻ vào group</b> ở trang Quản lý bài viết — thêm, xóa, đổi tên nhóm ở đó.
            BOSS đọc danh sách này để xếp lịch chia sẻ theo ngày.
          </p>
          {shareGroups.length ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {shareGroups.map((g) => (<span key={g} className="badge tone-default">👥 {g}</span>))}
            </div>
          ) : (
            <p className="sub" style={{ margin: 0 }}>
              Chưa có nhóm nào. Mở <a href="/noi-dung">Quản lý bài viết</a>, bấm 📣 Chia sẻ vào group ở một bài đã đăng rồi thêm nhóm — danh sách tự đồng bộ về đây.
            </p>
          )}
        </div>
      </details>

      {/* ===== 5. Chi tiet + lich su (giau) ===== */}
      <details className="plan-card" open={!!viewing}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem' }}>
          📋 Bản kế hoạch đầy đủ và lịch sử
          {appliedRow ? <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>đang áp bản {fmtDateTime(appliedRow.created_at)}</span> : null}
        </summary>

        {!latest ? (
          <p className="sub" style={{ marginTop: 10 }}>Chưa có bản kế hoạch nào. Bấm Tạo kế hoạch ngay ở góc trên.</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {viewing ? (
              <p className="err" role="status">
                Đang xem lại bản cũ sinh lúc {fmtDateTime(viewing.created_at)}. <a href="/ke-hoach">Về bản mới nhất</a>
              </p>
            ) : null}
            <div className="plan-meta">
              <span className="badge">{latest.generated_by === 'cron' ? '🤖 Tự động' : '✍️ Tạo tay'}</span>
              {latest.data.cadence === 'weekly' ? <span className="badge">📅 Kế hoạch tuần (Thứ 2)</span>
                : latest.data.cadence === 'update' ? <span className="badge">🔁 Cập nhật</span> : null}
              <span className="sub">Sinh lúc {fmtDateTime(latest.created_at)}</span>
              {latest.applied ? <span className="badge tone-ok">✓ Đang áp dụng</span> : null}
            </div>

            <div className="plan-narrative" style={{ marginTop: 8 }}>
              {(latest.data.narrative || []).map((p, i) => (<p key={i}>{p}</p>))}
            </div>

            <div className="plan-actions" style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
              {latest.applied ? (
                <form action={clearPlanWeights}><button className="btn ghost" type="submit">Gỡ áp dụng</button></form>
              ) : (
                <form action={applyPlanWeights}>
                  <input type="hidden" name="plan_id" value={latest.id} />
                  <button className="btn ok" type="submit">Áp dụng trọng số</button>
                </form>
              )}
            </div>

            {latest.data.products?.length ? (
              <div className="tablewrap">
                <table className="datatable">
                  <thead>
                    <tr><th>Sản phẩm</th><th className="center">Hướng</th><th className="num">Số bài</th><th className="num">Tương tác/bài</th><th className="num">Đơn/bài</th><th className="num">Bài/tuần</th></tr>
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {history.length ? (
              <>
                <h3 style={{ margin: '16px 0 6px' }}>Lịch sử</h3>
                <div className="tablewrap">
                  <table className="datatable">
                    <thead>
                      <tr><th>Sinh lúc</th><th>Loại</th><th>Tuần</th><th className="center"></th></tr>
                    </thead>
                    <tbody>
                      {history.map((r) => (
                        <tr key={r.id}>
                          <td><a href={`/ke-hoach?xem=${r.id}`}>{fmtDateTime(r.created_at)}</a></td>
                          <td>{r.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}{r.applied ? ' · đang áp' : ''}</td>
                          <td className="sub">{r.period_start ? `${fmtDate(r.period_start)}–${fmtDate(r.period_end)}` : '—'}</td>
                          <td className="center">
                            <form action={deletePlan} style={{ display: 'inline' }}>
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
          </div>
        )}
      </details>
    </main>
  );
}
