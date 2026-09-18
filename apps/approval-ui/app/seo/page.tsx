import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { siteUrl, publicBlogUrl } from '../../lib/seo';
import { gscConfigured, type GscPage } from '../../lib/gsc';
import { cachedPublicPosts, cachedGscLatest } from '../../lib/cached';

// 27/8 REDESIGN (docx "redesign web" cua sep) — trang SEO: bai da dang len web cong khai
// (/blog), kho tu khoa, va suc khoe SEO (sitemap, audit gan nhat). Y chang layout SEO cua
// ForLife Ops nhung dung du lieu SDVICO.
export const dynamic = 'force-dynamic';

function fmtDT(iso: string | null): string {
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

export default async function Page() {
  const client = getServerClient();

  // 16/9 (Thanh: web chậm là ưu tiên nhất): 2 nguồn nặng (bài công khai + snapshot Search
  // Console 1.500 dòng) đi qua cache 5/10 phút — lib/cached.ts.
  const [posts, gscRaw, kwRes, auditRes, kwContentRes] = await Promise.all([
    cachedPublicPosts(200),
    // 15/9: số Google Search Console (click / hiển thị / CTR / vị trí 28 ngày) cho từng bài.
    cachedGscLatest(),
    client
      .from('mkt_keywords')
      .select('id, keyword, intent, source, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    client
      .from('run_log')
      .select('task, status, detail, created_at')
      .eq('task', 'mkt.seo_audit')
      .order('created_at', { ascending: false })
      .limit(12),
    // 18/9 (việc A, vòng kín SEO): số bài + bài gần nhất theo TỪNG từ khóa — 1 truy vấn duy
    // nhất, gộp đếm trong JS (KHÔNG lặp truy vấn cho từng từ khóa trong danh sách).
    client
      .from('mkt_content')
      .select('id, title, brief, created_at')
      .not('brief->>keyword_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3000),
  ]);
  const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
  const gscOn = gscConfigured();
  const gsc = { byCid: new Map<string, GscPage>(gscRaw.entries as Array<[string, GscPage]>), site: gscRaw.site, at: gscRaw.at };

  const keywords = (kwRes.data || []) as any[];
  const auditRows = (auditRes.data || []) as any[];
  // Đếm bài theo keyword_id (hàng đã sắp created_at giảm dần -> lần gặp ĐẦU TIÊN của mỗi
  // keyword_id chính là bài gần nhất).
  const kwPostStats = new Map<string, { count: number; latestId: string; latestTitle: string }>();
  for (const r of (kwContentRes.data || []) as any[]) {
    const kid = String(r.brief?.keyword_id || '');
    if (!kid) continue;
    const cur = kwPostStats.get(kid);
    if (!cur) kwPostStats.set(kid, { count: 1, latestId: String(r.id), latestTitle: String(r.title || '') });
    else cur.count++;
  }
  const blogSlugByContentId = new Map(posts.map((p) => [p.contentId, p.slug]));
  const audit = auditRows[0] || null;
  // 1/9: audit chạy hằng tuần cho NHIỀU URL (sdvico.vn + trang bài viết) — lấy bản mới nhất
  // của từng URL cho khối Sức khỏe SEO.
  const auditByUrl: Array<[string, any]> = [];
  for (const a of auditRows) {
    const u = String(a.detail?.url || '');
    if (u && !auditByUrl.some(([x]) => x === u)) auditByUrl.push([u, a]);
  }
  const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
  const base = siteUrl();
  const sorted = [...posts].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  const latest = sorted.slice(0, 10);
  const lastPostAt = sorted[0]?.publishedAt || null;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>SEO</h1>
          <p className="sub">Bài viết công khai trên web (Google đọc được), kho từ khóa và sức khỏe SEO. Bài blog sinh từ dây chuyền nội dung.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`${base}/blog`} target="_blank" rel="noreferrer" className="btn ghost">🌐 Mở trang Bài viết ↗</a>
          <Link href="/tu-khoa" className="btn ghost">🔑 Kho từ khóa</Link>
          <Link href="/quang-cao" className="btn ghost">📣 Quảng cáo / đo lường</Link>
        </div>
      </header>

      {/* ===== TILE ===== */}
      {/* 15/9 (Thanh): mọi ô bấm được -> danh sách đầy đủ. */}
      <div className="pl-tiles">
        <Link href="/seo/bai-viet" className="pl-tile" title="Xem tất cả bài công khai kèm số Google"><b>{fmt(posts.length)}</b><span>Bài SEO đã đăng →</span></Link>
        <Link href="/tu-khoa" className="pl-tile" title="Mở kho từ khóa"><b>{fmt(keywords.length)}</b><span>Từ khóa trong kho →</span></Link>
        <a href={sorted[0] ? publicBlogUrl(sorted[0].slug) : `${base}/blog`} target="_blank" rel="noreferrer" className="pl-tile" title="Mở bài mới nhất"><b>{lastPostAt ? fmtDT(lastPostAt) : '—'}</b><span>Bài mới nhất ↗</span></a>
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

      {/* ===== BAI SEO DA DANG ===== */}
      <section className="blk">
        <h2><span aria-hidden="true">📰</span> Bài SEO đã đăng <span className="sub">10 bài mới nhất · số Google 28 ngày{gsc.at ? ` (cập nhật ${fmtDT(gsc.at)})` : ''} · <Link href="/seo/bai-viet" className="src">xem cả {fmt(posts.length)} bài →</Link></span></h2>
        {latest.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Chưa có bài công khai nào.</p>
        ) : (
          <div className="tablewrap">
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
                {latest.map((p) => (
                  <tr key={p.slug}>
                    <td className="cell-title"><b>{String(p.title).slice(0, 90)}</b></td>
                    {/* 30/8 (audit H2): 1 dòng có "…" + tooltip; trống hiện "—". */}
                    <td className="sub" style={{ fontSize: '.82rem', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(p.product || '')}>
                      {String(p.product || '—')}
                    </td>
                    <td className="sub" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{fmtDT(p.publishedAt || null)}</td>
                    {(() => { const g = gsc.byCid.get(p.contentId); return (<>
                      <td className="num">{g ? fmt(g.clicks) : <span className="sub">—</span>}</td>
                      <td className="num">{g ? fmt(g.impressions) : <span className="sub">—</span>}</td>
                      <td className="num">{g ? pct(g.ctr) : <span className="sub">—</span>}</td>
                      <td className="num">{g ? g.position.toFixed(1).replace('.', ',') : <span className="sub">—</span>}</td>
                    </>); })()}
                    <td><a className="src" href={publicBlogUrl(p.slug)} target="_blank" rel="noreferrer">↗ Mở</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== TU KHOA + SUC KHOE ===== */}
      <div className="blk-cols">
        <section className="blk">
          <h2><span aria-hidden="true">🔑</span> Từ khóa mới thêm</h2>
          {keywords.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>Kho từ khóa trống. Chạy seed keywords hoặc thêm tay ở trang Kho từ khóa.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="tablewrap">
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
                    {keywords.slice(0, 8).map((k) => {
                      const stat = kwPostStats.get(String(k.id));
                      const slug = stat ? blogSlugByContentId.get(stat.latestId) : undefined;
                      return (
                        <tr key={k.id}>
                          <td className="cell-title" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(k.keyword)}</td>
                          <td><span className="badge tone-demo">{String(k.intent || 'thông tin')}</span></td>
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
              <Link href="/tu-khoa" className="src" style={{ fontSize: '.85rem' }}>Xem cả kho {fmt(keywords.length)} từ khóa →</Link>
            </div>
          )}
        </section>

        <section className="blk" id="suc-khoe">
          <h2><span aria-hidden="true">🩺</span> Sức khỏe SEO</h2>
          <div style={{ display: 'grid', gap: 8, fontSize: '.9rem' }}>
            <div className="need-item">
              <span>🗺️</span>
              <span style={{ flex: 1 }}>Sitemap + robots.txt tự sinh — <a className="src" href={`${base}/sitemap.xml`} target="_blank" rel="noreferrer">mở sitemap ↗</a></span>
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
                    <b>{hostOf(u)}</b> — audit {fmtDT(a.created_at)}
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
      </div>
    </main>
  );
}
