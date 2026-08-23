import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { refreshFacebookMetrics, setConversions, deleteContent, importManualFacebookPost } from '../actions';
import BarChart from './bar-chart';
import PostTitle from './post-title';
import MetricsAuto from './metrics-auto';
import RefreshButton from './refresh-button';
// @ts-ignore — module JS thuần
import { guessGroup } from '../../lib/gen/products.mjs';
// @ts-ignore — module JS thuần
import { isOtherPage, OTHER_PAGE_LABEL, OTHER_PAGE_HINT } from '../../lib/page-origin.mjs';

// Tab Đo lường trong Quản lý bài viết (user 21/8: "đo lường gộp với quản lý bài viết cho cụ
// thể và dễ kiểm soát"). Nguyên nội dung trang /do-luong cũ chuyển vào đây; /do-luong giờ chỉ
// redirect về /noi-dung?loai=do-luong. Báo cáo tuần vẫn là trang riêng /do-luong/tuan.

type M = { reactions?: number; comments?: number; shares?: number; engagement?: number; views?: number; watchSec?: number; reach?: number };

export default async function DoLuongSection() {
  const client = getServerClient();

  // Kết quả lần nhập bài đăng tay gần nhất (run_log task mkt.import_manual_post) để báo rõ
  // thành công / lỗi ngay dưới ô nhập (server action không trả message về form được).
  const { data: impRows } = await client
    .from('run_log')
    .select('status, detail, created_at')
    .eq('task', 'mkt.import_manual_post')
    .order('created_at', { ascending: false })
    .limit(1);
  const impRow = (impRows || [])[0] as any;
  const lastImport = impRow ? { status: String(impRow.status), msg: String(impRow.detail?.msg || ''), link: String(impRow.detail?.link || '') } : null;

  // Số liệu Facebook mới nhất của mỗi bài (mkt_metrics là chuỗi snapshot, lấy bản mới nhất).
  // entity_ref bắt đầu '__' là số liệu page-level ('__page__' page test, '__page_real__' page
  // chính thức), KHÔNG phải bài viết. Trước đây chỉ chặn '__page__' nên '__page_real__' lọt
  // xuống thành một bài ảo trong bảng; giờ chặn theo tiền tố (bài học lib/plan.ts).
  const { data: mrows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'facebook')
    .order('created_at', { ascending: false })
    .limit(500);
  const latest = new Map<string, M>();
  const pageLevel = new Map<string, any>(); // '__page__' / '__page_real__' -> metrics mới nhất
  for (const r of mrows || []) {
    const cid = (r as any).entity_ref as string | null;
    if (!cid) continue;
    if (cid.startsWith('__')) { if (!pageLevel.has(cid)) pageLevel.set(cid, (r as any).metrics || {}); continue; }
    if (!latest.has(cid)) latest.set(cid, ((r as any).metrics || {}) as M);
  }
  // Ưu tiên follower page chính thức khi có, không thì page test.
  const pageMetrics = pageLevel.get('__page_real__') || pageLevel.get('__page__') || null;
  const pageFollowers = Number(pageMetrics?.followers) || 0;

  // Số liệu YouTube Shorts (user 21/8): cron 30 phút ghi source='youtube' (view, like,
  // comment theo content id). Lấy bản snapshot mới nhất của mỗi bài, hiện bảng riêng.
  const { data: ytRows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'youtube')
    .order('created_at', { ascending: false })
    .limit(200);
  const ytLatest = new Map<string, { views: number; reactions: number; comments: number; videoId?: string }>();
  for (const r of ytRows || []) {
    const cid = (r as any).entity_ref as string | null;
    if (!cid || cid.startsWith('__') || ytLatest.has(cid)) continue;
    const m = ((r as any).metrics || {}) as any;
    ytLatest.set(cid, { views: m.views || 0, reactions: m.reactions || 0, comments: m.comments || 0, videoId: m.videoId });
  }

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
  // Nạp tên bài cho CẢ bài Facebook lẫn bài chỉ có số liệu YouTube.
  const allCids = [...new Set([...cids, ...ytLatest.keys()])];
  const contents = new Map<string, { title: string; product: string; conversions: number; draft: string; brief: any }>();
  if (allCids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief, draft').in('id', allCids);
    for (const c of cs || []) {
      const brief = (c as any).brief || {};
      contents.set((c as any).id, {
        title: (c as any).title || '(không tên)',
        product: productOf(brief, (c as any).title, (c as any).draft),
        conversions: Number(brief.conversions) || 0,
        draft: String((c as any).draft || ''),
        brief
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
      const c = contents.get(cid) || { title: '(không rõ)', product: 'Khác', conversions: 0, draft: '', brief: {} };
      const reactions = m.reactions || 0;
      const comments = m.comments || 0;
      const shares = m.shares || 0;
      const url = postUrl.get(cid) || '';
      // Bài nằm trên PAGE KHÁC (nhập tay từ page không phải page hệ thống đang đăng) — user 22/8.
      const otherPage = !!(isOtherPage as (u: string, b: any) => boolean)(url, c.brief);
      return { cid, title: c.title, product: c.product, draft: c.draft, url, otherPage, reactions, comments, shares, engagement: reactions + comments + shares, views: m.views, reach: m.reach, watchSec: m.watchSec, conversions: c.conversions };
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
    <section>
      <div className="head-row" style={{ marginTop: 4 }}>
        <div>
          <p className="sub">So sánh tương tác + đơn/lead theo bài và theo sản phẩm. Sản phẩm nào cao thì đẩy mạnh hướng đó.</p>
          {pageFollowers ? (
            <p className="sub" style={{ marginTop: 4 }}>
              📣 Trang có <b>{fmt(pageFollowers)}</b> người theo dõi. Cột <b>Người xem</b> là số người thật sự thấy bài (kèm % so với người theo dõi).
            </p>
          ) : null}
        </div>
        <div className="head-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/do-luong/tuan" className="btn ghost" title="Báo cáo theo tuần (Thứ 2 đến Chủ Nhật)">📅 Báo cáo tuần</Link>
          <MetricsAuto action={refreshFacebookMetrics} minutes={30} />
          <RefreshButton action={refreshFacebookMetrics} />
        </div>
      </div>

      {/* Nhập bài ĐĂNG TAY trên Page để hệ thống kéo số liệu như bài máy đăng (user 18/8). */}
      <section className="import-manual">
        <form action={importManualFacebookPost} className="import-manual-form">
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <b>➕ Thêm bài đăng tay trên Page chính thức</b>
            <p className="sub" style={{ margin: '2px 0 6px' }}>
              Dán link bài đã đăng tay trên Page (bài viết, ảnh, video, reel). Hệ thống kiểm bài có thật, lưu lại và kéo số liệu ngay; từ đó cron 30 phút cập nhật đều như bài máy đăng. Chỉ đọc số liệu, không đụng bài trên Facebook.
              {' '}Bài trên <b>page chính thức</b> cần cấu hình token page đó (biến <code>FACEBOOK_REAL_PAGE_ACCESS_TOKEN</code> trên Vercel, có quyền <code>read_insights</code>); chưa có token thì Facebook không cho đọc số.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input name="fb_link" type="url" required placeholder="https://www.facebook.com/…/posts/… hoặc …/videos/…" className="note" style={{ flex: '1 1 320px', maxWidth: 'none' }} />
              <input name="title" placeholder="Tên gợi nhớ (không bắt buộc)" className="note" style={{ flex: '1 1 200px', maxWidth: 260 }} />
              <button className="btn ok" type="submit">Thêm và kéo số liệu</button>
            </div>
          </div>
        </form>
        {lastImport ? (
          <p className={`sub ${lastImport.status === 'error' ? 'err-note' : ''}`} style={{ marginTop: 6 }}>
            Lần nhập gần nhất: {lastImport.status === 'ok' ? '✅' : '⛔'} {lastImport.msg}{lastImport.link ? ` — ${lastImport.link.slice(0, 80)}` : ''}
          </p>
        ) : null}
      </section>

      {rows.length === 0 && ytLatest.size === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📊</div>
          <p>Chưa có số liệu.</p>
          <p className="sub">Đăng bài lên Facebook hoặc YouTube, chờ có tương tác, rồi bấm <b>Cập nhật số liệu</b>. (TikTok chưa lấy được vì app chưa audit.)</p>
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
                    <td className="cell-title">
                      <PostTitle title={r.title} product={r.product} draft={r.draft} url={r.url} />
                      {r.otherPage ? <span className="badge tone-demo" style={{ marginLeft: 6 }} title={OTHER_PAGE_HINT as string}>{OTHER_PAGE_LABEL as string}</span> : null}
                    </td>
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
          {ytLatest.size ? (
            <>
              <h2 style={{ marginTop: 24 }}>▶️ YouTube Shorts</h2>
              <div className="tablewrap">
                <table className="datatable">
                  <thead>
                    <tr><th>Tên bài</th><th>Lượt xem</th><th>Like</th><th>Comment</th><th></th></tr>
                  </thead>
                  <tbody>
                    {[...ytLatest.entries()]
                      .sort((a, b) => b[1].views - a[1].views)
                      .map(([cid, m]) => (
                        <tr key={cid}>
                          <td className="cell-title">{contents.get(cid)?.title || '(không rõ)'}</td>
                          <td>{fmt(m.views)}</td>
                          <td>{m.reactions}</td>
                          <td>{m.comments}</td>
                          <td>
                            {m.videoId ? (
                              <a className="src" href={`https://youtube.com/shorts/${m.videoId}`} target="_blank" rel="noreferrer">↗ Mở video</a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <p className="muted" style={{ marginTop: 10, fontSize: '.85rem' }}>
            <b>Lượt xem</b>, <b>Người xem</b> và <b>Giây xem</b> (video) cần quyền <b>read_insights</b> trên trang Facebook. Chưa cấp thì
            các cột này để trống, còn Like/Comment/Share vẫn có. Số liệu YouTube Shorts kéo qua YouTube API mỗi 30 phút. TikTok chưa lấy được số liệu vì app chưa qua audit.
          </p>
        </>
      )}
    </section>
  );
}
