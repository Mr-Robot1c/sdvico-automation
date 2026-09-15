import Link from 'next/link';
import BarChart from '../bar-chart';
import PlatformLogo from '../../noi-dung/platform-logo';

// 15/9 (sếp): "báo cáo tuần không còn là báo cáo chung nữa mà là dashboard riêng cho từng kênh, thể hiện tất cả
// bài viết trong tuần đó, view thế nào, chất lượng ra sao". Khối này nhận danh sách bài của 1 kênh trong tuần
// (đã lọc kênh chính / kênh TikTok hiện tại) và dựng: KPI, biểu đồ lượt xem + tương tác từng bài, bảng có cột
// Chất lượng (điểm = tương tác + 0,1 lượt xem + 0,02 giây xem + 0,05 người thấy; Tốt/Khá/Yếu = 1/3 trên, giữa, dưới của tuần).

export type ChannelRow = {
  cid: string; channel: 'facebook' | 'tiktok' | 'youtube'; publishedAt: string; url: string; title: string; product: string;
  reactions: number; comments: number; shares: number; views: number; engagement: number; shareUrl?: string | null; videoId?: string | null;
  reach?: number | null; watchSec?: number | null; metricAt?: string | null;
};
const LABEL: Record<string, string> = { facebook: 'Facebook', youtube: 'YouTube Shorts', tiktok: 'TikTok' };
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');
const fmtDT = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
};
const scoreOf = (r: ChannelRow) => Math.round(r.engagement * 1 + r.views * 0.1 + (r.watchSec || 0) * 0.02 + (r.reach || 0) * 0.05);

export default function ChannelWeek({ channel, rows, weekLabel, offset }: { channel: 'facebook' | 'tiktok' | 'youtube'; rows: ChannelRow[]; weekLabel: string; offset: number }) {
  const linkOf = (r: ChannelRow) => r.channel === 'tiktok' ? (r.shareUrl || r.url) : r.channel === 'youtube' && r.videoId ? `https://youtube.com/shorts/${r.videoId}` : r.url;
  const scored = rows.map((r) => ({ r, score: scoreOf(r) })).sort((a, b) => b.score - a.score);
  const n = scored.length;
  const tierOf = (i: number) => (n <= 1 ? 'Tốt' : i < Math.ceil(n / 3) ? 'Tốt' : i < Math.ceil((2 * n) / 3) ? 'Khá' : 'Yếu');
  const tierCls: Record<string, string> = { 'Tốt': 'tone-ok', 'Khá': 'tone-demo', 'Yếu': 'tone-no' };
  const tot = rows.reduce((s, r) => ({ views: s.views + r.views, eng: s.eng + r.engagement, cmt: s.cmt + r.comments, shares: s.shares + r.shares }), { views: 0, eng: 0, cmt: 0, shares: 0 });
  const withNum = rows.filter((r) => r.views + r.engagement > 0).length;
  const cycle = (i: number) => (i % 8) + 1;
  const viewChart = scored.slice(0, 10).map(({ r }, i) => ({ label: r.title.slice(0, 28), value: r.views, color: cycle(i) }));
  const engChart = scored.slice(0, 10).map(({ r }, i) => ({ label: r.title.slice(0, 28), value: r.engagement, color: cycle(i) }));
  const byDay = new Map<string, number>();
  for (const r of rows) { const d = fmtDT(r.publishedAt).slice(6); byDay.set(d, (byDay.get(d) || 0) + 1); }

  return (
    <section className="blk" style={{ marginBottom: 16 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PlatformLogo platform={channel} size={22} /> Dashboard tuần · {LABEL[channel]}
        <span className="sub">{weekLabel} · {fmt(rows.length)} bài · {fmt(withNum)} bài đã có số</span>
      </h2>
      {rows.length === 0 ? (
        <p className="sub" style={{ margin: '8px 0 0' }}>Tuần này chưa có bài nào trên {LABEL[channel]}. Xem <Link href={`/kenh/${channel}`} className="src">toàn bộ bài của kênh →</Link></p>
      ) : (
        <>
          <div className="ch-kpis">
            <div className="ch-kpi"><b>{fmt(rows.length)}</b><span>Bài trong tuần · {[...byDay.entries()].map(([d, c]) => `${d}: ${c}`).join(', ')}</span></div>
            <div className="ch-kpi"><b>{fmt(tot.views)}</b><span>Lượt xem · TB {fmt(Math.round(tot.views / rows.length))}/bài</span></div>
            <div className="ch-kpi"><b>{fmt(tot.eng)}</b><span>Tương tác · TB {fmt(Math.round(tot.eng / rows.length))}/bài</span></div>
            <div className="ch-kpi"><b>{fmt(tot.cmt)}</b><span>Bình luận</span></div>
            {channel !== 'youtube' ? <div className="ch-kpi"><b>{fmt(tot.shares)}</b><span>Chia sẻ</span></div> : null}
            <div className="ch-kpi"><b>{scored[0] ? scored[0].score : 0}</b><span>Điểm bài tốt nhất{scored[0] ? `: ${scored[0].r.title.slice(0, 34)}` : ''}</span></div>
          </div>
          <div className="chart-grid">
            <BarChart title={`Lượt xem từng bài (${LABEL[channel]}, tuần này)`} items={viewChart} tone="accent" />
            <BarChart title={`Tương tác từng bài (${LABEL[channel]}, tuần này)`} items={engChart} tone="ok" />
          </div>
          <div className="tablewrap" style={{ marginTop: 12 }}>
            <table className="datatable">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Bài</th>
                  <th style={{ width: 110 }}>Đăng lúc</th>
                  <th className="num" style={{ width: 84 }}>Lượt xem</th>
                  <th className="num" style={{ width: 84 }}>Tương tác</th>
                  <th className="num" style={{ width: 84 }}>Bình luận</th>
                  {channel !== 'youtube' ? <th className="num" style={{ width: 70 }}>Chia sẻ</th> : null}
                  <th className="num" style={{ width: 64 }}>Điểm</th>
                  <th style={{ width: 90 }}>Chất lượng</th>
                  <th style={{ width: 64 }}>Mở</th>
                </tr>
              </thead>
              <tbody>
                {scored.map(({ r, score }, i) => {
                  const link = linkOf(r); const tier = tierOf(i);
                  return (
                    <tr key={`${r.cid}-${i}`}>
                      <td className="sub">{i + 1}</td>
                      <td className="cell-title">
                        {link ? <a href={link} target="_blank" rel="noreferrer" className="src"><b>{r.title.slice(0, 90)}</b></a> : <b>{r.title.slice(0, 90)}</b>}
                        <div className="sub" style={{ fontSize: '.78rem' }}>{r.product || '—'}{r.metricAt ? ` · số lúc ${fmtDT(r.metricAt)}` : ' · chưa kéo số'}</div>
                      </td>
                      <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDT(r.publishedAt)}</td>
                      <td className="num">{fmt(r.views)}</td>
                      <td className="num">{fmt(r.engagement)}</td>
                      <td className="num">{fmt(r.comments)}{channel === 'facebook' && r.comments ? <div><Link href={`/kenh/facebook?cmt=${r.cid}#binh-luan`} className="src" style={{ fontSize: '.74rem' }}>xem →</Link></div> : null}</td>
                      {channel !== 'youtube' ? <td className="num">{fmt(r.shares)}</td> : null}
                      <td className="num"><b>{score}</b></td>
                      <td><span className={`badge ${tierCls[tier]}`}>{score === 0 ? 'chưa có số' : tier}</span></td>
                      <td>{link ? <a href={link} target="_blank" rel="noreferrer" className="src">↗</a> : <span className="sub">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ margin: '10px 0 0', fontSize: '.82rem' }}>
            Điểm = tương tác + 0,1 × lượt xem + 0,02 × giây xem + 0,05 × người thấy (cùng công thức BOSS học tuần). Tốt / Khá / Yếu = 1/3 trên, giữa, dưới trong tuần của kênh này. Toàn bộ bài kênh: <Link href={`/kenh/${channel}`} className="src">/kenh/{channel} →</Link>{offset === 0 ? ' · số tuần này còn thay đổi tới Chủ nhật.' : ''}
          </p>
        </>
      )}
    </section>
  );
}
