import Link from 'next/link';
import { getServerClient } from '../../../lib/supabase-server';
import { buildWeekReport } from '../../../lib/week-report';
import { vnInt } from '../../../lib/plan';
import BarChart from '../bar-chart';
import PostTitle from '../post-title';
import CopyReport from './copy-report';

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

  const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');
  const deltaStr = (v: number) => v === 0 ? null : (
    <span className={`sub ${v > 0 ? 'delta-up' : 'delta-down'}`} style={{ fontSize: '.85rem', marginLeft: 6 }}>
      {v > 0 ? '▲' : '▼'} {Math.abs(v)}%
    </span>
  );

  const productColor = new Map<string, number>();
  byProduct.forEach((t, i) => productColor.set(t.product, i < 8 ? i + 1 : 0));
  const colorOf = (product: string) => productColor.get(product) || 0;

  const engByProduct = byProduct.map((t) => ({ label: t.product, value: t.avgEng, color: colorOf(t.product) }));
  const topPostChart = topPosts.map((p) => ({ label: p.title, value: p.score, color: colorOf(p.product) }));
  const kindChart = byKind.filter((k) => k.count > 0).map((k) => ({ label: k.label, value: k.avgEng, color: 0 }));

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đo lường theo tuần</h1>
          <p className="sub">
            Gom số liệu Facebook theo tuần (Thứ 2 đến Chủ Nhật, giờ Việt Nam). So sánh với tuần liền trước để biết đang lên hay xuống.
          </p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/do-luong" className="btn ghost">← Đo lường</Link>
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

          <h2 style={{ marginTop: 24 }}>Theo sản phẩm — tuần này</h2>
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr><th>Sản phẩm</th><th className="num">Số bài</th><th className="num">TB điểm</th><th className="num">TB tương tác/bài</th><th className="num">TB lượt xem/bài</th><th className="num">Tổng đơn/lead</th></tr>
              </thead>
              <tbody>
                {byProduct.map((t, i) => (
                  <tr key={t.product}>
                    <td>{i === 0 && t.product !== 'Bài content' ? '🏆 ' : ''}{t.product}</td>
                    <td className="num">{vnInt(t.count)}</td>
                    <td className="num"><b>{vnInt(t.avgScore)}</b></td>
                    <td className="num">{vnInt(t.avgEng)}</td>
                    <td className="num">{t.avgViews ? fmt(t.avgViews) : '—'}</td>
                    <td className="num">{t.conversions ? vnInt(t.conversions) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
