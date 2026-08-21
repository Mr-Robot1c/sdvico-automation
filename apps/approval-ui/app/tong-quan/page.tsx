import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import { zaloOaStatus } from '../../lib/zalo-oa';
import { fbStatus, tiktokStatus } from '../../lib/platform-status';

export const dynamic = 'force-dynamic';

// TỔNG QUAN KÊNH (user 21/8: "1 trang tổng quát để xem cho đỡ rối mắt"). Mỗi nền tảng một
// thẻ: đang chạy tới đâu, đăng được bao nhiêu bài, số liệu tương tác. Muốn chi tiết thì bấm
// vào thẻ. Số liệu tự động hiện chỉ có Facebook (TikTok chờ audit, YouTube chưa kéo API).

type M = { reactions?: number; comments?: number; shares?: number; views?: number };

const CHANNEL_META: Record<string, { icon: string; name: string }> = {
  facebook: { icon: '📘', name: 'Facebook' },
  youtube: { icon: '▶️', name: 'YouTube Shorts' },
  tiktok: { icon: '🎵', name: 'TikTok' },
  zalo: { icon: '💬', name: 'Zalo OA' }
};

function fmtVNDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Tự ghép "HH:mm dd/mm" theo giờ VN — toLocaleString('vi-VN') trên Node cho "21-08" (gạch)
  // thay vì "21/08" chuẩn Việt Nam.
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23'
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}`;
}

export default async function Page() {
  const client = getServerClient();

  const [fb, tt, yt, za, postsRes, metricsRes, pendingRes] = await Promise.all([
    fbStatus(),
    tiktokStatus(),
    getYouTubeChannelInfo(),
    zaloOaStatus(client),
    client
      .from('mkt_posts')
      .select('channel, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1000),
    client
      .from('mkt_metrics')
      .select('source, entity_ref, metrics, created_at')
      .in('source', ['facebook', 'youtube'])
      .order('created_at', { ascending: false })
      .limit(600),
    client
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('kind', 'mkt_publish_content')
      .eq('status', 'pending')
  ]);

  // Bài đã đăng theo kênh + lần đăng gần nhất.
  const byChannel = new Map<string, { count: number; lastAt: string }>();
  for (const p of postsRes.data || []) {
    const ch = (p as any).channel as string;
    const at = (p as any).published_at as string | null;
    const e = byChannel.get(ch) || { count: 0, lastAt: '' };
    e.count += 1;
    if (!e.lastAt && at) e.lastAt = at; // đã order desc nên bản ghi đầu là mới nhất
    byChannel.set(ch, e);
  }

  // Tổng số liệu theo kênh: bản snapshot mới nhất của từng bài, tách Facebook / YouTube.
  // entity_ref '__page__' và '__page_real__' là số liệu page-level (follower), chặn theo
  // tiền tố (bài học lib/plan.ts).
  const latest = new Map<string, M>();
  const ytLatest = new Map<string, M>();
  const pageLevel = new Map<string, any>();
  for (const r of metricsRes.data || []) {
    const cid = (r as any).entity_ref as string | null;
    if (!cid) continue;
    if (cid.startsWith('__')) { if (!pageLevel.has(cid)) pageLevel.set(cid, (r as any).metrics || {}); continue; }
    const bag = (r as any).source === 'youtube' ? ytLatest : latest;
    if (!bag.has(cid)) bag.set(cid, ((r as any).metrics || {}) as M);
  }
  const pageMetrics = pageLevel.get('__page_real__') || pageLevel.get('__page__') || null;
  const followers = Number(pageMetrics?.followers) || 0;
  let tReactions = 0, tComments = 0, tShares = 0, tViews = 0;
  for (const m of latest.values()) {
    tReactions += m.reactions || 0;
    tComments += m.comments || 0;
    tShares += m.shares || 0;
    tViews += m.views || 0;
  }
  const tEngagement = tReactions + tComments + tShares;
  let yViews = 0, yLikes = 0, yComments = 0;
  for (const m of ytLatest.values()) {
    yViews += m.views || 0;
    yLikes += m.reactions || 0;
    yComments += m.comments || 0;
  }

  const pendingCount = pendingRes.count || 0;
  const totalPosted = [...byChannel.values()].reduce((s, e) => s + e.count, 0);
  const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

  const fbPosts = byChannel.get('facebook') || { count: 0, lastAt: '' };
  const ytPosts = byChannel.get('youtube') || { count: 0, lastAt: '' };
  const ttPosts = byChannel.get('tiktok') || { count: 0, lastAt: '' };

  const ytOk = !!(yt.configured && yt.channelTitle);

  // Mỗi thẻ: trạng thái + chạy tới đâu + số liệu + nơi bấm xem chi tiết.
  const cards: {
    key: string;
    ok: boolean;
    badge: string;
    run: string;
    stats: { label: string; value: string }[] | null;
    statsNote: string | null;
    detailHref: string;
    detailLabel: string;
    connectHref: string;
  }[] = [
    {
      key: 'facebook',
      ok: fb.ok,
      badge: fb.ok ? '✅ Đang chạy' : '⛔ Cần cấu hình',
      run: fbPosts.count
        ? `Đã đăng ${fmt(fbPosts.count)} bài, gần nhất ${fmtVNDateTime(fbPosts.lastAt)}. Máy tự đăng khi bấm Duyệt, sinh bài 7h và 12h30.`
        : 'Chưa có bài nào đăng. Máy tự đăng khi bấm Duyệt.',
      stats: [
        { label: 'Like', value: fmt(tReactions) },
        { label: 'Comment', value: fmt(tComments) },
        { label: 'Share', value: fmt(tShares) },
        ...(tViews ? [{ label: 'Lượt xem', value: fmt(tViews) }] : []),
        ...(followers ? [{ label: 'Người theo dõi', value: fmt(followers) }] : [])
      ],
      statsNote: null,
      detailHref: '/do-luong',
      detailLabel: '📈 Số liệu từng bài',
      connectHref: '/facebook'
    },
    {
      key: 'youtube',
      ok: ytOk,
      badge: ytOk ? '✅ Đang chạy' : '⛔ Cần cấu hình',
      run: ytOk
        ? `Kênh ${yt.channelTitle}. ${ytPosts.count ? `Đã đăng ${fmt(ytPosts.count)} video Shorts, gần nhất ${fmtVNDateTime(ytPosts.lastAt)}.` : 'Chưa có video nào đăng.'} Video dọc tự đăng khi bấm Duyệt.`
        : yt.configured
          ? `Token lỗi: ${yt.error || 'không rõ'}. Chế độ Testing hết hạn sau 7 ngày, lấy token mới theo runbook.`
          : 'Chưa cấu hình 3 biến YOUTUBE_* trên Vercel.',
      stats: ytLatest.size
        ? [
            { label: 'Lượt xem', value: fmt(yViews) },
            { label: 'Like', value: fmt(yLikes) },
            { label: 'Comment', value: fmt(yComments) }
          ]
        : null,
      statsNote: ytLatest.size ? null : 'Chưa có số liệu, cron 30 phút sẽ kéo sau khi video đầu tiên đăng.',
      detailHref: '/do-luong',
      detailLabel: '📈 Số liệu từng bài',
      connectHref: '/youtube'
    },
    {
      key: 'tiktok',
      ok: tt.ok,
      badge: tt.ok ? '🕓 Chờ audit' : '⛔ Cần cấu hình',
      run: tt.ok
        ? `${ttPosts.count ? `Đã đăng ${fmt(ttPosts.count)} video (chế độ riêng tư/bạn bè). ` : ''}App chưa qua audit nên video chỉ đăng được riêng tư, qua audit mới công khai được.`
        : tt.text,
      stats: null,
      statsNote: 'Số liệu chưa lấy được vì app chưa qua audit TikTok.',
      detailHref: '/tiktok',
      detailLabel: 'Chi tiết kết nối',
      connectHref: '/tiktok'
    },
    {
      key: 'zalo',
      ok: za.configured,
      badge: za.configured ? '✅ Đang chạy' : '🕓 Chờ thiết lập',
      run: za.configured ? za.text : 'Khung đã dựng xong, chờ xác thực OA và lấy token theo runbook Zalo.',
      stats: null,
      statsNote: null,
      detailHref: '/ket-noi',
      detailLabel: 'Chi tiết kết nối',
      connectHref: '/ket-noi'
    }
  ];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tổng quan kênh</h1>
          <p className="sub">Mỗi nền tảng đang chạy tới đâu, số liệu ra sao. Bấm vào thẻ để xem chi tiết.</p>
        </div>
      </header>

      <section className="kpi-row" aria-label="Chỉ số tổng" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div className="stat-tile">
          <div className="stat-num">{fmt(pendingCount)}</div>
          <div className="stat-lbl">Bài chờ duyệt</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{fmt(totalPosted)}</div>
          <div className="stat-lbl">Bài đã đăng (mọi kênh)</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{fmt(tEngagement)}</div>
          <div className="stat-lbl">Tổng tương tác Facebook</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{followers ? fmt(followers) : '—'}</div>
          <div className="stat-lbl">Người theo dõi Page</div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {cards.map((c) => {
          const meta = CHANNEL_META[c.key];
          return (
            <div key={c.key} className={`card ${c.ok ? 'tone-ok' : 'tone-no'}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22 }} aria-hidden="true">{meta.icon}</span>
                <b style={{ fontSize: '1.05rem' }}>{meta.name}</b>
                <span className={`badge ${c.ok ? 'tone-ok' : 'tone-no'}`}>{c.badge}</span>
              </div>
              <p className="sub" style={{ margin: 0 }}>{c.run}</p>
              {c.stats && c.stats.length ? (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
                  {c.stats.map((s) => (
                    <span key={s.label} style={{ whiteSpace: 'nowrap' }}>
                      <b>{s.value}</b> <span className="muted" style={{ fontSize: '.85rem' }}>{s.label}</span>
                    </span>
                  ))}
                </div>
              ) : c.statsNote ? (
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>{c.statsNote}</p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' }}>
                <Link className="btn ghost sm" href={c.detailHref}>{c.detailLabel}</Link>
                {c.connectHref !== c.detailHref ? (
                  <Link className="btn ghost sm" href={c.connectHref}>🔌 Kết nối</Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      <p className="muted" style={{ marginTop: 14, fontSize: '.85rem' }}>
        Số liệu tương tác hiện mới kéo tự động được từ Facebook. TikTok chờ audit, YouTube xem ở Studio, Zalo OA đang thiết lập.
      </p>
    </main>
  );
}
