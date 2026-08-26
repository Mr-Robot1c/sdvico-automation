import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { refreshFacebookMetrics, importManualFacebookPost } from '../actions';
import MetricsAuto from './metrics-auto';
import RefreshButton from './refresh-button';
import PlatformLogo, { type PlatformKey } from '../noi-dung/platform-logo';
// @ts-ignore — module JS thuần
import { isOtherPage } from '../../lib/page-origin.mjs';

// TRANG /do-luong — "Đo lường NGÀY" (user 26/8: tách Đo lường thành 2 trang).
// Trang này chỉ số liệu HÔM NAY VN, 4 bảng riêng theo nguồn:
//   1. Facebook (page test)
//   2. Facebook Page chính thức (import manual)
//   3. TikTok
//   4. YouTube Shorts
// Báo cáo tuần vẫn ở trang riêng /do-luong/tuan.
export const dynamic = 'force-dynamic';

type M = { reactions?: number; comments?: number; shares?: number; engagement?: number; views?: number; watchSec?: number; reach?: number; videoId?: string; shareUrl?: string };

function fmtDT(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
function todayIsoVN(): string {
  return new Date(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) + 'T00:00:00+07:00').toISOString();
}
function fmt(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('vi-VN');
}

export default async function Page() {
  const client = getServerClient();
  const dayStart = todayIsoVN();

  // Bài đăng HÔM NAY VN (tất cả kênh).
  const { data: postsToday } = await client
    .from('mkt_posts')
    .select('content_id, channel, external_url, published_at')
    .eq('status', 'published')
    .gte('published_at', dayStart)
    .order('published_at', { ascending: false })
    .limit(200);
  const posts = (postsToday || []) as any[];

  // Gom content_id để lấy tên bài + brief.
  const cids = [...new Set(posts.map((p) => p.content_id).filter(Boolean))] as string[];
  const contentsMap = new Map<string, { title: string; brief: any }>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief').in('id', cids);
    for (const c of cs || []) contentsMap.set((c as any).id, { title: (c as any).title || '(không tên)', brief: (c as any).brief || {} });
  }

  // Số liệu mới nhất mỗi content_id, tách theo source.
  const { data: metricsRows } = await client
    .from('mkt_metrics')
    .select('entity_ref, source, metrics, created_at')
    .in('entity_ref', cids.length ? cids : ['__none__'])
    .order('created_at', { ascending: false })
    .limit(600);
  const latestFB = new Map<string, M>();
  const latestTT = new Map<string, M>();
  const latestYT = new Map<string, M>();
  for (const r of (metricsRows || []) as any[]) {
    const cid = r.entity_ref;
    const src = r.source;
    if (src === 'facebook' && !latestFB.has(cid)) latestFB.set(cid, r.metrics || {});
    if (src === 'tiktok' && !latestTT.has(cid)) latestTT.set(cid, r.metrics || {});
    if (src === 'youtube' && !latestYT.has(cid)) latestYT.set(cid, r.metrics || {});
  }

  // Chia bài Facebook: page test vs page chính thức. Dùng lib/page-origin.mjs để nhận diện.
  type Row = { cid: string; title: string; url: string; publishedAt: string; m: M };
  const fbTestRows: Row[] = [];
  const fbRealRows: Row[] = [];
  const ttRows: Row[] = [];
  const ytRows: Row[] = [];
  for (const p of posts) {
    const cid = p.content_id as string | null;
    if (!cid) continue;
    const c = contentsMap.get(cid);
    const title = c?.title || '(không tên)';
    const url = String(p.external_url || '');
    const publishedAt = String(p.published_at || '');
    if (p.channel === 'facebook') {
      const m = latestFB.get(cid) || {};
      const isReal = !!(isOtherPage as (u: string, b: any) => boolean)(url, c?.brief || {});
      (isReal ? fbRealRows : fbTestRows).push({ cid, title, url, publishedAt, m });
    } else if (p.channel === 'tiktok') {
      const m = latestTT.get(cid) || {};
      ttRows.push({ cid, title, url, publishedAt, m });
    } else if (p.channel === 'youtube') {
      const m = latestYT.get(cid) || {};
      ytRows.push({ cid, title, url, publishedAt, m });
    }
  }

  // Lần nhập tay gần nhất (giữ khối import manual như trang cũ).
  const { data: impRows } = await client
    .from('run_log').select('status, detail, created_at').eq('task', 'mkt.import_manual_post')
    .order('created_at', { ascending: false }).limit(1);
  const impRow = (impRows || [])[0] as any;
  const lastImport = impRow ? { status: String(impRow.status), msg: String(impRow.detail?.msg || ''), link: String(impRow.detail?.link || '') } : null;

  const empty = posts.length === 0;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đo lường ngày</h1>
          <p className="sub">Số liệu bài đã đăng HÔM NAY (giờ Việt Nam). Xem tổng hợp cả tuần ở <Link className="src" href="/do-luong/tuan">📅 Báo cáo tuần</Link>.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/do-luong/tuan" className="btn ghost">📅 Đo lường tuần</Link>
          <MetricsAuto action={refreshFacebookMetrics} minutes={30} />
          <RefreshButton action={refreshFacebookMetrics} />
        </div>
      </header>

      <section className="import-manual" style={{ marginBottom: 18 }}>
        <form action={importManualFacebookPost} className="import-manual-form">
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <b>➕ Thêm bài đăng tay trên Page chính thức</b>
            <p className="sub" style={{ margin: '2px 0 6px' }}>
              Dán link bài đã đăng tay trên Page (bài viết, ảnh, video, reel). Hệ thống kiểm bài, lưu lại và kéo số liệu ngay; cron 30 phút cập nhật tiếp. Bài Page chính thức cần <code>FACEBOOK_REAL_PAGE_ACCESS_TOKEN</code> có <code>read_insights</code>.
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

      {empty ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📊</div>
          <p>Hôm nay chưa có bài nào đăng.</p>
          <p className="sub">Xem báo cáo <Link href="/do-luong/tuan">tuần này</Link> để có bức tranh tổng.</p>
        </div>
      ) : (
        <>
          <BangSoLieu
            title={<><PlatformLogo platform="facebook" size={20} /><span>Facebook — page hệ thống</span></>}
            headers={['Bài', 'React', 'Comment', 'Share', 'Lượt xem', 'Người xem', 'Link']}
            rows={fbTestRows}
            renderMetrics={(m) => [fmt(m.reactions), fmt(m.comments), fmt(m.shares), m.views != null ? fmt(m.views) : '—', m.reach != null ? fmt(m.reach) : '—']}
          />

          <BangSoLieu
            title={<><PlatformLogo platform="facebook" size={20} /><span>Facebook — Page chính thức</span></>}
            titleNote="Bài nhập tay từ page thật của SDVICO"
            headers={['Bài', 'React', 'Comment', 'Share', 'Lượt xem', 'Người xem', 'Link']}
            rows={fbRealRows}
            renderMetrics={(m) => [fmt(m.reactions), fmt(m.comments), fmt(m.shares), m.views != null ? fmt(m.views) : '—', m.reach != null ? fmt(m.reach) : '—']}
          />

          <BangSoLieu
            title={<><PlatformLogo platform="tiktok" size={20} /><span>TikTok</span></>}
            headers={['Bài', 'Lượt xem', 'Like', 'Comment', 'Share', 'Link']}
            rows={ttRows}
            renderMetrics={(m) => [fmt(m.views), fmt(m.reactions), fmt(m.comments), fmt(m.shares)]}
            customUrl={(r) => r.m.shareUrl || r.url}
          />

          <BangSoLieu
            title={<><PlatformLogo platform="youtube" size={20} /><span>YouTube Shorts</span></>}
            headers={['Bài', 'Lượt xem', 'Like', 'Comment', 'Link']}
            rows={ytRows}
            renderMetrics={(m) => [fmt(m.views), fmt(m.reactions), fmt(m.comments)]}
            customUrl={(r) => r.m.videoId ? `https://youtube.com/shorts/${r.m.videoId}` : r.url}
          />
        </>
      )}
    </main>
  );
}

function BangSoLieu({
  title,
  titleNote,
  headers,
  rows,
  renderMetrics,
  customUrl,
}: {
  title: React.ReactNode;
  titleNote?: string;
  headers: string[];
  rows: Array<{ cid: string; title: string; url: string; publishedAt: string; m: M }>;
  renderMetrics: (m: M) => (string | number | React.ReactNode)[];
  customUrl?: (r: { cid: string; title: string; url: string; publishedAt: string; m: M }) => string;
}) {
  if (rows.length === 0) return null;
  const fmtDT2 = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
    }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value || '';
    return `${g('hour')}:${g('minute')}`;
  };
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: '1.02rem', margin: '0 0 4px', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {title}
        <span className="sub" style={{ fontSize: '.85rem', fontWeight: 400 }}>({rows.length} bài hôm nay)</span>
      </h2>
      {titleNote ? <p className="sub" style={{ margin: '0 0 8px' }}>{titleNote}</p> : null}
      <div className="tablewrap">
        <table className="datatable">
          <thead>
            <tr>{headers.map((h, i) => <th key={i} className={i > 0 && i < headers.length - 1 ? 'num' : ''}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const url = customUrl ? customUrl(r) : r.url;
              const metricCells = renderMetrics(r.m);
              return (
                <tr key={r.cid}>
                  <td className="cell-title">
                    <b>{r.title}</b>
                    <div className="sub" style={{ fontSize: '.78rem' }}>Đăng {fmtDT2(r.publishedAt)}</div>
                  </td>
                  {metricCells.map((cell, i) => <td key={i} className="num">{cell}</td>)}
                  <td>{url ? <a className="src" href={url} target="_blank" rel="noreferrer">↗ Mở</a> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
