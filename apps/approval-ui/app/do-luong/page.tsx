import { getServerClient } from '../../lib/supabase-server';
import { refreshFacebookMetrics, setConversions, deleteContent } from '../actions';
import BarChart from './bar-chart';
import PostTitle from './post-title';
import MetricsAuto from './metrics-auto';
import RefreshButton from './refresh-button';
// @ts-ignore — module JS thuần
import { guessGroup } from '../../lib/gen/products.mjs';

export const dynamic = 'force-dynamic';

type M = { reactions?: number; comments?: number; shares?: number; engagement?: number; views?: number; watchSec?: number; reach?: number };

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
  let pageMetrics: any = null; // số liệu page-level (follower), entity_ref='__page__'
  for (const r of mrows || []) {
    const cid = (r as any).entity_ref as string | null;
    if (!cid) continue;
    if (cid === '__page__') { if (!pageMetrics) pageMetrics = (r as any).metrics || {}; continue; }
    if (!latest.has(cid)) latest.set(cid, ((r as any).metrics || {}) as M);
  }
  const pageFollowers = Number(pageMetrics?.followers) || 0;

  // Tên sản phẩm của một bài. Ưu tiên: rotation_group folder chuẩn -> guessGroup(rot+kw+title+draft)
  // -> keyword thô -> title thô. Thêm draft (300 ký tự đầu) để bắt bài Xưởng sản xuất tay có title
  // không nêu tên SP nhưng thân bài có (vd "Chạy máy khoẻ..." + thân "Thiết bị lọc dầu SF-50 giúp...").
  const productOf = (brief: any, title: string, draft: string = ''): string => {
    const g = brief?.rotation_group as string | undefined;
    if (brief?.post_kind === 'content' || g === 'Bài content') return 'Bài content';
    if (g && g !== 'Content' && /^\d+\.\s/.test(g)) return g.replace(/^\s*\d+\.\s*/, '').trim();
    const draftSnippet = String(draft || '').slice(0, 300);
    const guess = (guessGroup as (s: string) => string | null)(
      `${g || ''} ${brief?.keyword || ''} ${title || ''} ${draftSnippet}`
    );
    if (guess) return guess.replace(/^\s*\d+\.\s*/, '').trim();
    const name = (g ? g.replace(/^\s*\d+\.\s*/, '').trim() : '') || brief?.keyword || title || 'Khác';
    return String(name).trim() || 'Khác';
  };

  const cids = [...latest.keys()];
  const contents = new Map<string, { title: string; product: string; conversions: number; draft: string }>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief, draft').in('id', cids);
    for (const c of cs || []) {
      const brief = (c as any).brief || {};
      contents.set((c as any).id, {
        title: (c as any).title || '(không tên)',
        product: productOf(brief, (c as any).title, (c as any).draft),
        conversions: Number(brief.conversions) || 0,
        draft: String((c as any).draft || '')
      });
    }
  }

  // Link bài đã đăng thật (mkt_posts.external_url): ưu tiên Facebook (link xem được), rồi kênh khác.
  // Bấm tên bài sẽ mở đúng bài này. Bài chưa đăng hoặc không có link thì xem nội dung nháp.
  const postUrl = new Map<string, string>();
  if (cids.length) {
    const { data: ps } = await client
      .from('mkt_posts')
      .select('content_id, channel, external_url, published_at, status')
      .in('content_id', cids)
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    const byId = new Map<string, { fb?: string; other?: string }>();
    for (const p of ps || []) {
      const id = (p as any).content_id as string | null;
      const url = (p as any).external_url as string | null;
      if (!id || !url) continue;
      const e = byId.get(id) || {};
      if ((p as any).channel === 'facebook') e.fb = e.fb || url;
      else e.other = e.other || url;
      byId.set(id, e);
    }
    for (const [id, e] of byId) postUrl.set(id, e.fb || e.other || '');
  }

  const rows = cids
    .map((cid) => {
      const m = latest.get(cid) || {};
      const c = contents.get(cid) || { title: '(không rõ)', product: 'Khác', conversions: 0, draft: '' };
      const reactions = m.reactions || 0;
      const comments = m.comments || 0;
      const shares = m.shares || 0;
      return { cid, title: c.title, product: c.product, draft: c.draft, url: postUrl.get(cid) || '', reactions, comments, shares, engagement: reactions + comments + shares, views: m.views, reach: m.reach, watchSec: m.watchSec, conversions: c.conversions };
    })
    .sort((a, b) => b.engagement - a.engagement);

  const byProduct = new Map<string, { count: number; engagement: number; conversions: number; views: number }>();
  for (const r of rows) {
    const g = byProduct.get(r.product) || { count: 0, engagement: 0, conversions: 0, views: 0 };
    g.count += 1;
    g.engagement += r.engagement;
    g.conversions += r.conversions;
    g.views += r.views || 0;
    byProduct.set(r.product, g);
  }
  const productRows = [...byProduct.entries()]
    .map(([product, g]) => ({
      product,
      count: g.count,
      engagement: g.engagement,
      conversions: g.conversions,
      views: g.views,
      avgEng: g.count ? Math.round(g.engagement / g.count) : 0,
      avgConv: g.count ? Math.round((g.conversions / g.count) * 10) / 10 : 0,
      avgViews: g.count ? Math.round(g.views / g.count) : 0
    }))
    .sort((a, b) => b.avgConv - a.avgConv || b.avgEng - a.avgEng);

  const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

  // Màu cố định theo SẢN PHẨM (không theo thứ hạng): mỗi sản phẩm giữ một màu xuyên suốt cả ba
  // biểu đồ, bài top thừa hưởng màu của sản phẩm nó. 8 slot màu phân loại đã kiểm định (dataviz).
  // Sản phẩm thứ 9 trở đi dùng màu xám trung tính (slot 0).
  const productColor = new Map<string, number>();
  productRows.forEach((t, i) => productColor.set(t.product, i < 8 ? i + 1 : 0));
  const colorOf = (product: string) => productColor.get(product) || 0;

  // Dữ liệu cho biểu đồ.
  const engByProduct = productRows.map((t) => ({ label: t.product, value: t.avgEng, color: colorOf(t.product) }));
  const convByProduct = productRows.filter((t) => t.conversions > 0).map((t) => ({ label: t.product, value: t.avgConv, color: colorOf(t.product) }));
  const topPosts = rows.slice(0, 8).map((r) => ({ label: r.title, value: r.engagement, color: colorOf(r.product) }));

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đo lường</h1>
          <p className="sub">So sánh tương tác + đơn/lead theo bài và theo sản phẩm. Sản phẩm nào cao thì đẩy mạnh hướng đó.</p>
          {pageFollowers ? (
            <p className="sub" style={{ marginTop: 4 }}>
              📣 Trang có <b>{fmt(pageFollowers)}</b> người theo dõi. Cột <b>Người xem</b> là số người thật sự thấy bài (kèm % so với người theo dõi).
            </p>
          ) : null}
        </div>
        <div className="head-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MetricsAuto action={refreshFacebookMetrics} minutes={30} />
          <RefreshButton action={refreshFacebookMetrics} />
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
                <tr><th>Sản phẩm</th><th>Số bài</th><th>TB đơn/bài</th><th>Tổng đơn</th><th>TB tương tác/bài</th><th>TB lượt xem/bài</th><th>Tổng tương tác</th></tr>
              </thead>
              <tbody>
                {productRows.map((t, i) => (
                  <tr key={t.product}>
                    <td>{i === 0 ? '🏆 ' : ''}{t.product}</td>
                    <td>{t.count}</td>
                    <td><b>{t.avgConv}</b></td>
                    <td>{t.conversions}</td>
                    <td>{t.avgEng}</td>
                    <td>{t.avgViews ? fmt(t.avgViews) : '—'}</td>
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
                <tr><th>Tên bài</th><th>Sản phẩm</th><th>Tương tác</th><th>Lượt xem</th><th>Người xem</th><th>Like</th><th>Comment</th><th>Share</th><th>Giây xem</th><th>Đơn/Lead</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cid}>
                    <td className="cell-title"><PostTitle title={r.title} product={r.product} draft={r.draft} url={r.url} /></td>
                    <td>{r.product}</td>
                    <td><b>{r.engagement}</b></td>
                    <td>{r.views == null ? '—' : fmt(r.views)}</td>
                    <td>{r.reach == null ? '—' : (pageFollowers ? `${fmt(r.reach)} (${Math.round((r.reach / pageFollowers) * 100)}%)` : fmt(r.reach))}</td>
                    <td>{r.reactions}</td>
                    <td>{r.comments}</td>
                    <td>{r.shares}</td>
                    <td>{r.watchSec == null ? '—' : fmt(r.watchSec)}</td>
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
          <p className="muted" style={{ marginTop: 10, fontSize: '.85rem' }}>
            <b>Lượt xem</b>, <b>Người xem</b> và <b>Giây xem</b> (video) cần quyền <b>read_insights</b> trên trang Facebook. Chưa cấp thì
            các cột này để trống, còn Like/Comment/Share vẫn có. TikTok chưa lấy được số liệu vì app chưa qua audit.
          </p>
        </>
      )}
    </main>
  );
}
