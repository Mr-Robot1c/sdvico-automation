import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { siteUrl, publicBlogUrl } from '../../lib/seo';
import { gscConfigured, type GscPage } from '../../lib/gsc';
import { cachedPublicPosts, cachedGscLatest } from '../../lib/cached';
import { loadSeoQueriesSummary } from '../../lib/seo-queries';
import { intentLabel } from '../labels';

// 3/10 (đợt 2 việc 3, kiểm UI: /seo chờ 7 truy vấn qua 2 vòng nối tiếp rồi mới hiện gì): trang chia 4 KHỐI
// độc lập, mỗi khối tự lấy dữ liệu trong <Suspense> của page.tsx. Một nguồn chậm/lỗi chỉ làm KHỐI đó báo
// riêng (kèm nút Thử lại), không giữ trắng cả trang. Truy vấn rẻ (đếm từ khóa, audit) chấp nhận lặp giữa khối;
// nguồn nặng (bài công khai, Search Console) đã qua unstable_cache nên gọi lại không tốn thêm.

export function fmtDT(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`;

// Quá hạn thì ném lỗi riêng để khối nói "đang chậm" thay vì treo.
const BLOCK_TIMEOUT_MS = 10000;
class SlowError extends Error {}
function withTimeout<T>(p: Promise<T>, ms = BLOCK_TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new SlowError('timeout')), ms))]);
}

function BlockError({ title, slow }: { title: string; slow: boolean }) {
  return (
    <section className="blk" role="alert">
      <h2>{title}</h2>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        {slow ? 'Nguồn dữ liệu của khối này đang chậm quá 10 giây.' : 'Chưa tải được dữ liệu của khối này.'} Các khối khác vẫn dùng bình thường.
      </p>
      <a className="btn ghost sm" href="/seo">Thử lại</a>
    </section>
  );
}

export function BlockLoading({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <section className="blk" aria-busy="true">
      <h2>{title}</h2>
      <div className="seo-skeleton" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => <span key={i} />)}
      </div>
      <p className="sub" style={{ margin: '6px 0 0', fontSize: '.8rem' }}>Đang tải…</p>
    </section>
  );
}

// ===== Khối 1: ô số + Bài SEO đã đăng =====
export async function SeoPostsBlock() {
  try {
    const client = getServerClient();
    const [posts, gscRaw, kwCount, auditRes] = await withTimeout(Promise.all([
      cachedPublicPosts(200),
      cachedGscLatest(),
      client.from('mkt_keywords').select('id', { count: 'exact', head: true }),
      client.from('run_log').select('status, created_at').eq('task', 'mkt.seo_audit').order('created_at', { ascending: false }).limit(1),
    ]));
    const gscOn = gscConfigured();
    const gsc = { byCid: new Map<string, GscPage>(gscRaw.entries as Array<[string, GscPage]>), site: gscRaw.site, at: gscRaw.at };
    const audit = ((auditRes.data || [])[0] as any) || null;
    const nKw = kwCount.count || 0;
    const sorted = [...posts].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    const latest = sorted.slice(0, 10);
    const lastPostAt = sorted[0]?.publishedAt || null;
    return (
      <>
        {/* 15/9 (Thanh): mọi ô bấm được -> danh sách đầy đủ. */}
        <div className="pl-tiles">
          <Link href="/seo/bai-viet" className="pl-tile" title="Xem tất cả bài công khai kèm số Google"><b>{fmt(posts.length)}</b><span>Bài SEO đã đăng →</span></Link>
          <Link href="/tu-khoa" className="pl-tile" title="Mở kho từ khóa"><b>{fmt(nKw)}</b><span>Từ khóa trong kho →</span></Link>
          <a href={sorted[0] ? publicBlogUrl(sorted[0].slug) : publicBlogUrl()} target="_blank" rel="noreferrer" className="pl-tile" title="Mở bài mới nhất"><b>{lastPostAt ? fmtDT(lastPostAt) : '—'}</b><span>Bài mới nhất ↗</span></a>
          <a href="#suc-khoe" className="pl-tile" title="Xem chi tiết audit">
            <b>{audit ? (audit.status === 'ok' ? '✅' : '⚠️') : '—'}</b>
            <span>Audit SEO {audit ? fmtDT(audit.created_at) : '(chưa chạy)'} ↓</span>
          </a>
          <Link href="/seo/bai-viet?sap=click" className="pl-tile" title="Số Google Search Console 28 ngày">
            <b>{gsc.site ? fmt(Number(gsc.site.clicks) || 0) : '—'}</b>
            <span>{gsc.site ? `Click Google · ${fmt(Number(gsc.site.impressions) || 0)} hiển thị` : gscOn ? 'Click Google (chờ kéo)' : 'Click Google (chưa nối)'}</span>
          </Link>
        </div>
        {!gscOn ? (
          <p className="sub" style={{ margin: '-6px 0 12px', fontSize: '.85rem' }}>
            🔗 Chưa nối Google Search Console: đặt <code>GOOGLE_SA_JSON</code> + <code>GSC_SITE_URL</code> trên Vercel theo <code>docs/runbook-search-console-setup.md</code>, số click/hiển thị sẽ tự về mỗi ngày.
          </p>
        ) : null}

        <section className="blk">
          <h2><span aria-hidden="true">📰</span> Bài SEO đã đăng <span className="sub">10 bài mới nhất · số Google 28 ngày{gsc.at ? ` (cập nhật ${fmtDT(gsc.at)})` : ''} · <Link href="/seo/bai-viet" className="src">xem cả {fmt(posts.length)} bài →</Link></span></h2>
          {latest.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>Chưa có bài công khai nào.</p>
          ) : (
            <div className="tablewrap table-scroll">
              <table className="datatable">
                <thead>
                  <tr>
                    <th>Tiêu đề</th>
                    <th style={{ width: 150 }}>Sản phẩm</th>
                    <th style={{ width: 110 }}>Ngày đăng</th>
                    <th className="num" style={{ width: 70 }}>Click</th>
                    <th className="num" style={{ width: 80 }}>Hiển thị</th>
                    <th className="num" style={{ width: 64 }}>CTR</th>
                    <th className="num" style={{ width: 64 }}>Vị trí</th>
                    <th style={{ width: 70 }}>Mở</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((p) => {
                    const g = gsc.byCid.get(p.contentId);
                    return (
                      <tr key={p.slug}>
                        <td className="cell-title"><b>{String(p.title).slice(0, 90)}</b></td>
                        {/* 30/8 (audit H2): 1 dòng có "…" + tooltip; trống hiện "—". */}
                        <td className="sub" style={{ fontSize: '.82rem', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(p.product || '')}>
                          {String(p.product || '—')}
                        </td>
                        <td className="sub" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{fmtDT(p.publishedAt || null)}</td>
                        <td className="num">{g ? fmt(g.clicks) : <span className="sub">—</span>}</td>
                        <td className="num">{g ? fmt(g.impressions) : <span className="sub">—</span>}</td>
                        <td className="num">{g ? pct(g.ctr) : <span className="sub">—</span>}</td>
                        <td className="num">{g ? g.position.toFixed(1).replace('.', ',') : <span className="sub">—</span>}</td>
                        <td><a className="src" href={publicBlogUrl(p.slug)} target="_blank" rel="noreferrer">↗ Mở</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  } catch (e) {
    return <BlockError title="Bài SEO đã đăng" slow={e instanceof SlowError} />;
  }
}

// ===== Khối 2: Từ khóa mới thêm =====
export async function SeoKeywordsBlock() {
  try {
    const client = getServerClient();
    const [posts, kwRes, kwContentRes] = await withTimeout(Promise.all([
      cachedPublicPosts(200),
      client.from('mkt_keywords').select('id, keyword, intent, source, created_at').order('created_at', { ascending: false }).limit(8),
      client.from('mkt_keywords').select('id', { count: 'exact', head: true }),
    ]));
    const keywords = (kwRes.data || []) as any[];
    // 18/9 (việc A, vòng kín SEO): số bài + bài gần nhất theo TỪNG từ khóa đang hiện — 1 truy vấn, gộp trong JS.
    const ids = keywords.map((k) => String(k.id));
    const { data: rows } = ids.length
      ? await withTimeout(Promise.resolve(client
        .from('mkt_content')
        .select('id, title, brief, created_at')
        .in('brief->>keyword_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500)))
      : { data: [] as any[] };
    const kwPostStats = new Map<string, { count: number; latestId: string; latestTitle: string }>();
    for (const r of (rows || []) as any[]) {
      const kid = String(r.brief?.keyword_id || '');
      if (!kid) continue;
      const cur = kwPostStats.get(kid);
      if (!cur) kwPostStats.set(kid, { count: 1, latestId: String(r.id), latestTitle: String(r.title || '') });
      else cur.count++;
    }
    const blogSlugByContentId = new Map(posts.map((p) => [p.contentId, p.slug]));
    const total = kwContentRes.count || 0;
    return (
      <section className="blk">
        <h2><span aria-hidden="true">🔑</span> Từ khóa mới thêm</h2>
        {keywords.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Kho từ khóa trống. Chạy seed keywords hoặc thêm tay ở trang Kho từ khóa.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            <div className="tablewrap table-scroll">
              <table className="datatable">
                <thead>
                  <tr>
                    <th>Từ khóa</th>
                    <th style={{ width: 90 }}>Ý định</th>
                    <th className="num" style={{ width: 60 }}>Số bài</th>
                    <th>Bài gần nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((k) => {
                    const stat = kwPostStats.get(String(k.id));
                    const slug = stat ? blogSlugByContentId.get(stat.latestId) : undefined;
                    return (
                      <tr key={k.id}>
                        <td className="cell-title" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(k.keyword)}</td>
                        <td><span className="badge tone-demo">{intentLabel(String(k.intent || 'thong_tin'))}</span></td>
                        <td className="num">{stat ? fmt(stat.count) : 0}</td>
                        <td className="sub" style={{ fontSize: '.85rem' }}>
                          {!stat ? '—' : slug ? (
                            <a className="src" href={publicBlogUrl(slug)} target="_blank" rel="noreferrer">{stat.latestTitle.slice(0, 46)} ↗</a>
                          ) : (
                            <Link className="src" href="/noi-dung">{stat.latestTitle.slice(0, 46)}</Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Link href="/tu-khoa" className="src" style={{ fontSize: '.85rem' }}>Xem cả kho {fmt(total)} từ khóa →</Link>
          </div>
        )}
      </section>
    );
  } catch (e) {
    return <BlockError title="Từ khóa mới thêm" slow={e instanceof SlowError} />;
  }
}

// ===== Khối 3: Sức khỏe SEO =====
export async function SeoHealthBlock() {
  try {
    const client = getServerClient();
    const { data } = await withTimeout(Promise.resolve(client
      .from('run_log')
      .select('task, status, detail, created_at')
      .eq('task', 'mkt.seo_audit')
      .order('created_at', { ascending: false })
      .limit(12)));
    // 1/9: audit chạy hằng tuần cho NHIỀU URL — lấy bản mới nhất của từng URL.
    const auditByUrl: Array<[string, any]> = [];
    for (const a of (data || []) as any[]) {
      const u = String(a.detail?.url || '');
      if (u && !auditByUrl.some(([x]) => x === u)) auditByUrl.push([u, a]);
    }
    const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
    const base = siteUrl();
    return (
      <section className="blk" id="suc-khoe">
        <h2><span aria-hidden="true">🩺</span> Sức khỏe SEO</h2>
        <div style={{ display: 'grid', gap: 8, fontSize: '.9rem' }}>
          <div className="need-item">
            <span>🗺️</span>
            <span style={{ flex: 1 }}>Sitemap và robots.txt tự sinh.</span>
            <a className="btn ghost sm" href={`${base}/sitemap.xml`} target="_blank" rel="noreferrer">Mở sitemap ↗</a>
          </div>
          {auditByUrl.length === 0 ? (
            <div className="need-item">
              <span>ℹ️</span>
              <span style={{ flex: 1 }}>Chưa có lần audit SEO nào được ghi. Lịch tự động: sáng thứ Hai hằng tuần.</span>
            </div>
          ) : (
            auditByUrl.map(([u, a]) => (
              <div className="need-item" key={u}>
                <span>{a.status === 'ok' ? '✅' : '⚠️'}</span>
                <span style={{ flex: 1 }}>
                  <b>{hostOf(u)}</b>, audit {fmtDT(a.created_at)}
                  {a.detail?.scores ? (
                    <span className="sub" style={{ display: 'block', fontSize: '.8rem' }}>
                      Chuẩn SEO {a.detail.scores.seo} · Tốc độ {a.detail.scores.performance} · Truy cập {a.detail.scores.accessibility} · Thực hành tốt {a.detail.scores['best-practices']}
                    </span>
                  ) : null}
                  {a.status !== 'ok' ? (
                    <span className="sub" style={{ display: 'block', fontSize: '.8rem' }}>{String(a.detail?.msg || 'có cảnh báo')}</span>
                  ) : null}
                </span>
              </div>
            ))
          )}
          <div className="need-item">
            <span>📊</span>
            <span style={{ flex: 1 }}>Pixel / GA4 đo chuyển đổi cấu hình ở trang <Link href="/quang-cao" className="src">Quảng cáo →</Link></span>
          </div>
        </div>
      </section>
    );
  } catch (e) {
    return <BlockError title="Sức khỏe SEO" slow={e instanceof SlowError} />;
  }
}

// ===== Khối 4: Từ khóa trên Google (việc B, 18/9) =====
export async function SeoGoogleQueriesBlock() {
  try {
    const client = getServerClient();
    const { data: kw } = await withTimeout(Promise.resolve(client.from('mkt_keywords').select('keyword').limit(500)));
    const keywords = ((kw || []) as any[]).map((k) => String(k.keyword || ''));
    // Bảng mkt_seo_queries có thể chưa có dữ liệu: loadSeoQueriesSummary tự nuốt lỗi (available:false).
    const [seoQueries, idxRes] = await withTimeout(Promise.all([
      loadSeoQueriesSummary(client, keywords),
      client.from('run_log').select('detail, created_at').eq('task', 'mkt.gsc_index_check').order('created_at', { ascending: false }).limit(1),
    ]));
    const idxRow = ((idxRes.data || [])[0]) as any;
    const idxIndexed = Number(idxRow?.detail?.indexed);
    const idxTotal = Number(idxRow?.detail?.total);
    const hasIdxCount = idxRow && Number.isFinite(idxIndexed) && Number.isFinite(idxTotal) && idxTotal > 0;
    return (
      <section className="blk">
        <h2><span aria-hidden="true">📈</span> Từ khóa trên Google (28 ngày)</h2>
        {!seoQueries.available ? (
          <p className="sub" style={{ margin: 0 }}>Chưa có số Google. Chờ anh Thành thêm quyền Search Console.</p>
        ) : (
          <>
            {hasIdxCount ? (
              <p className="sub" style={{ margin: '0 0 10px', fontSize: '.85rem' }}>
                🔎 {fmt(idxIndexed)}/{fmt(idxTotal)} bài đã được Google index (lần kiểm {fmtDT(idxRow.created_at)}).
              </p>
            ) : null}
            <div className="tablewrap table-scroll">
              <table className="datatable">
                <thead>
                  <tr>
                    <th>Từ khóa Google đã ghi nhận</th>
                    <th className="num" style={{ width: 70 }}>Click</th>
                    <th className="num" style={{ width: 80 }}>Hiển thị</th>
                    <th className="num" style={{ width: 64 }}>Vị trí</th>
                    <th className="num" style={{ width: 64 }}>Điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {seoQueries.top.map((r, i) => (
                    <tr key={`${r.query}-${i}`}>
                      <td className="cell-title">{r.query || <span className="sub">(không rõ)</span>}</td>
                      <td className="num">{fmt(r.clicks)}</td>
                      <td className="num">{fmt(r.impressions)}</td>
                      <td className="num">{r.position ? r.position.toFixed(1).replace('.', ',') : '—'}</td>
                      <td className="num">{fmt(Math.round(r.score))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {seoQueries.missingFromKeywords.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ fontSize: '.92rem', margin: '0 0 8px' }}>Google đã thấy nhưng kho chưa có bài</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                  {seoQueries.missingFromKeywords.map((r, i) => (
                    <div key={`${r.query}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: '.88rem' }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.query}</span>
                      <span className="sub" style={{ flexShrink: 0, fontSize: '.8rem' }}>{fmt(r.impressions)} hiển thị</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    );
  } catch (e) {
    return <BlockError title="Từ khóa trên Google (28 ngày)" slow={e instanceof SlowError} />;
  }
}
