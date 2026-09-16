import Link from 'next/link';
import { getServerClient } from '../../../lib/supabase-server';
import PlatformLogo, { type PlatformKey } from '../../noi-dung/platform-logo';
import { TIKTOK_PROFILE_URL } from '../../../lib/tiktok-username';
import { loadChannelPosts, sumChannel, qualityOf, qualityLabel, type Channel } from '../../../lib/channel-posts';
import { tiktokIdsCached } from '../../../lib/cached';

// 15/9 (Thanh, kế hoạch sửa web): ô "Đã đăng: 12 Facebook · 16 YouTube · 4 TikTok" ở /video phải bấm
// vào được từng nền tảng để kiểm tra các video. Trang này liệt kê video đã đăng của 1 kênh: bài gì,
// ngày giờ, lượt xem / tương tác / bình luận mới nhất (mkt_metrics), link mở bài thật.
export const dynamic = 'force-dynamic';

const KENH: Record<string, { label: string; key: PlatformKey }> = {
  facebook: { label: 'Facebook', key: 'facebook' },
  youtube: { label: 'YouTube Shorts', key: 'youtube' },
  tiktok: { label: 'TikTok', key: 'tiktok' },
};
function fmtDT(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

export default async function Page({ searchParams }: { searchParams?: { kenh?: string } }) {
  const kenh = KENH[String(searchParams?.kenh || 'facebook')] ? String(searchParams?.kenh || 'facebook') : 'facebook';
  const client = getServerClient();
  const ttIds = kenh === 'tiktok' ? await tiktokIdsCached() : null;
  const all = await loadChannelPosts(client, kenh as Channel, { limit: 400, tiktokIds: ttIds });
  const rows = all.filter((r) => r.isVideo);
  const tot = sumChannel(rows);
  const scores = rows.map(qualityOf);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1><PlatformLogo platform={KENH[kenh].key} size={22} /> Video đã đăng · {KENH[kenh].label}</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>{fmt(rows.length)} video · {fmt(tot.views)} lượt xem · {fmt(tot.engagement)} tương tác · {fmt(tot.comments)} bình luận (số mới nhất máy kéo về). Bấm tiêu đề để mở bài thật.</p>
        </div>
        <nav className="filters" style={{ margin: 0 }} aria-label="Chọn nền tảng">
          {Object.entries(KENH).map(([k, v]) => (
            <Link key={k} href={`/video/da-dang?kenh=${k}`} className={`chip ${k === kenh ? 'on' : ''}`}><PlatformLogo platform={v.key} size={13} /> {v.label}</Link>
          ))}
        </nav>
      </header>
      {kenh === 'tiktok' ? <p className="sub">TikTok đăng tay qua nút Xuất TikTok; lượt xem lấy từ kênh <a className="src" href={TIKTOK_PROFILE_URL} target="_blank" rel="noreferrer">hiện tại ↗</a>.</p> : null}
      {rows.length === 0 ? (
        <div className="empty"><div className="empty-icon" aria-hidden="true">🎬</div><p>Chưa có video nào đăng lên {KENH[kenh].label}.</p></div>
      ) : (
        <div className="tablewrap">
          <table className="datatable">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Video</th>
                <th style={{ width: 120 }}>Đăng lúc</th>
                <th className="num" style={{ width: 100 }}>Lượt xem</th>
                <th className="num" style={{ width: 100 }}>Tương tác</th>
                <th className="num" style={{ width: 100 }}>Bình luận</th>
                <th className="num" style={{ width: 80 }}>Chia sẻ</th>
                <th style={{ width: 80 }}>Mở</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sc = qualityOf(r); const ql = qualityLabel(sc, scores);
                return (
                  <tr key={`${r.cid}-${i}`}>
                    <td className="sub">{i + 1}</td>
                    <td className="cell-title">
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="src"><b>{r.title.slice(0, 90)}</b></a> : <b>{r.title.slice(0, 90)}</b>}
                      <div className="sub" style={{ fontSize: '.78rem' }}>{r.product || '—'} · <span className={`badge ${ql.cls}`} title={`điểm ${sc}`}>{ql.text}</span></div>
                    </td>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDT(r.publishedAt)}</td>
                    <td className="num">{fmt(r.views)}</td>
                    <td className="num">{fmt(r.engagement)}</td>
                    <td className="num">{fmt(r.comments)}</td>
                    <td className="num">{fmt(r.shares)}</td>
                    <td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="src">↗ Mở</a> : <span className="sub">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="sub" style={{ marginTop: 10 }}>Số liệu chi tiết theo ngày ở <Link href="/do-luong" className="src">Đo lường</Link> · dashboard tuần từng kênh ở <Link href={`/do-luong/tuan?kenh=${kenh}`} className="src">Báo cáo tuần</Link>.</p>
    </main>
  );
}
