import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { isEmergencyStopped, getPostCount, isQuotaDisabled } from '../../lib/safety';
import { fbStatus, tiktokStatus } from '../../lib/platform-status';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import { zaloOaStatus } from '../../lib/zalo-oa';
import { toggleEmergencyStop, editDraft } from '../actions';
import DecideActions from '../decide-actions';
import ViewModal from '../view-modal';
import ShareGroups from './share-groups';
import { channelsLabel, riskMeta, formatRelative, formatDateTimeVN } from '../labels';

// BẢNG BÀI VIẾT kiểu board (user 21/8: "duyệt + vận hành + quản lý bài viết gộp lại, dùng
// board thể hiện tổng quan"). Bốn cột theo dòng chảy: Chờ duyệt (duyệt ngay trên thẻ, vẫn
// qua decideForm — điều cấm 1) rồi Đã duyệt rồi Đã đăng (kèm số liệu) rồi Từ chối. Thanh
// vận hành (dừng khẩn + hạn mức) nằm ngay trên board; trang /van-hanh và /hang-doi vẫn sống
// cho bản đầy đủ.

type M = { reactions?: number; comments?: number; shares?: number; views?: number };

// Bỏ nhãn nội bộ khỏi tiêu đề (cùng quy tắc trang hàng đợi).
function stripInternalPrefix(t: string): string {
  return String(t || '')
    .replace(/^\s*(🎯[AB]?\s*|⚡[AB]?\s*Shorts\s*)/u, '')
    .replace(/^(\s*\[[^\]]+\]\s*)+/u, '')
    .trim();
}

function fmtSchedule(s: string): string {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}` : s;
}

function isFutureVN(s: string): boolean {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return false;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5]) > Date.now();
}

const fmtVN = (n: number) => (n || 0).toLocaleString('vi-VN');

export default async function BangSection() {
  const client = getServerClient();
  const limit = Number(process.env.MKT_MAX_POSTS_PER_DAY) || 3;

  const [stopped, quotaOff, fbCount, ttCount, queueRes, alertRes, fb, tt, yt, za, allPostsRes] = await Promise.all([
    isEmergencyStopped(client),
    isQuotaDisabled(client),
    getPostCount(client, 'facebook'),
    getPostCount(client, 'tiktok'),
    client
      .from('approval_queue')
      .select('id, title, payload, status, created_at, decided_at')
      .eq('kind', 'mkt_publish_content')
      .order('created_at', { ascending: false })
      .limit(300),
    client
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .neq('kind', 'mkt_publish_content'),
    fbStatus(),
    tiktokStatus(),
    getYouTubeChannelInfo(),
    zaloOaStatus(client),
    client.from('mkt_posts').select('channel').eq('status', 'published').limit(1000)
  ]);

  const queue = (queueRes.data || []) as any[];
  const otherPending = alertRes.count || 0;

  // Số bài đã đăng theo kênh (cho panel Kênh kết nối + ô thống kê).
  const postedByChannel = new Map<string, number>();
  for (const p of allPostsRes.data || []) {
    const ch = (p as any).channel as string;
    postedByChannel.set(ch, (postedByChannel.get(ch) || 0) + 1);
  }
  const totalPosted = [...postedByChannel.values()].reduce((s, n) => s + n, 0);

  // Gom queue theo content_id (bản ghi mới nhất thắng — mỗi bài 1 thẻ).
  type QItem = { qid: string; cid: string; title: string; status: string; createdAt: string; decidedAt: string; scheduledAt: string; payload: any };
  const byContent = new Map<string, QItem>();
  for (const q of queue) {
    const cid = String(q.payload?.content_id || '');
    if (!cid || byContent.has(cid)) continue;
    byContent.set(cid, {
      qid: q.id, cid, title: q.title || '', status: q.status,
      createdAt: q.created_at, decidedAt: q.decided_at || '',
      scheduledAt: String(q.payload?.scheduled_at || ''), payload: q.payload || {}
    });
  }
  const cids = [...byContent.keys()];

  // Nội dung + nháp + cờ video; bài đã đăng; số liệu; media để xem trước khi duyệt.
  const contents = new Map<string, { title: string; draft: string; brief: any }>();
  const postsByContent = new Map<string, { channel: string; url: string; at: string }[]>();
  const metricsByContent = new Map<string, M>();
  if (cids.length) {
    const [{ data: cs }, { data: ps }, { data: ms }] = await Promise.all([
      client.from('mkt_content').select('id, title, draft, brief').in('id', cids),
      client.from('mkt_posts').select('content_id, channel, external_url, published_at').eq('status', 'published').in('content_id', cids),
      client.from('mkt_metrics').select('entity_ref, metrics, created_at').eq('source', 'facebook').in('entity_ref', cids).order('created_at', { ascending: false }).limit(600)
    ]);
    for (const c of cs || []) contents.set((c as any).id, { title: (c as any).title || '', draft: String((c as any).draft || ''), brief: (c as any).brief || {} });
    for (const p of ps || []) {
      const cid = (p as any).content_id as string | null;
      if (!cid) continue;
      if (!postsByContent.has(cid)) postsByContent.set(cid, []);
      postsByContent.get(cid)!.push({ channel: (p as any).channel || '', url: (p as any).external_url || '', at: (p as any).published_at || '' });
    }
    for (const m of ms || []) {
      const cid = (m as any).entity_ref as string | null;
      if (!cid || metricsByContent.has(cid)) continue;
      const mm = ((m as any).metrics || {}) as any;
      metricsByContent.set(cid, { reactions: mm.reactions || 0, comments: mm.comments || 0, shares: mm.shares || 0, views: mm.views });
    }
  }

  // Ảnh/video gắn trong payload để hiện thumb + xem trước khi duyệt.
  const assetIds = new Set<string>();
  for (const it of byContent.values()) {
    const a = it.payload?.assets || {};
    if (typeof a.image === 'string') assetIds.add(a.image);
    if (typeof a.video === 'string') assetIds.add(a.video);
  }
  const assetUrl = new Map<string, string>();
  if (assetIds.size) {
    const { data: as } = await client.from('brand_assets').select('id, storage_path').in('id', [...assetIds]);
    for (const a of as || []) assetUrl.set((a as any).id, client.storage.from('brand-assets').getPublicUrl((a as any).storage_path).data.publicUrl);
  }

  // Chia cột. Đã duyệt = approved nhưng chưa có bài đăng thật (đang đăng / chờ hẹn giờ / bị chặn).
  const items = [...byContent.values()];
  const pending = items.filter((it) => it.status === 'pending');
  const approvedWaiting = items.filter((it) => it.status === 'approved' && !(postsByContent.get(it.cid) || []).length);
  const published = items
    .filter((it) => (postsByContent.get(it.cid) || []).length > 0)
    .sort((a, b) => {
      const la = (postsByContent.get(a.cid) || [])[0]?.at || '';
      const lb = (postsByContent.get(b.cid) || [])[0]?.at || '';
      return lb.localeCompare(la);
    });
  const rejected = items
    .filter((it) => it.status === 'rejected')
    .sort((a, b) => (b.decidedAt || '').localeCompare(a.decidedAt || ''));

  const CH_ICON: Record<string, string> = { facebook: '📘', youtube: '▶️', tiktok: '🎵', website: '🌐' };
  const PUB_CAP = 12;
  const REJ_CAP = 8;

  const columns: { key: string; label: string; icon: string; tone: string; items: QItem[]; cap: number; moreHref?: string }[] = [
    { key: 'pending', label: 'Chờ duyệt', icon: '📥', tone: 'demo', items: pending, cap: 50 },
    { key: 'approved', label: 'Đã duyệt', icon: '✅', tone: 'ok', items: approvedWaiting, cap: 10 },
    { key: 'published', label: 'Đã đăng', icon: '🌐', tone: 'web', items: published, cap: PUB_CAP, moreHref: '/noi-dung?loai=bai-viet' },
    { key: 'rejected', label: 'Từ chối', icon: '⛔', tone: 'no', items: rejected, cap: REJ_CAP, moreHref: '/noi-dung?loai=bai-viet&trangthai=rejected' }
  ];

  // Tổng tương tác Facebook của các bài trên board (bản snapshot mới nhất mỗi bài).
  let boardEngagement = 0;
  for (const m of metricsByContent.values()) boardEngagement += (m.reactions || 0) + (m.comments || 0) + (m.shares || 0);

  // Panel Kênh kết nối (bố cục theo mẫu user 21/8: kênh bên trái, dòng chảy bài bên phải).
  const channels = [
    { icon: '📘', name: 'Facebook', ok: fb.ok, note: fb.ok ? `${fmtVN(postedByChannel.get('facebook') || 0)} bài đã đăng` : 'Cần cấu hình', href: '/facebook' },
    { icon: '▶️', name: 'YouTube', ok: !!(yt.configured && yt.channelTitle), note: yt.configured && yt.channelTitle ? `${fmtVN(postedByChannel.get('youtube') || 0)} video Shorts` : 'Cần cấu hình', href: '/youtube' },
    { icon: '🎵', name: 'TikTok', ok: tt.ok, note: tt.ok ? `${fmtVN(postedByChannel.get('tiktok') || 0)} video, chờ audit` : 'Cần cấu hình', href: '/tiktok' },
    { icon: '💬', name: 'Zalo OA', ok: za.configured, note: za.configured ? 'Sẵn sàng' : 'Chờ thiết lập', href: '/ket-noi' }
  ];

  return (
    <section>
      {/* Hàng thống kê nhanh (mẫu user: Total Posts, Engagements, Pending, System Status). */}
      <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div className="stat-tile">
          <div className="stat-num">{fmtVN(totalPosted)}</div>
          <div className="stat-lbl">Bài đã đăng</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{fmtVN(boardEngagement)}</div>
          <div className="stat-lbl">Tổng tương tác</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num">{fmtVN(pending.length)}</div>
          <div className="stat-lbl">Bài chờ duyệt</div>
        </div>
        <div className="stat-tile">
          <div className="stat-num" style={stopped ? { color: 'var(--no, #e23b2e)' } : undefined}>{stopped ? '🔴 Dừng' : '🟢 Chạy'}</div>
          <div className="stat-lbl">Hệ thống</div>
        </div>
      </div>

      {/* Thanh vận hành gọn: dừng khẩn + hạn mức + hàng đợi khác. Bản đầy đủ ở /van-hanh. */}
      <div className={`card ${stopped ? 'tone-no' : ''}`} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', marginBottom: 14 }}>
        <form action={toggleEmergencyStop} style={{ display: 'inline' }}>
          <input type="hidden" name="on" value={stopped ? '0' : '1'} />
          <button className={`btn sm ${stopped ? 'ok' : 'no'}`} type="submit">{stopped ? '▶ Bật lại (cho phép đăng)' : '🛑 Dừng khẩn'}</button>
        </form>
        <span className="muted">Hôm nay: FB <b>{fbCount}{quotaOff ? '' : `/${limit}`}</b>, TikTok <b>{ttCount}{quotaOff ? '' : `/${limit}`}</b>{quotaOff ? ' (đang bỏ hạn mức)' : ''}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {otherPending ? (
            <Link className="src" href="/hang-doi" title="Hồ sơ HR và cảnh báo hệ thống chờ xử lý">⚠ {otherPending.toLocaleString('vi-VN')} mục chờ khác</Link>
          ) : null}
          <Link className="src" href="/van-hanh">Vận hành chi tiết</Link>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Cột trái: Kênh kết nối. */}
        <div className="card" style={{ flex: '0 1 230px', minWidth: 200, display: 'grid', gap: 10, padding: 14 }}>
          <b>Kênh kết nối</b>
          {channels.map((ch) => (
            <Link key={ch.name} href={ch.href} style={{ display: 'flex', gap: 8, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
              <span aria-hidden="true" style={{ fontSize: 18 }}>{ch.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: '.9rem' }}>{ch.name}</b>
                <span className="muted" style={{ fontSize: '.78rem' }}>{ch.note}</span>
              </span>
              <span aria-hidden="true">{ch.ok ? '✅' : '🕓'}</span>
            </Link>
          ))}
          <Link className="src" href="/tong-quan" style={{ fontSize: '.85rem' }}>Tổng quan đầy đủ</Link>
        </div>

        {/* Cột phải: board 4 cột theo dòng chảy bài viết. */}
        <div style={{ flex: '1 1 640px', minWidth: 0, overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(250px, 1fr))', gap: 12, minWidth: 1040, alignItems: 'start' }}>
          {columns.map((col) => (
            <div key={col.key} style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                <span aria-hidden="true">{col.icon}</span>
                <b>{col.label}</b>
                <span className="badge tone-default">{col.items.length}</span>
              </div>

              {col.items.length === 0 ? (
                <p className="muted" style={{ fontSize: '.85rem', padding: '2px 2px' }}>Trống.</p>
              ) : null}

              {col.items.slice(0, col.cap).map((it) => {
                const c = contents.get(it.cid);
                const title = stripInternalPrefix(c?.title || it.title);
                const p = it.payload || {};
                const rk = riskMeta(p.risk);
                const chans: string[] = Array.isArray(p.channels) ? p.channels : [];
                const imgUrl = typeof p.assets?.image === 'string' ? assetUrl.get(p.assets.image) : undefined;
                const vidUrl = typeof p.assets?.video === 'string' ? assetUrl.get(p.assets.video) : undefined;
                const brief = c?.brief || {};

                if (col.key === 'pending') {
                  return (
                    <div key={it.qid} className="card tone-mkt" style={{ display: 'grid', gap: 8, padding: 12 }}>
                      <time className="muted" style={{ fontSize: '.78rem' }} dateTime={it.createdAt}>{formatRelative(it.createdAt)} · {formatDateTimeVN(it.createdAt)}</time>
                      <b>{title}</b>
                      <div className="badges">
                        {p.authored === 'human' ? <span className="badge tone-no">🚩 Người viết</span> : <span className="badge">🤖 Máy viết</span>}
                        <span className="badge badge-format">📍 {channelsLabel(chans, p.post_reel === true)}</span>
                        {p.ab_variant ? <span className="badge badge-ab">🧪 Thử {p.ab_variant}</span> : null}
                        {brief.video_requested === true ? <span className="badge badge-video-pending">🎬 Đang làm video AI</span> : null}
                        <span className={`badge tone-${rk.tone}`}>{rk.label}</span>
                      </div>
                      {imgUrl || vidUrl ? (
                        <div className="card-media">
                          {imgUrl ? <img src={imgUrl} alt="" loading="lazy" /> : null}
                          {vidUrl ? (
                            <span className="card-media-vid">
                              <video src={`${vidUrl}#t=2`} muted preload="metadata" />
                              <span className="card-media-badge" aria-hidden="true">▶</span>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="card-actions">
                        <ViewModal title={title} label="Xem bài viết">
                          {c?.draft ? <div className="draftbox">{c.draft}</div> : <p className="muted">Chưa có bản nháp.</p>}
                          {c ? (
                            <details className="raw editbox">
                              <summary>Chỉnh sửa bản nháp</summary>
                              <form action={editDraft} className="editform">
                                <input type="hidden" name="content_id" value={it.cid} />
                                <textarea name="draft" defaultValue={c.draft} rows={10} aria-label="Bản nháp" />
                                <button className="btn ok" type="submit">Lưu chỉnh sửa</button>
                              </form>
                            </details>
                          ) : null}
                          {imgUrl || vidUrl ? (
                            <div className="modal-media">
                              {imgUrl ? <img src={imgUrl} alt="" /> : null}
                              {vidUrl ? <video src={`${vidUrl}#t=2`} controls preload="metadata" playsInline /> : null}
                            </div>
                          ) : null}
                        </ViewModal>
                      </div>
                      <DecideActions
                        id={it.qid}
                        title={title}
                        hasTiktok={chans.includes('tiktok')}
                        videoUrl={vidUrl ?? null}
                        caption={c?.draft ?? null}
                      />
                    </div>
                  );
                }

                if (col.key === 'approved') {
                  const sched = it.scheduledAt;
                  // Duyệt quá 1 giờ mà chưa có bài đăng thật thì không phải "đang đăng" nữa,
                  // báo rõ để người vận hành soi run_log (bị chặn hạn mức, lỗi kênh...).
                  const staleMs = it.decidedAt ? Date.now() - new Date(it.decidedAt).getTime() : 0;
                  const stale = staleMs > 60 * 60 * 1000;
                  return (
                    <div key={it.qid} className="card tone-ok" style={{ display: 'grid', gap: 6, padding: 12 }}>
                      <b>{title}</b>
                      {sched && isFutureVN(sched)
                        ? <span className="badge tone-demo">⏰ Hẹn {fmtSchedule(sched)}</span>
                        : stale
                          ? <span className="muted" style={{ fontSize: '.85rem' }}>Đã duyệt {it.decidedAt ? formatRelative(it.decidedAt) : ''} nhưng chưa thấy bài trên kênh, xem Vận hành chi tiết.</span>
                          : <span className="muted" style={{ fontSize: '.85rem' }}>Đã duyệt {it.decidedAt ? formatRelative(it.decidedAt) : ''}, đang đăng lên kênh…</span>}
                      <span className="muted" style={{ fontSize: '.8rem' }}>📍 {channelsLabel(chans, p.post_reel === true)}</span>
                    </div>
                  );
                }

                if (col.key === 'published') {
                  const posts = postsByContent.get(it.cid) || [];
                  const m = metricsByContent.get(it.cid);
                  const fbPost = posts.find((x) => x.channel === 'facebook' && /^https?:/.test(x.url) && !/\/reel\//.test(x.url));
                  const lastAt = posts[0]?.at || '';
                  const ab = (brief.ab_variant as string | undefined) || (p.ab_variant as string | undefined);
                  return (
                    <div key={it.qid} className="card tone-web" style={{ display: 'grid', gap: 6, padding: 12 }}>
                      <b>{title}{ab ? <span className="badge badge-ab" style={{ marginLeft: 6 }} title="Bài thử của cặp A/B theo hướng đi kế hoạch.">🧪 Thử {ab}</span> : null}</b>
                      {lastAt ? <span className="muted" style={{ fontSize: '.8rem' }}>Đăng {formatRelative(lastAt)}</span> : null}
                      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '.85rem' }}>
                        {posts.filter((x) => /^https?:/.test(x.url)).map((x, i) => (
                          <a key={i} className="src" href={x.url} target="_blank" rel="noreferrer">{CH_ICON[x.channel] || '🔗'} {x.channel}</a>
                        ))}
                        {posts.some((x) => x.channel === 'tiktok' && !/^https?:/.test(x.url)) ? <span className="muted">🎵 tiktok</span> : null}
                      </span>
                      {m ? (
                        <span style={{ fontSize: '.85rem' }}>
                          👍 {m.reactions} <span style={{ marginLeft: 6 }}>💬 {m.comments}</span>
                          {m.shares ? <span style={{ marginLeft: 6 }}>🔁 {m.shares}</span> : null}
                          {m.views != null ? <span style={{ marginLeft: 6 }}>👁 {Number(m.views).toLocaleString('vi-VN')}</span> : null}
                        </span>
                      ) : <span className="muted" style={{ fontSize: '.8rem' }}>Chưa có số liệu.</span>}
                      {fbPost ? <span><ShareGroups postUrl={fbPost.url} /></span> : null}
                    </div>
                  );
                }

                // rejected
                return (
                  <div key={it.qid} className="card tone-no" style={{ display: 'grid', gap: 4, padding: 12 }}>
                    <b>{title}</b>
                    <span className="muted" style={{ fontSize: '.8rem' }}>Từ chối {it.decidedAt ? formatRelative(it.decidedAt) : ''}</span>
                  </div>
                );
              })}

              {col.items.length > col.cap && col.moreHref ? (
                <Link className="src" href={col.moreHref} style={{ fontSize: '.85rem' }}>Xem tất cả {col.items.length} bài</Link>
              ) : null}
            </div>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
}
