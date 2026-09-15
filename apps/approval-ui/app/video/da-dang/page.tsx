import Link from 'next/link';
import { getServerClient } from '../../../lib/supabase-server';
import PlatformLogo, { type PlatformKey } from '../../noi-dung/platform-logo';
import { TIKTOK_PROFILE_URL } from '../../../lib/tiktok-username';

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
  const { data: postRows } = await client
    .from('mkt_posts')
    .select('content_id, channel, external_url, published_at')
    .eq('status', 'published')
    .is('deleted_at', null)
    .eq('channel', kenh)
    .order('published_at', { ascending: false })
    .limit(300);
  const posts = (postRows || []) as any[];
  const cids = [...new Set(posts.map((p) => String(p.content_id || '')).filter(Boolean))].slice(0, 300);
  const [{ data: contents }, { data: metricRows }] = await Promise.all([
    cids.length ? client.from('mkt_content').select('id, title, kind, brief').in('id', cids) : Promise.resolve({ data: [] as any[] }),
    cids.length
      ? client.from('mkt_metrics').select('entity_ref, metrics, created_at').eq('source', kenh).in('entity_ref', cids).order('created_at', { ascending: false }).limit(900)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const contentOf = new Map<string, any>((contents || []).map((c: any) => [String(c.id), c]));
  const latest = new Map<string, any>();
  for (const r of (metricRows || []) as any[]) { const k = String(r.entity_ref); if (!latest.has(k)) latest.set(k, r.metrics || {}); }

  // Facebook trộn bài chữ + video: chỉ giữ bài có video thật. YouTube/TikTok vốn chỉ video.
  const rows = posts
    .map((p) => ({ p, c: contentOf.get(String(p.content_id || '')) }))
    .filter(({ c }) => kenh !== 'facebook' || !c || c.kind === 'video' || c.brief?.assets?.video || c.brief?.assets?.video_v)
    .filter((x, i, arr) => arr.findIndex((y) => y.p.content_id === x.p.content_id) === i);

  const tot = { views: 0, cmts: 0, eng: 0 };
  for (const { p } of rows) { const m = latest.get(String(p.content_id || '')) || {}; tot.views += Number(m.views) || 0; tot.cmts += Number(m.comments) || 0; tot.eng += Number(m.engagement ?? m.reactions) || 0; }

  return (
    <main>
      <header className="head-row">
        <div>
          <h1><PlatformLogo platform={KENH[kenh].key} size={22} /> Video đã đăng · {KENH[kenh].label}</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>{fmt(rows.length)} video · {fmt(tot.views)} lượt xem · {fmt(tot.eng)} tương tác · {fmt(tot.cmts)} bình luận (số mới nhất máy kéo về). Bấm tiêu đề để mở bài thật.</p>
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
              {rows.map(({ p, c }, i) => {
                const m = latest.get(String(p.content_id || '')) || {};
                const url = String(p.external_url || '');
                const real = c?.brief?.fb_real_url ? String(c.brief.fb_real_url) : (url && !url.startsWith('tiktok:') ? url : (c?.brief?.tiktok_share_url ? String(c.brief.tiktok_share_url) : ''));
                return (
                  <tr key={`${p.content_id}-${i}`}>
                    <td className="sub">{i + 1}</td>
                    <td className="cell-title">
                      {real ? <a href={real} target="_blank" rel="noreferrer" className="src"><b>{String(c?.title || '(không tên)').slice(0, 90)}</b></a> : <b>{String(c?.title || '(không tên)').slice(0, 90)}</b>}
                      {c?.brief?.rotation_group ? <div className="sub" style={{ fontSize: '.78rem' }}>{String(c.brief.rotation_group).replace(/^\s*\d+\.\s*/, '')}</div> : null}
                    </td>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDT(p.published_at)}</td>
                    <td className="num">{fmt(Number(m.views) || 0)}</td>
                    <td className="num">{fmt(Number(m.engagement ?? m.reactions) || 0)}</td>
                    <td className="num">{fmt(Number(m.comments) || 0)}</td>
                    <td className="num">{fmt(Number(m.shares) || 0)}</td>
                    <td>{real ? <a href={real} target="_blank" rel="noreferrer" className="src">↗ Mở</a> : <span className="sub">—</span>}</td>
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
