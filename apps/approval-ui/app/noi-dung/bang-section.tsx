import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { isEmergencyStopped, getPostCount, isQuotaDisabled } from '../../lib/safety';
import { editDraft, retryFacebookPublish } from '../actions';
import DecideActions from '../decide-actions';
import ViewModal from '../view-modal';
import ShareGroups from './share-groups';
import { channelsLabel, riskMeta, formatRelative, formatDateTimeVN } from '../labels';
import PlatformLogo, { type PlatformKey } from './platform-logo';

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

  const [stopped, quotaOff, fbCount, ttCount, queueRes, alertRes] = await Promise.all([
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
      .neq('kind', 'mkt_publish_content')
  ]);

  const queue = (queueRes.data || []) as any[];
  const otherPending = alertRes.count || 0;

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
  const fbFailed = new Set<string>(); // bài có lượt đăng Facebook thất bại, chưa có bản FB published
  const fbRetrying = new Set<string>(); // đang có lượt đăng lại chạy nền
  const metricsByContent = new Map<string, M>();
  const ytByContent = new Map<string, { views: number; reactions: number; comments: number }>();
  if (cids.length) {
    const [{ data: cs }, { data: ps }, { data: ms }, { data: fails }] = await Promise.all([
      client.from('mkt_content').select('id, title, draft, brief').in('id', cids),
      client.from('mkt_posts').select('content_id, channel, external_url, published_at').eq('status', 'published').in('content_id', cids),
      client.from('mkt_metrics').select('source, entity_ref, metrics, created_at').in('source', ['facebook', 'youtube']).in('entity_ref', cids).order('created_at', { ascending: false }).limit(700),
      // Lượt đăng FACEBOOK THẤT BẠI (23/8: token Page bị vô hiệu) -> thẻ hiện nút "Đăng lại Facebook".
      client.from('mkt_posts').select('content_id').eq('status', 'failed').eq('channel', 'facebook').in('content_id', cids)
    ]);
    for (const f of fails || []) { const cid = (f as any).content_id as string | null; if (cid) fbFailed.add(cid); }
    // Lượt "Đăng lại Facebook" đang chạy nền (bấm trong 3 phút qua, chưa có bản FB published):
    // hiện "Đang đăng lại…" thay nút để người dùng biết máy đang làm, khỏi bấm thêm.
    if (fbFailed.size) {
      const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: rl } = await client.from('run_log').select('detail').eq('task', 'mkt.publish_facebook_retry').gte('created_at', since).order('created_at', { ascending: false }).limit(50);
      for (const r of rl || []) { const d = (r as any).detail || {}; if (d.phase === 'started' && d.contentId && fbFailed.has(d.contentId)) fbRetrying.add(String(d.contentId)); }
    }
    for (const c of cs || []) contents.set((c as any).id, { title: (c as any).title || '', draft: String((c as any).draft || ''), brief: (c as any).brief || {} });
    for (const p of ps || []) {
      const cid = (p as any).content_id as string | null;
      if (!cid) continue;
      if (!postsByContent.has(cid)) postsByContent.set(cid, []);
      postsByContent.get(cid)!.push({ channel: (p as any).channel || '', url: (p as any).external_url || '', at: (p as any).published_at || '' });
    }
    for (const m of ms || []) {
      const cid = (m as any).entity_ref as string | null;
      if (!cid) continue;
      const mm = ((m as any).metrics || {}) as any;
      if ((m as any).source === 'youtube') {
        if (!ytByContent.has(cid)) ytByContent.set(cid, { views: mm.views || 0, reactions: mm.reactions || 0, comments: mm.comments || 0 });
      } else if (!metricsByContent.has(cid)) {
        metricsByContent.set(cid, { reactions: mm.reactions || 0, comments: mm.comments || 0, shares: mm.shares || 0, views: mm.views });
      }
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

  // Nhãn kênh chuẩn (thay emoji thô); logo brthật vẽ bằng PlatformLogo.
  const CH_LABEL: Record<string, string> = { facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', zalo: 'Zalo', website: 'Website' };
  const isPlat = (c: string): c is PlatformKey => c === 'facebook' || c === 'youtube' || c === 'tiktok' || c === 'zalo';
  const PUB_CAP = 12;
  const REJ_CAP = 8;

  // Bỏ cột "Đã duyệt" (user 21/8: "dù sao có đã đăng rồi") — board còn 3 bước. Bài đã duyệt
  // mà chưa lên kênh (hẹn giờ, kẹt) hiện thành dòng cảnh ở thanh vận hành, không mất dấu.
  const columns: { key: string; label: string; icon: string; tone: string; items: QItem[]; cap: number; moreHref?: string }[] = [
    { key: 'pending', label: 'Chờ duyệt', icon: '📥', tone: 'pending', items: pending, cap: 50 },
    { key: 'published', label: 'Đã đăng', icon: '🌐', tone: 'published', items: published, cap: PUB_CAP, moreHref: '/noi-dung?loai=bai-viet' },
    { key: 'rejected', label: 'Từ chối', icon: '⛔', tone: 'rejected', items: rejected, cap: REJ_CAP, moreHref: '/noi-dung?loai=bai-viet&trangthai=rejected' }
  ];

  return (
    <section>
      {/* 23/8 (user: "bỏ cái dòng chạy"): thanh vận hành thường trực đã bỏ — dừng khẩn, hạn mức
          nằm ở mục Vận hành (menu Hệ thống). Bảng chỉ còn cảnh báo KHI CẦN: đang dừng khẩn, hoặc
          có bài đã duyệt mà chưa lên kênh (kèm nút đăng lại FB). */}
      {stopped ? (
        <div className="card tone-no" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', marginBottom: 14 }}>
          <b style={{ color: 'var(--no)' }}>🔴 Đang dừng khẩn, bài Duyệt sẽ không đăng</b>
          <Link className="src" href="/van-hanh">Bật lại ở Vận hành</Link>
        </div>
      ) : null}
      {approvedWaiting.length ? (
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 14px', marginBottom: 14 }}>
          <span className="badge tone-demo" title="Bài đã duyệt nhưng chưa thấy trên kênh nào (đang đăng, hẹn giờ, hoặc kẹt).">
            ⏳ {approvedWaiting.length} bài đã duyệt chưa lên kênh
          </span>
          {approvedWaiting.filter((it) => fbFailed.has(it.cid)).slice(0, 3).map((it) => (
            <form key={it.qid} action={retryFacebookPublish} style={{ display: 'inline' }}>
              <input type="hidden" name="content_id" value={it.cid} />
              <button className="btn ghost sm" type="submit" title={`Đăng lại "${stripInternalPrefix(contents.get(it.cid)?.title || it.title)}" lên Facebook (chạy nền 1 tới 2 phút)`}>↻ Đăng lại FB</button>
            </form>
          ))}
          <Link className="src" href="/van-hanh" style={{ marginLeft: 'auto', fontSize: '.85rem' }}>Vận hành</Link>
        </div>
      ) : null}

      {/* Board 4 cột theo dòng chảy bài viết, chiếm trọn chiều ngang. */}
      <div className="kanban-wrap">
        <div className="kanban">
          {columns.map((col) => (
            <div key={col.key} className="kanban-col">
              <div className={`kanban-head tone-${col.tone}`}>
                <span aria-hidden="true">{col.icon}</span>
                <span>{col.label}</span>
                <span className="n">{col.items.length}</span>
              </div>

              {col.items.length === 0 ? (
                <div className="kanban-empty">Chưa có bài nào ở bước này.</div>
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
                      {(brief as any).insight_line ? (
                        <p className="insight-line" title={(brief as any).insight_situation || 'Insight/painpoint bài này xoáy vào'}>
                          <span aria-hidden="true">🎯</span> {(brief as any).insight_line}
                        </p>
                      ) : null}
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
                              {vidUrl ? (
                                <>
                                  {/* Không dùng #t=2 + preload metadata ở đây (22/8: video đứng 0:00 trên bảng
                                      Chờ duyệt); ViewModal gọi load() khi mở, poster = ảnh bài cho đỡ ô đen. */}
                                  <video src={vidUrl} controls preload="none" playsInline poster={imgUrl || undefined} />
                                  <a className="src" href={vidUrl} target="_blank" rel="noreferrer" style={{ fontSize: '.82rem', alignSelf: 'flex-start' }}>↗ Mở video ở tab mới</a>
                                </>
                              ) : null}
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

                if (col.key === 'published') {
                  const posts = postsByContent.get(it.cid) || [];
                  const m = metricsByContent.get(it.cid);
                  const fbPost = posts.find((x) => x.channel === 'facebook' && /^https?:/.test(x.url) && !/\/reel\//.test(x.url));
                  const lastAt = posts[0]?.at || '';
                  const ab = (brief.ab_variant as string | undefined) || (p.ab_variant as string | undefined);
                  return (
                    <div key={it.qid} className="card tone-web" style={{ display: 'grid', gap: 6, padding: 12 }}>
                      <b>{title}{ab ? <span className="badge badge-ab" style={{ marginLeft: 6 }} title="Bài thử của cặp A/B theo hướng đi kế hoạch.">🧪 Thử {ab}</span> : null}</b>
                      {(brief as any).insight_line ? <span className="insight-line" title={(brief as any).insight_situation || ''}><span aria-hidden="true">🎯</span> {(brief as any).insight_line}</span> : null}
                      {lastAt ? <span className="muted" style={{ fontSize: '.8rem' }}>Đăng {formatRelative(lastAt)}</span> : null}
                      <div className="ch-links">
                        {posts.filter((x) => /^https?:/.test(x.url)).map((x, i) => (
                          <a key={i} className="ch-link" href={x.url} target="_blank" rel="noreferrer" title={`Xem bài trên ${CH_LABEL[x.channel] || x.channel}`}>
                            {isPlat(x.channel) ? <PlatformLogo platform={x.channel} size={15} /> : <span aria-hidden="true">🔗</span>}
                            <span>{CH_LABEL[x.channel] || x.channel}</span>
                          </a>
                        ))}
                        {posts.some((x) => x.channel === 'tiktok' && !/^https?:/.test(x.url)) ? (
                          <span className="ch-link is-off" title="Đã đăng TikTok ở chế độ riêng tư (chờ duyệt ứng dụng), chưa có link công khai">
                            <PlatformLogo platform="tiktok" size={15} />
                            <span>TikTok</span>
                          </span>
                        ) : null}
                      </div>
                      {m || ytByContent.get(it.cid) ? (
                        <span style={{ fontSize: '.85rem' }}>
                          {m ? (
                            <>
                              👍 {m.reactions} <span style={{ marginLeft: 6 }}>💬 {m.comments}</span>
                              {m.shares ? <span style={{ marginLeft: 6 }}>🔁 {m.shares}</span> : null}
                              {m.views != null ? <span style={{ marginLeft: 6 }}>👁 {Number(m.views).toLocaleString('vi-VN')}</span> : null}
                            </>
                          ) : null}
                          {ytByContent.get(it.cid) ? (
                            <span style={{ marginLeft: m ? 6 : 0 }} title="Lượt xem trên YouTube Shorts">▶️ {fmtVN(ytByContent.get(it.cid)!.views)} xem</span>
                          ) : null}
                        </span>
                      ) : <span className="muted" style={{ fontSize: '.8rem' }}>Chưa có số liệu.</span>}
                      {fbPost ? <span><ShareGroups postUrl={fbPost.url} /></span> : null}
                      {!posts.some((x) => x.channel === 'facebook') && fbFailed.has(it.cid) ? (
                        fbRetrying.has(it.cid) ? (
                          <span className="badge tone-demo" title="Máy đang đăng lại lên Facebook (upload + chờ FB xử lý video, 1 tới 2 phút). Thẻ tự cập nhật khi xong.">⏳ Đang đăng lại Facebook…</span>
                        ) : (
                          <form action={retryFacebookPublish} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <input type="hidden" name="content_id" value={it.cid} />
                            <span className="badge tone-no" title="Lượt đăng Facebook thất bại (token Page hết hạn hoặc lỗi mạng). Kênh khác vẫn lên bình thường.">Facebook chưa lên</span>
                            <button className="btn ghost sm" type="submit" title="Đăng lại bài này lên Facebook, chạy nền 1 tới 2 phút (đã duyệt, không đăng lại kênh khác)">↻ Đăng lại Facebook</button>
                          </form>
                        )
                      ) : null}
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
    </section>
  );
}
