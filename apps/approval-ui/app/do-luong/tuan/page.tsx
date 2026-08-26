import Link from 'next/link';
import { getServerClient } from '../../../lib/supabase-server';
import { buildWeekReport } from '../../../lib/week-report';
import { vnInt } from '../../../lib/plan';
import BarChart from '../bar-chart';
import PostTitle from '../post-title';
import CopyReport from './copy-report';
import PlatformLogo from '../../noi-dung/platform-logo';

export const dynamic = 'force-dynamic';

// Báo cáo theo TUẦN — item 1a. Aggregate mkt_metrics theo tuần ISO VN (Thứ 2 - Chủ Nhật).
// Query ?tuan=0 = tuần này, ?tuan=1 = tuần trước, ?tuan=2 = 2 tuần trước... (cap 12).
// So sánh delta với tuần liền trước để bà con thấy xu hướng.
export default async function Page({ searchParams }: { searchParams?: { tuan?: string } }) {
  const client = getServerClient();
  const rawOffset = Number(searchParams?.tuan || 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(12, Math.floor(rawOffset))) : 0;

  const report = await buildWeekReport(client, offset);
  const { window: win, totals, totalsPrev, delta, posts, topPosts, byProduct, byKind, narrative } = report;

  // 26/8 (user tach 2 trang Do luong): trang tuan them bang "Tung bai — moi kenh" gom
  // Facebook + TikTok + YouTube TRONG TUAN nay, icon platform, bo cot don/lead.
  // Query mkt_metrics 3 source trong khung thoi gian tuan (dua published_at cua mkt_posts).
  const { data: postsInWeek } = await client
    .from('mkt_posts')
    .select('content_id, channel, external_url, published_at')
    .eq('status', 'published')
    .gte('published_at', win.startIso)
    .lt('published_at', win.endIso)
    .limit(500);
  type PostRow = { cid: string; channel: 'facebook' | 'tiktok' | 'youtube'; publishedAt: string; url: string };
  const weekPosts: PostRow[] = (postsInWeek || []).map((p: any) => ({
    cid: String(p.content_id || ''), channel: p.channel, publishedAt: String(p.published_at || ''), url: String(p.external_url || ''),
  })).filter((p) => p.cid && ['facebook', 'tiktok', 'youtube'].includes(p.channel));
  const weekCids = [...new Set(weekPosts.map((p) => p.cid))];
  const weekTitles = new Map<string, string>();
  if (weekCids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', weekCids);
    for (const c of cs || []) weekTitles.set((c as any).id, (c as any).title || '(không tên)');
  }
  const { data: weekMetrics } = await client
    .from('mkt_metrics')
    .select('entity_ref, source, metrics, created_at')
    .in('entity_ref', weekCids.length ? weekCids : ['__none__'])
    .order('created_at', { ascending: false })
    .limit(1500);
  // Snapshot mới nhất mỗi (cid, source).
  const latest = new Map<string, any>();
  for (const r of (weekMetrics || []) as any[]) {
    const k = `${r.entity_ref}|${r.source}`;
    if (!latest.has(k)) latest.set(k, r.metrics || {});
  }
  const rowsAllChannels = weekPosts.map((p) => {
    const m = latest.get(`${p.cid}|${p.channel}`) || {};
    const eng = (m.reactions || 0) + (m.comments || 0) + (m.shares || 0);
    return {
      cid: p.cid, channel: p.channel, publishedAt: p.publishedAt, url: p.url,
      title: weekTitles.get(p.cid) || '(không tên)',
      reactions: m.reactions || 0, comments: m.comments || 0, shares: m.shares || 0,
      views: m.views || 0, engagement: eng, shareUrl: m.shareUrl, videoId: m.videoId,
    };
  }).sort((a, b) => (b.views + b.engagement) - (a.views + a.engagement));

  const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');
  const deltaStr = (v: number) => v === 0 ? null : (
    <span className={`sub ${v > 0 ? 'delta-up' : 'delta-down'}`} style={{ fontSize: '.85rem', marginLeft: 6 }}>
      {v > 0 ? '▲' : '▼'} {Math.abs(v)}%
    </span>
  );

  // Màu chart: mỗi cột 1 màu KHÁC NHAU (user 26/8: "các chart cho màu đi chứ — nhớ là khác
   // màu với nhau"). Trước dùng color theo product nên khi topPosts 4 bài cùng SEA-40 thì
   // 4 cột đều 1 màu. Giờ dùng index cycle 1..8 để cột nào cũng khác.
  const cycleColor = (i: number) => (i % 8) + 1;
  const engByProduct = byProduct.map((t, i) => ({ label: t.product, value: t.avgEng, color: cycleColor(i) }));
  const topPostChart = topPosts.map((p, i) => ({ label: p.title, value: p.score, color: cycleColor(i) }));
  const kindChart = byKind.filter((k) => k.count > 0).map((k, i) => ({ label: k.label, value: k.avgEng, color: cycleColor(i) }));

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đo lường tuần</h1>
          <p className="sub">
            Gom số liệu cả tuần (Thứ 2 đến Chủ Nhật, giờ Việt Nam) mọi kênh: Facebook, TikTok, YouTube Shorts. So sánh với tuần liền trước để biết đang lên hay xuống. Xem số liệu HÔM NAY ở <Link className="src" href="/do-luong">Đo lường ngày</Link>.
          </p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/do-luong" className="btn ghost">← Đo lường ngày</Link>
          <CopyReport text={narrative} />
        </div>
      </header>

      <section className="week-picker" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 18px', flexWrap: 'wrap' }}>
        <b>Chọn tuần:</b>
        {[0, 1, 2, 3].map((o) => (
          <Link
            key={o}
            href={`/do-luong/tuan?tuan=${o}`}
            className={`btn ${o === offset ? 'ok' : 'ghost'} sm`}
            style={{ textDecoration: 'none' }}
          >
            {o === 0 ? 'Tuần này' : o === 1 ? 'Tuần trước' : `${o} tuần trước`}
          </Link>
        ))}
        <span className="sub" style={{ marginLeft: 12 }}>
          Đang xem: <b>{win.label}</b>
        </span>
      </section>

      {posts.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🗓️</div>
          <p>Tuần này chưa có bài nào đăng lên Facebook.</p>
          <p className="sub">
            Bấm <Link href={`/do-luong/tuan?tuan=${offset + 1}`}>Xem {offset === 0 ? 'tuần trước' : `${offset + 1} tuần trước`}</Link>{' '}
            hoặc kiểm tra hàng đợi duyệt xem có bài chờ không.
          </p>
        </div>
      ) : (
        <>
          <section className="kpi-row" aria-label="Chỉ số tổng tuần" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div className="stat-tile">
              <div className="stat-num">{vnInt(totals.posts)}{deltaStr(delta.posts)}</div>
              <div className="stat-lbl">Bài đăng trong tuần</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{vnInt(totals.engagement)}{deltaStr(delta.engagement)}</div>
              <div className="stat-lbl">Tổng tương tác</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{vnInt(totals.views)}{deltaStr(delta.views)}</div>
              <div className="stat-lbl">Tổng lượt xem</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{vnInt(totals.reach)}{deltaStr(delta.reach)}</div>
              <div className="stat-lbl">Tổng người thấy</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{vnInt(totals.avgEng)}</div>
              <div className="stat-lbl">TB tương tác/bài</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{vnInt(totals.conversions)}{deltaStr(delta.conversions)}</div>
              <div className="stat-lbl">Tổng đơn/lead</div>
            </div>
          </section>

          <div className="chart-grid">
            {engByProduct.length ? (
              <BarChart title="Tương tác trung bình mỗi bài theo sản phẩm" items={engByProduct} tone="accent" />
            ) : null}
            {kindChart.length ? (
              <BarChart title="Tương tác trung bình theo loại bài" items={kindChart} tone="ok" />
            ) : null}
          </div>

          {topPostChart.length ? (
            <BarChart title="Top bài trong tuần theo điểm học (tương tác + lượt xem + reach + giây xem)" items={topPostChart} tone="accent" />
          ) : null}

          <h2 style={{ marginTop: 24 }}>Top 5 bài trong tuần</h2>
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr><th>Tên bài</th><th>Sản phẩm</th><th className="num">Điểm</th><th className="num">Tương tác</th><th className="num">Lượt xem</th><th className="num">Người thấy</th><th className="num">Giây xem</th></tr>
              </thead>
              <tbody>
                {topPosts.map((p, i) => (
                  <tr key={p.cid}>
                    <td className="cell-title">
                      {i === 0 ? '🏆 ' : ''}
                      <PostTitle title={p.title} product={p.product} draft={''} url={p.url} />
                      {p.otherPage ? <span className="badge tone-demo" style={{ marginLeft: 6 }} title="Bài nhập từ page khác, không phải page chính hệ thống đang đăng. Số liệu chỉ để tham khảo.">Page khác</span> : null}
                    </td>
                    <td>{p.product}</td>
                    <td className="num"><b>{vnInt(p.score)}</b></td>
                    <td className="num">{vnInt(p.m.engagement)}</td>
                    <td className="num">{p.m.views ? fmt(p.m.views) : '—'}</td>
                    <td className="num">{p.m.reach ? fmt(p.m.reach) : '—'}</td>
                    <td className="num">{p.m.watchSec ? fmt(p.m.watchSec) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Từng bài trong tuần: user 26/8 chốt "chia ra 3 khung 3 nền tảng khác nhau chứa các
              bài/video của từng nền tảng". Tách rowsAllChannels theo channel, render 3 section
              riêng với heading + logo. Section không có bài vẫn hiện (empty state) để user
              biết nền tảng đó chưa đăng bài trong tuần. Cột Share bỏ ở YouTube (Shorts không
              có share count qua API); Facebook + TikTok giữ. */}
          {(() => {
            const rowsFB = rowsAllChannels.filter((r) => r.channel === 'facebook');
            const rowsTT = rowsAllChannels.filter((r) => r.channel === 'tiktok');
            const rowsYT = rowsAllChannels.filter((r) => r.channel === 'youtube');
            const linkOf = (r: typeof rowsAllChannels[0]) =>
              r.channel === 'tiktok' ? (r.shareUrl || r.url)
              : r.channel === 'youtube' && r.videoId ? `https://youtube.com/shorts/${r.videoId}`
              : r.url;
            const sections: Array<{ channel: 'facebook' | 'tiktok' | 'youtube'; label: string; rows: typeof rowsAllChannels; showShare: boolean }> = [
              { channel: 'facebook', label: 'Facebook', rows: rowsFB, showShare: true },
              { channel: 'tiktok', label: 'TikTok', rows: rowsTT, showShare: true },
              { channel: 'youtube', label: 'YouTube Shorts', rows: rowsYT, showShare: false },
            ];
            return sections.map((s) => (
              <div key={s.channel} style={{ marginTop: 24 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <PlatformLogo platform={s.channel} size={24} />
                  <span>{s.label} · {s.rows.length} bài</span>
                </h2>
                {s.rows.length === 0 ? (
                  <div className="empty" style={{ padding: '16px 8px' }}>
                    <p className="sub" style={{ margin: 0 }}>Chưa có bài {s.label} nào trong tuần này.</p>
                  </div>
                ) : (
                  <div className="tablewrap">
                    <table className="datatable">
                      <thead>
                        <tr>
                          <th>Tên bài</th>
                          <th className="num">Lượt xem</th>
                          <th className="num">React/Like</th>
                          <th className="num">Comment</th>
                          {s.showShare ? <th className="num">Share</th> : null}
                          <th>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.map((r) => {
                          const link = linkOf(r);
                          return (
                            <tr key={`${r.cid}-${r.channel}`}>
                              <td className="cell-title"><b>{r.title}</b></td>
                              <td className="num">{r.views ? fmt(r.views) : '—'}</td>
                              <td className="num">{vnInt(r.reactions)}</td>
                              <td className="num">{vnInt(r.comments)}</td>
                              {s.showShare ? <td className="num">{vnInt(r.shares)}</td> : null}
                              <td>{link ? <a className="src" href={link} target="_blank" rel="noreferrer">↗ Mở</a> : <span className="muted">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ));
          })()}

          <h2 style={{ marginTop: 24 }}>Theo loại bài — tuần này</h2>
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr><th>Loại</th><th className="num">Số bài</th><th className="num">TB điểm</th><th className="num">TB tương tác/bài</th><th className="num">Tổng tương tác</th></tr>
              </thead>
              <tbody>
                {byKind.map((k) => (
                  <tr key={k.kind}>
                    <td>{k.label}</td>
                    <td className="num">{vnInt(k.count)}</td>
                    <td className="num"><b>{vnInt(k.avgScore)}</b></td>
                    <td className="num">{vnInt(k.avgEng)}</td>
                    <td className="num">{vnInt(k.totalEng)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer' }}>
              <b>So sánh với tuần trước ({report.prevWindow.start.split('-').reverse().join('/')} đến {report.prevWindow.end.split('-').reverse().join('/')})</b>
            </summary>
            <div className="tablewrap" style={{ marginTop: 12 }}>
              <table className="datatable">
                <thead>
                  <tr><th>Chỉ số</th><th className="num">Tuần này</th><th className="num">Tuần trước</th><th className="num">Thay đổi</th></tr>
                </thead>
                <tbody>
                  <tr><td>Bài đăng</td><td className="num">{vnInt(totals.posts)}</td><td className="num">{vnInt(totalsPrev.posts)}</td><td className="num">{delta.posts > 0 ? '+' : ''}{delta.posts}%</td></tr>
                  <tr><td>Tương tác</td><td className="num">{vnInt(totals.engagement)}</td><td className="num">{vnInt(totalsPrev.engagement)}</td><td className="num">{delta.engagement > 0 ? '+' : ''}{delta.engagement}%</td></tr>
                  <tr><td>Lượt xem</td><td className="num">{vnInt(totals.views)}</td><td className="num">{vnInt(totalsPrev.views)}</td><td className="num">{delta.views > 0 ? '+' : ''}{delta.views}%</td></tr>
                  <tr><td>Người thấy</td><td className="num">{vnInt(totals.reach)}</td><td className="num">{vnInt(totalsPrev.reach)}</td><td className="num">{delta.reach > 0 ? '+' : ''}{delta.reach}%</td></tr>
                  <tr><td>Đơn/lead</td><td className="num">{vnInt(totals.conversions)}</td><td className="num">{vnInt(totalsPrev.conversions)}</td><td className="num">{delta.conversions > 0 ? '+' : ''}{delta.conversions}%</td></tr>
                </tbody>
              </table>
            </div>
          </details>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer' }}><b>Xem báo cáo dạng chữ (để copy)</b></summary>
            <pre style={{ background: 'var(--bg-2, #f5f7fa)', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap', marginTop: 8, fontSize: '.9rem', lineHeight: 1.5 }}>{narrative}</pre>
          </details>
        </>
      )}
    </main>
  );
}
