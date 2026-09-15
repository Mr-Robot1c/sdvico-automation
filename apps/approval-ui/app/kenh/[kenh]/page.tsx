import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerClient } from '../../../lib/supabase-server';
import PlatformLogo, { type PlatformKey } from '../../noi-dung/platform-logo';
import { loadChannelPosts, sumChannel, qualityOf, qualityLabel, type Channel } from '../../../lib/channel-posts';
import { getTikTokVideoIds } from '../../../lib/tiktok';
import { fetchFacebookComments } from '../../../lib/fb-comments';
import { TIKTOK_PROFILE_URL } from '../../../lib/tiktok-username';

// 15/9 (Thanh, kế hoạch sửa web — trang Kênh): "bấm được xem bài đăng / tổng view / tổng cmt của từng nền
// tảng: 20 bài Facebook là bài gì, ngày nào, mấy giờ, lượt view, comment đó là gì, cmt ở bài nào".
// /kenh/facebook | youtube | tiktok: KPI bấm được (sắp theo), bảng từng bài, Facebook có nút xem bình luận
// (đọc Graph API tại chỗ, chỉ đọc).
export const dynamic = 'force-dynamic';

const KENH: Record<string, { label: string; key: PlatformKey; note?: string }> = {
  facebook: { label: 'Facebook Page', key: 'facebook' },
  youtube: { label: 'YouTube Shorts', key: 'youtube' },
  tiktok: { label: 'TikTok', key: 'tiktok', note: 'Video đăng tay qua nút Xuất TikTok; số chỉ tính video còn trên kênh hiện tại.' },
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

export default async function Page({ params, searchParams }: { params: { kenh: string }; searchParams?: { sap?: string; cmt?: string; q?: string } }) {
  const kenh = params.kenh as Channel;
  if (!KENH[kenh]) notFound();
  const client = getServerClient();
  const sap = String(searchParams?.sap || 'moi');
  const q = String(searchParams?.q || '').trim().toLowerCase();
  const cmtCid = String(searchParams?.cmt || '').trim();
  const ttIds = kenh === 'tiktok' ? await getTikTokVideoIds(client) : null;
  let rows = await loadChannelPosts(client, kenh, { limit: 400, tiktokIds: ttIds });
  const tot = sumChannel(rows);
  if (q) rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.product.toLowerCase().includes(q));
  const scores = rows.map(qualityOf);
  if (sap === 'xem') rows = [...rows].sort((a, b) => b.views - a.views);
  else if (sap === 'cmt') rows = [...rows].sort((a, b) => b.comments - a.comments);
  else if (sap === 'tuong-tac') rows = [...rows].sort((a, b) => b.engagement - a.engagement);
  const cmtRow = cmtCid ? rows.find((r) => r.cid === cmtCid) : null;
  const cmts = kenh === 'facebook' && cmtRow?.url ? await fetchFacebookComments(cmtRow.url) : null;
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { sap, q, cmt: cmtCid };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/kenh/${kenh}${s ? `?${s}` : ''}`;
  };

  return (
    <main>
      <header className="head-row">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><PlatformLogo platform={KENH[kenh].key} size={24} /> {KENH[kenh].label}</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Mọi bài đã đăng lên kênh này, số mới nhất máy kéo về. Bấm ô số để sắp theo ô đó; bấm tiêu đề để mở bài thật.
            {KENH[kenh].note ? ` ${KENH[kenh].note}` : ''}
            {kenh === 'tiktok' ? <> Kênh: <a className="src" href={TIKTOK_PROFILE_URL} target="_blank" rel="noreferrer">{TIKTOK_PROFILE_URL.replace('https://www.tiktok.com/', '')} ↗</a>{ttIds === null ? ' (không đọc được danh sách video từ TikTok, tạm lọc theo ngày nối kênh)' : ''}.</> : null}
          </p>
        </div>
        <nav className="filters" style={{ margin: 0 }} aria-label="Chọn nền tảng">
          {Object.entries(KENH).map(([k, v]) => (
            <Link key={k} href={`/kenh/${k}`} className={`chip ${k === kenh ? 'on' : ''}`}><PlatformLogo platform={v.key} size={13} /> {v.label}</Link>
          ))}
        </nav>
      </header>

      <div className="ch-kpis">
        <Link href={href({ sap: 'moi' })} className={`ch-kpi ${sap === 'moi' ? 'on' : ''}`}><b>{fmt(tot.posts)}</b><span>Bài đã đăng · mới nhất trước</span></Link>
        <Link href={href({ sap: 'xem' })} className={`ch-kpi ${sap === 'xem' ? 'on' : ''}`}><b>{fmt(tot.views)}</b><span>Tổng lượt xem · sắp theo xem</span></Link>
        <Link href={href({ sap: 'tuong-tac' })} className={`ch-kpi ${sap === 'tuong-tac' ? 'on' : ''}`}><b>{fmt(tot.engagement)}</b><span>Tổng tương tác · sắp theo tương tác</span></Link>
        <Link href={href({ sap: 'cmt' })} className={`ch-kpi ${sap === 'cmt' ? 'on' : ''}`}><b>{fmt(tot.comments)}</b><span>Tổng bình luận · sắp theo bình luận</span></Link>
        {kenh !== 'youtube' ? <div className="ch-kpi"><b>{fmt(tot.shares)}</b><span>Tổng chia sẻ</span></div> : null}
      </div>

      {cmtRow ? (
        <section className="cmt-panel" id="binh-luan">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b>💬 Bình luận của bài: {cmtRow.title.slice(0, 80)}</b>
            <Link href={href({ cmt: null })} className="btn ghost sm">Đóng</Link>
          </div>
          {kenh !== 'facebook' ? (
            <p className="sub" style={{ margin: '6px 0 0' }}>Nền tảng này chưa cho đọc nội dung bình luận qua API; máy chỉ có số đếm ({fmt(cmtRow.comments)}). Mở bài thật để xem.</p>
          ) : cmts?.error ? (
            <p className="err-note sub" style={{ margin: '6px 0 0', whiteSpace: 'normal' }}>⛔ Không đọc được bình luận: {cmts.error}</p>
          ) : !cmts?.comments.length ? (
            <p className="sub" style={{ margin: '6px 0 0' }}>Bài này chưa có bình luận (hoặc Facebook chưa cấp quyền đọc).</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {cmts.comments.map((c) => (
                <div key={c.id} className="cmt-item">
                  <span className="who" title={c.from}>{c.from}</span>
                  <span>{c.message || <i className="sub">(bình luận không có chữ, có thể là ảnh/sticker)</i>}{c.replies ? <span className="sub"> · {c.replies} trả lời</span> : null}{c.likes ? <span className="sub"> · {c.likes} thích</span> : null}</span>
                  <span className="when">{fmtDT(c.createdTime)}</span>
                </div>
              ))}
              <p className="sub" style={{ margin: '8px 0 0', fontSize: '.78rem' }}>Máy chỉ đọc, không tự trả lời khách (điều cấm 1). Khách hỏi mua thì ghi vào <Link href="/khach-hang" className="src">Khách hàng</Link>.</p>
            </div>
          )}
        </section>
      ) : null}

      <form method="get" style={{ display: 'flex', gap: 6, margin: '0 0 10px' }}>
        <input type="hidden" name="sap" value={sap} />
        <input className="search" type="search" name="q" defaultValue={q} placeholder="Tìm tiêu đề / sản phẩm" aria-label="Tìm bài" style={{ maxWidth: 240 }} />
        <button className="btn ghost sm" type="submit">Tìm</button>
      </form>

      {rows.length === 0 ? (
        <div className="empty"><div className="empty-icon" aria-hidden="true">📭</div><p>Chưa có bài nào trên {KENH[kenh].label}.</p></div>
      ) : (
        <div className="tablewrap">
          <table className="datatable">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Bài</th>
                <th style={{ width: 110 }}>Đăng lúc</th>
                <th className="num" style={{ width: 90 }}>Lượt xem</th>
                <th className="num" style={{ width: 90 }}>Tương tác</th>
                <th className="num" style={{ width: 100 }}>Bình luận</th>
                {kenh !== 'youtube' ? <th className="num" style={{ width: 70 }}>Chia sẻ</th> : null}
                <th style={{ width: 90 }}>Chất lượng</th>
                <th style={{ width: 70 }}>Mở</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sc = qualityOf(r); const ql = qualityLabel(sc, scores);
                return (
                  <tr key={r.cid} className={r.cid === cmtCid ? 'row-today' : undefined}>
                    <td className="sub">{i + 1}</td>
                    <td className="cell-title">
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="src"><b>{r.title.slice(0, 90)}</b></a> : <b>{r.title.slice(0, 90)}</b>}
                      <div className="sub" style={{ fontSize: '.78rem' }}>{r.isVideo ? '🎬 video · ' : ''}{r.product || '—'}{r.metricAt ? ` · số lúc ${fmtDT(r.metricAt)}` : ' · chưa kéo số'}</div>
                    </td>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDT(r.publishedAt)}</td>
                    <td className="num">{fmt(r.views)}</td>
                    <td className="num">{fmt(r.engagement)}</td>
                    <td className="num">
                      {fmt(r.comments)}
                      {kenh === 'facebook' && r.url ? <div><Link href={href({ cmt: r.cid }) + '#binh-luan'} className="src" style={{ fontSize: '.76rem' }}>xem →</Link></div> : null}
                    </td>
                    {kenh !== 'youtube' ? <td className="num">{fmt(r.shares)}</td> : null}
                    <td><span className={`badge ${ql.cls}`} title={`điểm ${sc}`}>{ql.text}</span></td>
                    <td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="src">↗ Mở</a> : <span className="sub">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="sub" style={{ marginTop: 10 }}>Dashboard tuần của kênh này: <Link href={`/do-luong/tuan?kenh=${kenh}`} className="src">Báo cáo tuần · {KENH[kenh].label} →</Link> · số theo ngày ở <Link href="/do-luong" className="src">Đo lường</Link>.</p>
    </main>
  );
}
