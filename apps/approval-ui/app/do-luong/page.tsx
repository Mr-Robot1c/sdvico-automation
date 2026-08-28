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

  // Bài đăng HÔM NAY VN (tất cả kênh) - dùng cho phần Facebook.
  const { data: postsToday } = await client
    .from('mkt_posts')
    .select('content_id, channel, external_url, published_at')
    .eq('status', 'published')
    .gte('published_at', dayStart)
    .order('published_at', { ascending: false })
    .limit(200);
  const posts = (postsToday || []) as any[];

  // 27/8: TikTok RIÊNG BIỆT - user link tay video profile qua brief.tiktok_video_id
  // (không tạo mkt_posts). Query mkt_metrics source='tiktok' created_at HÔM NAY:
  // bài nào có snapshot mới hôm nay là bài "đang chạy", hiện lên bảng.
  const { data: ttToday } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'tiktok')
    .gte('created_at', dayStart)
    .order('created_at', { ascending: false })
    .limit(200);
  const ttLatest = new Map<string, { m: M; ts: string }>();
  for (const r of (ttToday || []) as any[]) {
    const cid = r.entity_ref;
    if (cid && !ttLatest.has(cid)) ttLatest.set(cid, { m: r.metrics || {}, ts: r.created_at });
  }

  // YouTube: dùng mkt_posts published_at HÔM NAY như Facebook (bài đăng qua system hôm nay).
  // Cron pull YT 30p/lần cho tất cả bài -> nếu lấy theo snapshot sẽ hiện HẾT bài đã đăng.
  const ytPostsToday = posts.filter((p) => p.channel === 'youtube');
  const ytCids = [...new Set(ytPostsToday.map((p) => p.content_id).filter(Boolean))] as string[];
  const latestYT = new Map<string, M>();
  if (ytCids.length) {
    const { data: ytMetricsRows } = await client
      .from('mkt_metrics')
      .select('entity_ref, metrics, created_at')
      .eq('source', 'youtube')
      .in('entity_ref', ytCids)
      .order('created_at', { ascending: false })
      .limit(400);
    for (const r of (ytMetricsRows || []) as any[]) {
      const cid = r.entity_ref;
      if (!latestYT.has(cid)) latestYT.set(cid, r.metrics || {});
    }
  }

  // Gom content_id để lấy tên bài + brief (bài đăng hôm nay + snapshot TikTok link tay).
  const cids = [...new Set([
    ...posts.map((p) => p.content_id).filter(Boolean),
    ...ttLatest.keys(),
  ])] as string[];
  // 28/8: bài đã vào Thùng rác (deleted_at) KHÔNG hiện ở bảng nào — trước đây quên lọc nên
  // bài user vừa xoá vẫn nằm nguyên trong bảng FB (user: "vẫn chưa xoá bài của page test hả").
  const contentsMap = new Map<string, { title: string; brief: any }>();
  const deletedCids = new Set<string>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief, deleted_at').in('id', cids);
    for (const c of cs || []) {
      if ((c as any).deleted_at) { deletedCids.add((c as any).id); continue; }
      contentsMap.set((c as any).id, { title: (c as any).title || '(không tên)', brief: (c as any).brief || {} });
    }
  }

  // Số liệu Facebook mới nhất mỗi content_id (không giới hạn hôm nay - cần latest để so).
  const fbCids = [...new Set(posts.map((p) => p.content_id).filter((c) => c) as string[])];
  const latestFB = new Map<string, M>();
  if (fbCids.length) {
    const { data: fbMetricsRows } = await client
      .from('mkt_metrics')
      .select('entity_ref, metrics, created_at')
      .eq('source', 'facebook')
      .in('entity_ref', fbCids)
      .order('created_at', { ascending: false })
      .limit(400);
    for (const r of (fbMetricsRows || []) as any[]) {
      const cid = r.entity_ref;
      if (!latestFB.has(cid)) latestFB.set(cid, r.metrics || {});
    }
  }

  // 28/8 (user: "lay so lieu tu KENH CHINH thoi - tat kenh phu"): MOT bang Facebook duy nhat.
  // Bai thuoc kenh chinh = co brief.fb_real_url (ghep tay) HOAC von cua page chinh (import).
  // Bai chi co ban page phu van liet ke nhung danh dau "chua ghep link kenh chinh" — khong do.
  type Row = { cid: string; title: string; url: string; publishedAt: string; m: M; timeLabel?: string; noMetric?: boolean };
  const fbRows: Row[] = [];
  const ttRows: Row[] = [];
  const ytRows: Row[] = [];
  for (const p of posts) {
    const cid = p.content_id as string | null;
    if (!cid || deletedCids.has(cid)) continue;
    const c = contentsMap.get(cid);
    const title = c?.title || '(không tên)';
    const url = String(p.external_url || '');
    const publishedAt = String(p.published_at || '');
    if (p.channel === 'facebook') {
      const brief = (c?.brief || {}) as any;
      const realUrl = String(brief.fb_real_url || '');
      const isReal = !!realUrl || !!(isOtherPage as (u: string, b: any) => boolean)(url, brief);
      // 28/8 lần 2 (user thấy bài page test trong bảng kênh chính): bài CHỈ có bản page phụ
      // KHÔNG liệt kê ở đây nữa — bảng kênh chính chỉ chứa bài kênh chính. Ghép link ở /noi-dung.
      if (!isReal) continue;
      const m = latestFB.get(cid) || {};
      fbRows.push({ cid, title, url: realUrl || url, publishedAt, m });
    } else if (p.channel === 'youtube') {
      const m = latestYT.get(cid) || {};
      ytRows.push({ cid, title, url, publishedAt, m });
    }
    // TikTok không lấy từ mkt_posts (user thường link tay), dùng snapshot mkt_metrics ở dưới.
  }
  for (const [cid, { m, ts }] of ttLatest) {
    if (deletedCids.has(cid)) continue;
    const c = contentsMap.get(cid);
    // 28/8 (user: video đăng HÔM QUA hiện giờ y chang video hôm nay): snapshot giờ có
    // createTime (giờ đăng thật từ TikTok API). Có createTime -> hiện giờ đăng thật, và video
    // đăng trước hôm nay thì bỏ khỏi bảng NGÀY (đã có ở báo cáo tuần). Snapshot cũ chưa có
    // createTime -> giữ nguyên kiểu cũ (nhãn "Số" = giờ chốt số liệu).
    const ct = Number((m as any).createTime || 0);
    const postedIso = ct > 0 ? new Date(ct * 1000).toISOString() : '';
    if (postedIso && postedIso < dayStart) continue;
    ttRows.push({
      cid,
      title: c?.title || '(không tên)',
      url: (m as any).shareUrl || '',
      publishedAt: postedIso || ts,
      m,
      timeLabel: postedIso ? undefined : 'Số',
    });
  }

  // Lần nhập tay gần nhất (giữ khối import manual như trang cũ).
  const { data: impRows } = await client
    .from('run_log').select('status, detail, created_at').eq('task', 'mkt.import_manual_post')
    .order('created_at', { ascending: false }).limit(1);
  const impRow = (impRows || [])[0] as any;
  const lastImport = impRow ? { status: String(impRow.status), msg: String(impRow.detail?.msg || ''), link: String(impRow.detail?.link || '') } : null;

  const empty = posts.length === 0 && ttLatest.size === 0;

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
          {/* 28/8 (user): TAT kenh phu — 1 bang Facebook KENH CHINH SDVICO VN duy nhat. Bai
              chi co ban page phu KHONG liet ke (user: bang kenh chinh khong duoc dinh bai
              page test); muon do thi bam Ghep FB chinh o /noi-dung. */}
          <BangSoLieu
            title={<><PlatformLogo platform="facebook" size={20} /><span>Facebook — SDVICO VN (kênh chính)</span></>}
            titleNote="Chỉ hiện và đo bài trên Page chính. Bài máy đăng ở kênh phụ không nằm ở đây — bấm Ghép FB chính ở Duyệt bài (dán link bài đã đăng tay) thì bài mới vào bảng."
            headers={['Bài', 'React', 'Comment', 'Share', 'Lượt xem', 'Người xem', 'Link']}
            rows={fbRows}
            renderMetrics={(m) => [fmt(m.reactions), fmt(m.comments), fmt(m.shares), m.views != null ? fmt(m.views) : '—', m.reach != null ? fmt(m.reach) : '—']}
            channelLabel="Kênh chính · SDVICO VN"
          />

          <BangSoLieu
            title={<><PlatformLogo platform="tiktok" size={20} /><span>TikTok</span></>}
            headers={['Bài', 'Lượt xem', 'Like', 'Comment', 'Share', 'Link']}
            rows={ttRows}
            renderMetrics={(m) => [fmt(m.views), fmt(m.reactions), fmt(m.comments), fmt(m.shares)]}
            customUrl={(r) => r.m.shareUrl || r.url}
            channelLabel="@sdvico_tbtc"
          />

          <BangSoLieu
            title={<><PlatformLogo platform="youtube" size={20} /><span>YouTube Shorts</span></>}
            headers={['Bài', 'Lượt xem', 'Like', 'Comment', 'Link']}
            rows={ytRows}
            renderMetrics={(m) => [fmt(m.views), fmt(m.reactions), fmt(m.comments)]}
            customUrl={(r) => r.m.videoId ? `https://youtube.com/shorts/${r.m.videoId}` : r.url}
            channelLabel="Kênh SDVICO - Thiết bị tàu cá"
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
  channelLabel,
  rowNote,
}: {
  title: React.ReactNode;
  titleNote?: string;
  headers: string[];
  rows: Array<{ cid: string; title: string; url: string; publishedAt: string; m: M; timeLabel?: string; noMetric?: boolean }>;
  renderMetrics: (m: M, r?: { noMetric?: boolean }) => (string | number | React.ReactNode)[];
  customUrl?: (r: { cid: string; title: string; url: string; publishedAt: string; m: M }) => string;
  // 28/8 (user): ke gio dang them NGAY DANG + KENH DANG cu the (FB chinh "SDVICO VN",
  // phu "SDVICO TBTC"...) — dong sub thanh "Đăng 09:27 · 28/08 · SDVICO TBTC".
  channelLabel?: string;
  // Ghi chu rieng tung dong (28/8: bai FB chua ghep link kenh chinh -> "khong do").
  rowNote?: (r: { noMetric?: boolean }) => string | null;
}) {
  if (rows.length === 0) return null;
  const fmtDT2 = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
    }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value || '';
    return `${g('hour')}:${g('minute')} · ${g('day')}/${g('month')}`;
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
              const metricCells = renderMetrics(r.m, r);
              const note = rowNote ? rowNote(r) : null;
              return (
                <tr key={r.cid}>
                  <td className="cell-title">
                    <b>{r.title}</b>
                    <div className="sub" style={{ fontSize: '.78rem' }}>
                      {r.timeLabel || 'Đăng'} {fmtDT2(r.publishedAt)}
                      {channelLabel ? <> · <b>{channelLabel}</b></> : null}
                    </div>
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
