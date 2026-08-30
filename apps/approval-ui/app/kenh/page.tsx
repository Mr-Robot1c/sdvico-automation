import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { fbStatus, tiktokStatus } from '../../lib/platform-status';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import { getTikTokVideoCount } from '../../lib/tiktok';
import { zaloOaStatus } from '../../lib/zalo-oa';
import PlatformLogo, { type PlatformKey } from '../noi-dung/platform-logo';

// 27/8 REDESIGN (docx "redesign web" cua sep) — trang KENH:
//   1. 4 block nen tang FB / YouTube / TikTok / Zalo OA: so kenh quan tri, so bai dang,
//      tong luot xem, tong comment + link mo tai khoan chinh thuc.
//   2. Bai noi bat cua cac nen tang: bang co link bam vao bai viet — nen tang — ngay dang
//      — luot xem/cmt/share.
// Do luong chi tiet tung bai van o /do-luong (ngay) va /do-luong/tuan (tuan).
export const dynamic = 'force-dynamic';

type M = { reactions?: number; comments?: number; shares?: number; views?: number; videoId?: string; shareUrl?: string };

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

  const [fb, tt, yt, za, ttVideoCount, postsRes, metricsRes] = await Promise.all([
    fbStatus(),
    tiktokStatus(),
    getYouTubeChannelInfo(),
    zaloOaStatus(client),
    getTikTokVideoCount(client),
    client
      .from('mkt_posts')
      .select('content_id, channel, external_url, published_at')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(1000),
    client
      .from('mkt_metrics')
      .select('source, entity_ref, metrics, created_at')
      .in('source', ['facebook', 'youtube', 'tiktok'])
      .order('created_at', { ascending: false })
      .limit(900),
  ]);

  const posts = (postsRes.data || []) as any[];

  // Dem bai + lan dang gan nhat theo kenh.
  const byChannel = new Map<string, { count: number; lastAt: string }>();
  const fbUrlByCid = new Map<string, string>();
  const ytUrlByCid = new Map<string, string>();
  const firstPostAt = new Map<string, string>();
  for (const p of posts) {
    const ch = String(p.channel);
    const e = byChannel.get(ch) || { count: 0, lastAt: '' };
    e.count += 1;
    if (!e.lastAt && p.published_at) e.lastAt = p.published_at;
    byChannel.set(ch, e);
    const cid = String(p.content_id || '');
    if (!cid) continue;
    if (p.published_at && (!firstPostAt.has(cid) || p.published_at < firstPostAt.get(cid)!)) firstPostAt.set(cid, p.published_at);
    if (ch === 'facebook' && p.external_url && !fbUrlByCid.has(cid)) fbUrlByCid.set(cid, String(p.external_url));
    if (ch === 'youtube' && p.external_url && !ytUrlByCid.has(cid)) ytUrlByCid.set(cid, String(p.external_url));
  }

  // Snapshot metric moi nhat moi bai, tach nguon.
  const latestFB = new Map<string, M>();
  const latestYT = new Map<string, M>();
  const latestTT = new Map<string, M>();
  const pageLevel = new Map<string, any>();
  for (const r of (metricsRes.data || []) as any[]) {
    const cid = String(r.entity_ref || '');
    if (!cid) continue;
    if (cid.startsWith('__')) { if (!pageLevel.has(cid)) pageLevel.set(cid, r.metrics || {}); continue; }
    const bag = r.source === 'youtube' ? latestYT : r.source === 'tiktok' ? latestTT : latestFB;
    if (!bag.has(cid)) bag.set(cid, (r.metrics || {}) as M);
  }
  const followers = Number((pageLevel.get('__page_real__') || pageLevel.get('__page__') || {})?.followers) || 0;

  // Tong theo nen tang.
  let fbViews = 0, fbCmts = 0, fbReacts = 0, fbShares = 0;
  for (const m of latestFB.values()) { fbViews += m.views || 0; fbCmts += m.comments || 0; fbReacts += m.reactions || 0; fbShares += m.shares || 0; }
  let ytViews = 0, ytCmts = 0, ytLikes = 0;
  for (const m of latestYT.values()) { ytViews += m.views || 0; ytCmts += m.comments || 0; ytLikes += m.reactions || 0; }
  let ttViews = 0, ttCmts = 0, ttLikes = 0;
  for (const m of latestTT.values()) { ttViews += m.views || 0; ttCmts += m.comments || 0; ttLikes += m.reactions || 0; }

  const fbPostsAll = byChannel.get('facebook') || { count: 0, lastAt: '' };
  // 28/8 (user: "lay so lieu tu KENH CHINH thoi"): dem bai FB = bai co mat tren Page chinh
  // SDVICO VN (brief.fb_real_url ghep tay HOAC bai import tu page chinh). Ban page phu bo.
  const fbAllCids = [...new Set(posts.filter((p) => p.channel === 'facebook').map((p) => String(p.content_id || '')).filter(Boolean))];
  let fbRealCount = 0;
  const fbRealUrlByCid = new Map<string, string>();
  if (fbAllCids.length) {
    // @ts-ignore — module JS thuần
    const { isOtherPage } = await import('../../lib/page-origin.mjs');
    const { data: fbContents } = await client.from('mkt_content').select('id, brief').in('id', fbAllCids.slice(0, 500));
    const briefOf = new Map((fbContents || []).map((c: any) => [String(c.id), c.brief || {}]));
    for (const cid of fbAllCids) {
      const brief: any = briefOf.get(cid) || {};
      const realUrl = String(brief.fb_real_url || '');
      if (realUrl) { fbRealCount += 1; fbRealUrlByCid.set(cid, realUrl); continue; }
      const postUrl = fbUrlByCid.get(cid) || '';
      if ((isOtherPage as (u: string, b: any) => boolean)(postUrl, brief)) fbRealCount += 1;
    }
  }
  const fbPosts = { count: fbRealCount, lastAt: fbPostsAll.lastAt };
  const ytPosts = byChannel.get('youtube') || { count: 0, lastAt: '' };
  const ttPostCount = typeof ttVideoCount === 'number' ? ttVideoCount : (byChannel.get('tiktok') || { count: 0 }).count;

  const tiktokUser = (process.env.NEXT_PUBLIC_TIKTOK_USERNAME || 'sdvico_tbtc').trim();
  const ytOk = !!(yt.configured && yt.channelTitle);

  // ===== BAI NOI BAT: gop diem tat ca nen tang theo content =====
  type Hot = { cid: string; eng: number; views: number; cmts: number; shares: number; platforms: PlatformKey[]; links: Array<{ platform: PlatformKey; url: string }> };
  const hotMap = new Map<string, Hot>();
  const ensure = (cid: string): Hot => {
    if (!hotMap.has(cid)) hotMap.set(cid, { cid, eng: 0, views: 0, cmts: 0, shares: 0, platforms: [], links: [] });
    return hotMap.get(cid)!;
  };
  for (const [cid, m] of latestFB) {
    const h = ensure(cid);
    h.eng += (m.reactions || 0) + (m.comments || 0) + (m.shares || 0);
    h.views += m.views || 0; h.cmts += m.comments || 0; h.shares += m.shares || 0;
    if (!h.platforms.includes('facebook')) h.platforms.push('facebook');
    // 29/8 (user): link FB CHỈ khi đã ghép kênh chính (fb_real_url) — giống TikTok, không
    // fallback link page phụ nữa (kênh phụ đã tắt).
    const u = fbRealUrlByCid.get(cid);
    if (u) h.links.push({ platform: 'facebook', url: u });
  }
  for (const [cid, m] of latestYT) {
    const h = ensure(cid);
    h.eng += (m.reactions || 0) + (m.comments || 0);
    h.views += m.views || 0; h.cmts += m.comments || 0;
    if (!h.platforms.includes('youtube')) h.platforms.push('youtube');
    const u = m.videoId ? `https://youtube.com/shorts/${m.videoId}` : ytUrlByCid.get(cid);
    if (u) h.links.push({ platform: 'youtube', url: u });
  }
  for (const [cid, m] of latestTT) {
    const h = ensure(cid);
    h.eng += (m.reactions || 0) + (m.comments || 0) + (m.shares || 0);
    h.views += m.views || 0; h.cmts += m.comments || 0; h.shares += m.shares || 0;
    if (!h.platforms.includes('tiktok')) h.platforms.push('tiktok');
    if (m.shareUrl) h.links.push({ platform: 'tiktok', url: String(m.shareUrl) });
  }
  // 28/8 (user): chi xep bai NOI TRONG 7 NGAY (truoc lay ca lich su nen bai cu 18/08 dung
  // dau mai). Bai khong co firstPostAt (TikTok ghep tay, khong tao mkt_posts) van cho qua.
  const since7Iso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const hot = [...hotMap.values()]
    .filter((h) => h.eng + h.views > 0)
    .filter((h) => {
      const at = firstPostAt.get(h.cid);
      return !at || at >= since7Iso;
    })
    .sort((a, b) => (b.eng - a.eng) || (b.views - a.views))
    .slice(0, 8);

  const hotTitles = new Map<string, string>();
  if (hot.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', hot.map((h) => h.cid));
    for (const c of cs || []) hotTitles.set(String((c as any).id), String((c as any).title || '(không tên)'));
  }

  // 28/8 (user): BO dong so lieu phu (nguoi theo doi/like/share) — note CHI hien khi co
  // bug/hong/han che, chu DO nhu ben Zalo OA.
  const cards = [
    {
      key: 'facebook' as PlatformKey,
      name: 'Facebook',
      manage: `${fb.pages.length || 0} Page`,
      ok: fb.ok,
      badge: fb.ok ? 'Đang chạy' : 'Cần cấu hình',
      badgeCls: fb.ok ? 'tone-ok' : 'tone-no',
      posts: fbPosts.count,
      views: fbViews,
      cmts: fbCmts,
      warn: fb.ok ? null : String(fb.text || 'Token Facebook lỗi — kiểm tra ở Kết nối.').slice(0, 120),
      link: fb.realPageUrl ? { url: fb.realPageUrl, label: 'Mở Page SDVICO ↗' } : null,
      detail: { href: '/do-luong', label: 'Số liệu từng bài' },
    },
    {
      key: 'youtube' as PlatformKey,
      name: 'YouTube Shorts',
      manage: `${ytOk ? 1 : 0} kênh`,
      ok: ytOk,
      badge: ytOk ? 'Đang chạy' : 'Cần cấu hình',
      badgeCls: ytOk ? 'tone-ok' : 'tone-no',
      posts: ytPosts.count,
      views: ytViews,
      cmts: ytCmts,
      warn: ytOk ? null : yt.configured ? `Token lỗi: ${String(yt.error || 'không rõ').slice(0, 90)} — lấy token mới theo runbook.` : 'Chưa cấu hình 3 biến YOUTUBE_* trên Vercel.',
      link: yt.channelUrl ? { url: yt.channelUrl, label: `Mở kênh ${yt.channelTitle || 'SDVICO'} ↗` } : null,
      detail: { href: '/do-luong', label: 'Số liệu từng video' },
    },
    {
      key: 'tiktok' as PlatformKey,
      name: 'TikTok',
      manage: `${tt.ok ? 1 : 0} tài khoản`,
      ok: tt.ok,
      badge: tt.ok ? 'Chờ audit' : 'Cần cấu hình',
      badgeCls: tt.ok ? 'tone-demo' : 'tone-no',
      posts: ttPostCount,
      views: ttViews,
      cmts: ttCmts,
      warn: tt.ok ? 'App chưa qua audit TikTok — video đăng tay qua nút Xuất TikTok, ghép lại để kéo số.' : String((tt as any).text || 'Chưa kết nối TikTok.').slice(0, 120),
      link: { url: `https://www.tiktok.com/@${tiktokUser}`, label: `Mở @${tiktokUser} ↗` },
      detail: { href: '/tiktok', label: 'Kết nối và audit' },
    },
    {
      key: 'zalo' as PlatformKey,
      name: 'Zalo OA',
      manage: `${za.configured ? 1 : 0} OA`,
      ok: za.configured,
      badge: za.configured ? 'Đang chạy' : 'Chờ thiết lập',
      badgeCls: za.configured ? 'tone-ok' : 'tone-demo',
      posts: 0,
      views: 0,
      cmts: 0,
      warn: za.configured ? null : 'Khung dựng xong, chờ xác thực OA + token.',
      link: null,
      detail: { href: '/ket-noi', label: 'Xem thiết lập' },
    },
  ];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kênh truyền thông</h1>
          <p className="sub">4 nền tảng SDVICO đang chạy — số kênh quản trị, bài đã đăng, tổng lượt xem và bình luận. Bấm link để mở tài khoản thật.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/do-luong" className="btn ghost">📈 Đo lường ngày</Link>
          <Link href="/do-luong/tuan" className="btn ghost">📅 Báo cáo tuần</Link>
          <Link href="/ket-noi" className="btn ghost">🔌 Kết nối</Link>
        </div>
      </header>

      {/* ===== 4 BLOCK NEN TANG ===== */}
      <div className="pf-grid" style={{ marginTop: 16 }}>
        {cards.map((c) => (
          <div key={c.key} className="pf-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="pf-head">
              <span className={`pf-icon ${c.key}`} aria-hidden="true"><PlatformLogo platform={c.key} size={24} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="pf-name">{c.name}</span>
                <span className="sub" style={{ display: 'block', fontSize: '.72rem' }}>Quản trị {c.manage}</span>
              </span>
              <span className={`badge ${c.badgeCls}`}>{c.badge}</span>
            </div>
            <div className="pf-stats three" style={{ marginTop: 10 }}>
              <span className="pf-stat"><b>{fmt(c.posts)}</b><span>Bài đã đăng</span></span>
              <span className="pf-stat"><b>{c.views || c.posts ? fmt(c.views) : '—'}</b><span>Tổng lượt xem</span></span>
              <span className="pf-stat"><b>{c.cmts || c.posts ? fmt(c.cmts) : '—'}</b><span>Tổng comment</span></span>
            </div>
            {c.warn ? <p className="pf-note" style={{ marginTop: 8, color: 'var(--no)' }}>⚠️ {c.warn}</p> : null}
            {/* 29/8 (sếp: "lệch chỗ mở page/số liệu từng bài"): thanh chân card CHUẨN 1 HÀNG cho cả
                4 nền tảng — link tài khoản bên trái (dài thì cắt ...), link số liệu ghim phải. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--line)', alignItems: 'center', minWidth: 0 }}>
              {c.link ? (
                <a href={c.link.url} target="_blank" rel="noreferrer" className="src" title={c.link.label} style={{ fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <PlatformLogo platform={c.key} size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.link.label}</span>
                </a>
              ) : <span className="sub" style={{ fontSize: '.82rem' }}>—</span>}
              <Link href={c.detail.href} className="src" style={{ fontSize: '.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{c.detail.label} →</Link>
            </div>
          </div>
        ))}
      </div>

      {/* ===== BAI NOI BAT ===== */}
      <section className="blk" style={{ marginTop: 16 }}>
        <h2><span aria-hidden="true">🔥</span> Bài nổi bật các nền tảng <span className="sub">7 ngày gần nhất, mọi nền tảng xếp chung theo tương tác + lượt xem — bấm tiêu đề hoặc logo để mở bài thật</span></h2>
        {hot.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Chưa có bài nào có số liệu.</p>
        ) : (
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Bài</th>
                  <th style={{ width: 110 }}>Nền tảng</th>
                  <th style={{ width: 110 }}>Ngày đăng</th>
                  <th className="num" style={{ width: 90 }}>Lượt xem</th>
                  <th className="num" style={{ width: 90 }}>Tương tác</th>
                  <th className="num" style={{ width: 80 }}>Comment</th>
                  <th className="num" style={{ width: 70 }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {hot.map((h, i) => {
                  const mainLink = h.links[0]?.url || null;
                  const title = hotTitles.get(h.cid) || '(không tên)';
                  return (
                    <tr key={h.cid}>
                      <td><span className="tq-rank" aria-hidden="true">{i + 1}</span></td>
                      <td className="cell-title">
                        {mainLink ? (
                          <a href={mainLink} target="_blank" rel="noreferrer" className="src"><b>{title.slice(0, 80)}</b></a>
                        ) : (
                          <b className="cell-title-nolink" title="Bài chưa có link đăng để mở">{title.slice(0, 80)}</b>
                        )}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {h.links.length
                            ? h.links.map((l) => (
                                <a key={l.platform + l.url} href={l.url} target="_blank" rel="noreferrer" title={`Mở bài trên ${l.platform}`}>
                                  <PlatformLogo platform={l.platform} size={16} />
                                </a>
                              ))
                            : h.platforms.map((p) => <PlatformLogo key={p} platform={p} size={16} />)}
                        </span>
                      </td>
                      <td className="sub" style={{ fontSize: '.82rem' }}>{fmtDT(firstPostAt.get(h.cid) || null) || '—'}</td>
                      <td className="num">{fmt(h.views)}</td>
                      <td className="num">{fmt(h.eng)}</td>
                      <td className="num">{fmt(h.cmts)}</td>
                      <td className="num">{fmt(h.shares)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
