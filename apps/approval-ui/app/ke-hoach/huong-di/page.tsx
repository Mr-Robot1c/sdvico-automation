import { getServerClient } from '../../../lib/supabase-server';
import type { Plan } from '../../../lib/plan';
import { vnInt } from '../../../lib/plan';
import { loadAssetGroups, productNameOf } from '../../../lib/week-plan';
import { applyPlanWeights } from '../../actions';
import { loadPlans, loadAppliedPlan, loadPlanById, fmtDate, fmtDateTime, TIER_LABEL, ROLE_LABEL, isJunkProduct, type PlanRow } from '../shared';

export const dynamic = 'force-dynamic';

// TAB HƯỚNG ĐI (23/10, tách khỏi Tuần này): hướng đi bài viết + sản phẩm ưu tiên của bản đang áp,
// hoặc của bản cũ khi mở ?xem=<id> (từ tab Lịch sử / banner đề xuất tuần sau).
export default async function Page({ searchParams }: { searchParams?: { xem?: string } }) {
  const client = getServerClient();
  const viewId = searchParams?.xem || null;
  const [{ rows }, appliedRow, viewing, assets] = await Promise.all([
    loadPlans(client),
    loadAppliedPlan(client),
    viewId ? loadPlanById(client, viewId) : Promise.resolve(null),
    loadAssetGroups(client),
  ]);
  // Chưa có bản nào đang áp thì hiện bản mới nhất (không tính bản live).
  const latestId = !viewing && !appliedRow ? rows.find((r) => r.origin !== 'live')?.id : undefined;
  const displayRow: PlanRow | null = viewing || appliedRow || (latestId ? await loadPlanById(client, latestId) : null);
  const displayData = displayRow?.data || null;
  const suggestions = (displayData?.content_suggestions || []) as any[];
  const usedCount = suggestions.filter((s) => s.used_at || s.pending_variant).length;
  const products = ((displayData?.products || []) as Plan['products']).filter((p) => !isJunkProduct(p.product));

  return (
    <>
      {viewing ? (
        <section className="blk tone-accent" role="status">
          <div className="kh-strip">
            <div className="grow">
              Đang xem lại bản sinh lúc <b>{fmtDateTime(viewing.created_at)}</b>
              {viewing.data?.proposal ? <> (đề xuất tuần {fmtDate(viewing.data.proposal.week_start)})</> : null}.
            </div>
            {!viewing.applied ? (
              <form action={applyPlanWeights}>
                <input type="hidden" name="plan_id" value={viewing.id} />
                <button className="btn ok sm" type="submit">Áp dụng bản này</button>
              </form>
            ) : null}
            <a className="btn ghost sm" href="/ke-hoach/huong-di">Về bản đang áp</a>
          </div>
        </section>
      ) : null}

      <section className="blk">
        <div className="kh-week-head">
          <h2>Hướng đi bài viết</h2>
          {suggestions.length ? <span className="sub">{vnInt(usedCount)}/{vnInt(suggestions.length)} đã ra bài</span> : null}
        </div>
        {suggestions.length ? (
          <div className="tablewrap table-scroll" style={{ marginTop: 8 }}>
            <table className="datatable">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Hướng đi</th>
                  <th style={{ width: 200 }}>Sản phẩm</th>
                  <th style={{ width: 140 }}>Dạng bài</th>
                  <th style={{ width: 150 }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => {
                  const used = s.used_at || s.pending_variant;
                  const noAssets = !used && !assets.productsWithImages.some((p) => p.toLowerCase() === productNameOf(String(s.product || '')).toLowerCase());
                  return (
                    <tr key={i}>
                      <td className="sub">{i + 1}</td>
                      <td>
                        <div className="wk-t">{s.title}</div>
                        {s.hook ? <div className="wk-sub" title={s.why || ''}>{s.hook}</div> : (s.why ? <div className="wk-sub kh-clamp" title={s.why}>{s.why}</div> : null)}
                      </td>
                      <td className="sub">{String(s.product || '—')}{s.needs_gov_review ? ' ⚠️' : ''}</td>
                      <td className="sub">{ROLE_LABEL[String(s.role || '')] || '—'}{s.emotion ? `, ${s.emotion}` : ''}</td>
                      <td>
                        {s.used_at
                          ? <span className="badge tone-ok">Đã ra bài {fmtDate(String(s.used_at).slice(0, 10)).slice(0, 5)}</span>
                          : s.pending_variant
                            ? <span className="badge tone-default">Đã ra bài</span>
                            : noAssets
                              ? <span className="badge tone-no" title="Folder sản phẩm này chưa có ảnh, máy không sinh bài được. Thả ảnh vào Kho tư liệu.">Thiếu tư liệu</span>
                              : <span className="badge tone-default">Chờ tới lượt</span>}
                        {!used && s.carried ? <div className="wk-sub" style={{ marginTop: 4 }}>giữ từ bản trước</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sub" style={{ marginTop: 8 }}>Bản này chưa có hướng đi nào. Vào tab <a href="/ke-hoach/cai-dat">Cài đặt</a> để soạn lại kế hoạch.</p>
        )}
      </section>

      <section className="blk">
        <h2>Sản phẩm ưu tiên</h2>
        {products.length ? (
          <div className="tablewrap table-scroll" style={{ marginTop: 8 }}>
            <table className="datatable">
              <thead><tr><th>Sản phẩm</th><th className="num">Ưu tiên</th><th className="num">Tương tác/bài</th><th>Hướng xử lý</th></tr></thead>
              <tbody>
                {products.map((p) => {
                  // 7/9: bản có tier lạ (dữ liệu chỉnh tay) không được làm sập cả trang -> rơi về nhãn Gom số liệu.
                  const t = TIER_LABEL[p.tier] || TIER_LABEL.insufficient;
                  return (
                    <tr key={p.product}>
                      <td>{p.product}</td>
                      <td className="num"><b>×{vnInt(p.weight)}</b></td>
                      <td className="num">{p.avgEng > 0 ? vnInt(p.avgEng) : '—'}</td>
                      <td><span className={`badge ${t.cls}`}>{t.icon} {t.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sub" style={{ marginTop: 8 }}>Chưa có sản phẩm nào đủ số liệu.</p>
        )}
      </section>
    </>
  );
}
