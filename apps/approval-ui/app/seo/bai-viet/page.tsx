import Link from 'next/link';
import { getServerClient } from '../../../lib/supabase-server';
import { loadPublicPosts, publicBlogUrl } from '../../../lib/seo';
import { loadGscLatest, gscConfigured } from '../../../lib/gsc';

// 15/9 (Thanh: "bấm vào 48 bài SEO đã đăng thì thể hiện hết tất cả các bài"): trang liệt kê ĐỦ bài
// công khai kèm số Google Search Console (click, hiển thị, CTR, vị trí 28 ngày) nếu đã nối.
export const dynamic = 'force-dynamic';

function fmtDT(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`;

export default async function Page({ searchParams }: { searchParams?: { sap?: string; q?: string } }) {
  const client = getServerClient();
  const q = String(searchParams?.q || '').trim().toLowerCase();
  const sap = String(searchParams?.sap || 'moi');
  const [posts, gsc] = await Promise.all([loadPublicPosts(client, 500), loadGscLatest(client)]);
  let rows = posts.map((p) => ({ p, g: gsc.byCid.get(p.contentId) || null }));
  if (q) rows = rows.filter(({ p }) => String(p.title || '').toLowerCase().includes(q) || String(p.product || '').toLowerCase().includes(q));
  const key = (r: any) => r.g ? r.g : { clicks: 0, impressions: 0, position: 999 };
  if (sap === 'click') rows.sort((a, b) => key(b).clicks - key(a).clicks);
  else if (sap === 'hien-thi') rows.sort((a, b) => key(b).impressions - key(a).impressions);
  else if (sap === 'vi-tri') rows.sort((a, b) => key(a).position - key(b).position);
  else rows.sort((a, b) => String(b.p.publishedAt || '').localeCompare(String(a.p.publishedAt || '')));
  const tot = rows.reduce((s, r) => ({ clicks: s.clicks + (r.g?.clicks || 0), imp: s.imp + (r.g?.impressions || 0) }), { clicks: 0, imp: 0 });
  const withGsc = rows.filter((r) => r.g).length;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Bài SEO đã đăng</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            {fmt(rows.length)} bài công khai · {gscConfigured() ? (gsc.at ? <>Search Console 28 ngày (cập nhật {fmtDT(gsc.at)}): <b>{fmt(tot.clicks)}</b> click · <b>{fmt(tot.imp)}</b> hiển thị · {fmt(withGsc)} bài có số</> : 'Search Console đã cấu hình, chờ lượt kéo đầu tiên (mỗi ngày sau 6h).') : <>Chưa nối Search Console — xem <code>docs/runbook-search-console-setup.md</code>.</>}
          </p>
        </div>
        <form method="get" style={{ display: 'flex', gap: 6 }}>
          <input type="hidden" name="sap" value={sap} />
          <input className="search" type="search" name="q" defaultValue={q} placeholder="Tìm tiêu đề / sản phẩm" aria-label="Tìm bài" style={{ maxWidth: 220 }} />
          <button className="btn ghost sm" type="submit">Tìm</button>
        </form>
      </header>
      <nav className="filters" style={{ margin: '0 0 12px' }} aria-label="Sắp xếp">
        {[['moi', 'Mới nhất'], ['click', 'Nhiều click'], ['hien-thi', 'Nhiều hiển thị'], ['vi-tri', 'Vị trí tốt']].map(([k, l]) => (
          <Link key={k} href={`/seo/bai-viet?sap=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`chip ${sap === k ? 'on' : ''}`}>{l}</Link>
        ))}
      </nav>
      <div className="tablewrap">
        <table className="datatable">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Tiêu đề</th>
              <th style={{ width: 160 }}>Sản phẩm</th>
              <th style={{ width: 110 }}>Ngày đăng</th>
              <th className="num" style={{ width: 80 }}>Click</th>
              <th className="num" style={{ width: 90 }}>Hiển thị</th>
              <th className="num" style={{ width: 70 }}>CTR</th>
              <th className="num" style={{ width: 70 }}>Vị trí</th>
              <th style={{ width: 70 }}>Mở</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, g }, i) => (
              <tr key={p.slug}>
                <td className="sub">{i + 1}</td>
                <td className="cell-title"><b>{String(p.title).slice(0, 90)}</b></td>
                <td className="sub" style={{ fontSize: '.82rem', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(p.product || '')}>{String(p.product || '—')}</td>
                <td className="sub" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{fmtDT(p.publishedAt || null)}</td>
                <td className="num">{g ? fmt(g.clicks) : <span className="sub">—</span>}</td>
                <td className="num">{g ? fmt(g.impressions) : <span className="sub">—</span>}</td>
                <td className="num">{g ? pct(g.ctr) : <span className="sub">—</span>}</td>
                <td className="num">{g ? g.position.toFixed(1).replace('.', ',') : <span className="sub">—</span>}</td>
                <td><a className="src" href={publicBlogUrl(p.slug)} target="_blank" rel="noreferrer">↗ Mở</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gscConfigured() ? <p className="sub" style={{ marginTop: 10 }}>Số Search Console tính 28 ngày gần nhất, Google trễ 2 ngày; "—" là bài chưa có lượt hiển thị nào trên Google.</p> : null}
    </main>
  );
}
