import { getServerClient } from '../../lib/supabase-server';
import { refreshFacebookMetrics, setConversions, deleteContent } from '../actions';
import BarChart from './bar-chart';

export const dynamic = 'force-dynamic';

type M = { reactions?: number; comments?: number; shares?: number; engagement?: number };

export default async function Page() {
  const client = getServerClient();

  // Số liệu Facebook mới nhất của mỗi bài (mkt_metrics là chuỗi snapshot, lấy bản mới nhất).
  const { data: mrows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'facebook')
    .order('created_at', { ascending: false })
    .limit(500);
  const latest = new Map<string, M>();
  for (const r of mrows || []) {
    const cid = (r as any).entity_ref as string | null;
    if (cid && !latest.has(cid)) latest.set(cid, ((r as any).metrics || {}) as M);
  }

  // Tên sản phẩm của một bài: ưu tiên folder xoay vòng (rotation_group), rồi keyword, rồi tiêu đề.
  const productOf = (brief: any, title: string): string => {
    const g = brief?.rotation_group as string | undefined;
    const name = (g ? g.replace(/^\s*\d+\.\s*/, '').trim() : '') || brief?.keyword || title || 'Khác';
    return String(name).trim() || 'Khác';
  };

  const cids = [...latest.keys()];
  const contents = new Map<string, { title: string; product: string; conversions: number }>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief').in('id', cids);
    for (const c of cs || []) {
      const brief = (c as any).brief || {};
      contents.set((c as any).id, {
        title: (c as any).title || '(không tên)',
        product: productOf(brief, (c as any).title),
        conversions: Number(brief.conversions) || 0
      });
    }
  }

  const rows = cids
    .map((cid) => {
      const m = latest.get(cid) || {};
      const c = contents.get(cid) || { title: '(không rõ)', product: 'Khác', conversions: 0 };
      const reactions = m.reactions || 0;
      const comments = m.comments || 0;
      const shares = m.shares || 0;
      return { cid, title: c.title, product: c.product, reactions, comments, shares, engagement: reactions + comments + shares, conversions: c.conversions };
    })
    .sort((a, b) => b.engagement - a.engagement);

  const byProduct = new Map<string, { count: number; engagement: number; conversions: number }>();
  for (const r of rows) {
    const g = byProduct.get(r.product) || { count: 0, engagement: 0, conversions: 0 };
    g.count += 1;
    g.engagement += r.engagement;
    g.conversions += r.conversions;
    byProduct.set(r.product, g);
  }
  const productRows = [...byProduct.entries()]
    .map(([product, g]) => ({
      product,
      count: g.count,
      engagement: g.engagement,
      conversions: g.conversions,
      avgEng: g.count ? Math.round(g.engagement / g.count) : 0,
      avgConv: g.count ? Math.round((g.conversions / g.count) * 10) / 10 : 0
    }))
    .sort((a, b) => b.avgConv - a.avgConv || b.avgEng - a.avgEng);

  // Dữ liệu cho biểu đồ.
  const engByProduct = productRows.map((t) => ({ label: t.product, value: t.avgEng }));
  const convByProduct = productRows.filter((t) => t.conversions > 0).map((t) => ({ label: t.product, value: t.avgConv }));
  const topPosts = rows.slice(0, 8).map((r) => ({ label: r.title, value: r.engagement }));

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đo lường</h1>
          <p className="sub">So sánh tương tác + đơn/lead theo bài và theo sản phẩm. Sản phẩm nào cao thì đẩy mạnh hướng đó.</p>
        </div>
        <div className="head-actions">
          <form action={refreshFacebookMetrics}>
            <button className="btn ok" type="submit">↻ Cập nhật số liệu</button>
          </form>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📊</div>
          <p>Chưa có số liệu.</p>
          <p className="sub">Đăng bài lên Facebook, chờ có tương tác, rồi bấm <b>Cập nhật số liệu</b>. (TikTok chưa lấy được vì app chưa audit.)</p>
        </div>
      ) : (
        <>
          <div className="chart-grid">
            <BarChart title="Tương tác trung bình mỗi bài theo sản phẩm" items={engByProduct} tone="accent" />
            {convByProduct.length ? (
              <BarChart title="Đơn/Lead trung bình mỗi bài theo sản phẩm" items={convByProduct} tone="ok" />
            ) : null}
          </div>
          {topPosts.length ? (
            <BarChart title="Top bài theo tương tác" items={topPosts} tone="accent" />
          ) : null}

          <h2 style={{ marginTop: 24 }}>Theo sản phẩm — xếp theo đơn/lead trung bình mỗi bài</h2>
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr><th>Sản phẩm</th><th>Số bài</th><th>TB đơn/bài</th><th>Tổng đơn</th><th>TB tương tác/bài</th><th>Tổng tương tác</th></tr>
              </thead>
              <tbody>
                {productRows.map((t, i) => (
                  <tr key={t.product}>
                    <td>{i === 0 ? '🏆 ' : ''}{t.product}</td>
                    <td>{t.count}</td>
                    <td><b>{t.avgConv}</b></td>
                    <td>{t.conversions}</td>
                    <td>{t.avgEng}</td>
                    <td>{t.engagement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 24 }}>Từng bài — nhập số đơn/lead vào đây</h2>
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr><th>Tên bài</th><th>Sản phẩm</th><th>Tương tác</th><th>Reactions</th><th>Comment</th><th>Share</th><th>Đơn/Lead</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cid}>
                    <td className="cell-title">{r.title}</td>
                    <td>{r.product}</td>
                    <td><b>{r.engagement}</b></td>
                    <td>{r.reactions}</td>
                    <td>{r.comments}</td>
                    <td>{r.shares}</td>
                    <td>
                      <form action={setConversions} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="hidden" name="content_id" value={r.cid} />
                        <input
                          type="number"
                          name="conversions"
                          min={0}
                          defaultValue={r.conversions}
                          className="note"
                          style={{ width: 64 }}
                          aria-label={`Số đơn/lead cho ${r.title}`}
                        />
                        <button className="btn ghost sm" type="submit">Lưu</button>
                      </form>
                    </td>
                    <td>
                      <form action={deleteContent}>
                        <input type="hidden" name="content_id" value={r.cid} />
                        <button className="btn no sm" type="submit" aria-label={`Xóa bài ${r.title}`} title="Xóa bài khỏi hệ thống (không gỡ bài đã đăng trên FB/TikTok)">Xóa</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
