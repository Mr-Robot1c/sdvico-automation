import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { isEmergencyStopped, getPostCount, isQuotaDisabled } from '../../lib/safety';
import { editDraft, retryFacebookPublish, requestVideoForContent } from '../actions';
import DecideActions from '../decide-actions';
import ViewModal from '../view-modal';
import ShareGroups from './share-groups';
import { channelsLabel, riskMeta, formatRelative, formatDateTimeVN } from '../labels';
import PlatformLogo, { type PlatformKey } from './platform-logo';
import TikTokPrivateChip from './tiktok-private-chip';
import ExportTiktokButton from './export-tiktok-button';
import AddLeadButton from './add-lead-button';
import LinkTikTokButton from './link-tiktok-button';
import PexelsScenesButton from './pexels-scenes-button';

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

  const [stopped, quotaOff, fbCount, ttCount, queueRes, alertRes, planRes] = await Promise.all([
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
    // Plan live (có daily_schedule 7 ngày) để lọc groups chia sẻ theo lịch ngày (user 26/8:
    // "chia sẻ vào group này có thể nhìn vào bảng kế hoạch ngày đó để hiển thị chỉ đăng vào
    // group đó không?"). Không có plan → ShareGroups hiện tất cả groups như trước (fallback).
    client
      .from('mkt_plans')
      .select('data')
      .eq('data->>origin', 'live')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Extract groups theo ngày cho từng bài đã đăng. Key = date YYYY-MM-DD, value = mảng tên
  // group. Bài đăng ngày nào -> lấy groups của ngày đó từ daily_schedule; bài đăng ngoài
  // tuần plan -> mảng rỗng, ShareGroups tự hiện tất cả.
  const planData = planRes.data as any;
  const scheduleByDate = new Map<string, string[]>();
  if (planData?.data?.daily_schedule && Array.isArray(planData.data.daily_schedule)) {
    for (const d of planData.data.daily_schedule) {
      if (d?.date && Array.isArray(d?.groups)) {
        scheduleByDate.set(String(d.date), d.groups.map(String));
      }
    }
  }
  const groupsForDate = (isoDatetime: string): string[] => {
    if (!isoDatetime) return [];
    // Convert ISO datetime UTC -> YYYY-MM-DD VN (UTC+7)
    const t = new Date(isoDatetime).getTime();
    if (!Number.isFinite(t)) return [];
    const vnDate = new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
    return scheduleByDate.get(vnDate) || [];
  };

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
  const postsByContent = new Map<string, { id: string; channel: string; url: string; at: string; madePublicAt: string | null; deletedAt: string | null }[]>();
  const fbFailed = new Set<string>(); // bài có lượt đăng Facebook thất bại, chưa có bản FB published
  const fbRetrying = new Set<string>(); // đang có lượt đăng lại chạy nền
  const metricsByContent = new Map<string, M>();
  const ytByContent = new Map<string, { views: number; reactions: number; comments: number }>();
  // Playbook 26/8 item 1: đếm lead Zalo/inbox/gọi/gặp per bài. Loại 'spam'.
  const leadsByContent = new Map<string, number>();
  if (cids.length) {
    const [{ data: cs }, { data: ps }, { data: ms }, { data: fails }, { data: leadRows }] = await Promise.all([
      client.from('mkt_content').select('id, title, draft, brief').in('id', cids).is('deleted_at', null),
      client.from('mkt_posts').select('id, content_id, channel, external_url, published_at, made_public_at, deleted_at').eq('status', 'published').in('content_id', cids),
      client.from('mkt_metrics').select('source, entity_ref, metrics, created_at').in('source', ['facebook', 'youtube']).in('entity_ref', cids).order('created_at', { ascending: false }).limit(700),
      // Lượt đăng FACEBOOK THẤT BẠI (23/8: token Page bị vô hiệu) -> thẻ hiện nút "Đăng lại Facebook".
      client.from('mkt_posts').select('content_id').eq('status', 'failed').eq('channel', 'facebook').in('content_id', cids),
      // Lead Zalo/inbox/gọi/gặp (playbook item 1) — đếm theo bài để hiện "🎯 N Zalo".
      client.from('mkt_leads').select('content_id').in('content_id', cids).neq('status', 'spam')
    ]);
    for (const l of leadRows || []) {
      const cid = (l as any).content_id as string | null;
      if (!cid) continue;
      leadsByContent.set(cid, (leadsByContent.get(cid) || 0) + 1);
    }
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
      postsByContent.get(cid)!.push({
        id: String((p as any).id || ''),
        channel: (p as any).channel || '',
        url: (p as any).external_url || '',
        at: (p as any).published_at || '',
        madePublicAt: (p as any).made_public_at || null,
        deletedAt: (p as any).deleted_at || null
      });
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

  // Ảnh/video gắn trong payload để hiện thumb + xem trước khi duyệt. Thêm video_v (bản dọc
   // 9:16) từ brief.assets của mkt_content cho nút "📥 Xuất TikTok" ở cột Đã đăng — user 26/8
   // chốt bỏ API TikTok, chuyển sang xuất tay: cần videoUrl bản dọc để tải + copy caption.
  const assetIds = new Set<string>();
  for (const it of byContent.values()) {
    const a = it.payload?.assets || {};
    if (typeof a.image === 'string') assetIds.add(a.image);
    if (typeof a.video === 'string') assetIds.add(a.video);
    // video_v ở brief của mkt_content (pipeline build video gắn vào), không phải payload.
    // 27/8: brief.assets.video (bản ngang 16:9, bài trend build từ Pexels).
    const cnt = contents.get(it.cid);
    const bAssets = cnt?.brief?.assets || {};
    if (typeof bAssets.video_v === 'string') assetIds.add(bAssets.video_v);
    if (typeof bAssets.video === 'string') assetIds.add(bAssets.video);
  }
  const assetUrl = new Map<string, string>();
  if (assetIds.size) {
    const { data: as } = await client.from('brand_assets').select('id, storage_path').in('id', [...assetIds]);
    for (const a of as || []) assetUrl.set((a as any).id, client.storage.from('brand-assets').getPublicUrl((a as any).storage_path).data.publicUrl);
  }

  // Chia cột. Đã duyệt = approved nhưng chưa có bài đăng thật (đang đăng / chờ hẹn giờ / bị chặn).
  // Loc bo bai da soft-delete (contents.get(cid) undefined vi query mkt_content filter deleted_at null).
  const items = [...byContent.values()].filter((it) => contents.has(it.cid));
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
  // Username TikTok công ty để nút "Mở TikTok" trên chip riêng tư mở đúng profile
  // (https://www.tiktok.com/@sdvico_tbtc — user confirm 26/8). Hardcode fallback vì fact
  // tĩnh của SDVICO; env NEXT_PUBLIC_TIKTOK_USERNAME override nếu sau này đổi.
  const tiktokUsername = (process.env.NEXT_PUBLIC_TIKTOK_USERNAME || 'sdvico_tbtc').trim() || null;
  // Bang bai viet la kanban tong quan - chi hien 1 vai bai gan nhat, xem het qua tab Bai viet
  // (user 26/8: "bang bai viet hien 1 so bai gan day thoi, qua trang bai viet no moi hien het").
  // Cot moi co nut "Xem tat ca" moreHref dan qua /noi-dung?loai=bai-viet.
  const PUB_CAP = 4;
  const REJ_CAP = 4;

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
                        {/* 26/8: user chuyen nut "Lam video" tu /san-xuat sang day de bam nhanh
                            khong phai vao trang Xuong san xuat. Chi hien khi:
                            (1) bai chua yeu cau video (badge "Dang lam video AI" o tren se thay)
                            (2) la bai BAN HANG - bai content nuoi trang khong can video (user 26/8).
                            (3) 27/8: KHONG hien cho bai trend - bai trend da co Pexels URL trong brief.video_scenes,
                                khong can Watcher build tu brand_assets (khong co folder "Bai trend"). */}
                        {it.cid && brief.video_requested !== true && p.post_kind !== 'content' && (brief as any).generator !== 'trend' ? (
                          <form action={requestVideoForContent} style={{ display: 'inline' }}>
                            <input type="hidden" name="content_id" value={it.cid} />
                            <button type="submit" className="btn ghost sm" title="Yeu cau day chuyen video AI dung bai nay (FB 16:9 + TikTok doc). Mat 8-15 phut, ra ban rieng vao Hang doi duyet.">
                              🎬 Làm video
                            </button>
                          </form>
                        ) : null}
                        {/* Bai trend co Pexels footage: mo modal xem 6 canh voi video preview + nut tai truc tiep. */}
                        {(brief as any).generator === 'trend' && Array.isArray((brief as any).video_scenes) && (brief as any).video_scenes.length > 0 ? (
                          <PexelsScenesButton
                            scenes={(brief as any).video_scenes}
                            title={c?.title}
                            hook={(brief as any).hook_15w}
                          />
                        ) : null}
                        {/* Bai trend da build xong video (brief.assets.video co asset_id + trend_video_built_at): hien badge xanh + link mo video. */}
                        {(brief as any).generator === 'trend' && typeof (brief as any).assets?.video === 'string' && (brief as any).trend_video_built_at ? (
                          (() => {
                            const vUrl = assetUrl.get((brief as any).assets.video);
                            const dur = (brief as any).trend_video_duration_sec;
                            return vUrl ? (
                              <a
                                href={vUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="badge"
                                style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', textDecoration: 'none' }}
                                title={`Video trend đã dựng xong${dur ? ' (' + dur + 's)' : ''}. Bấm mở tab mới xem/tải.`}
                              >
                                🎬✓ Video xong{dur ? ` (${dur}s)` : ''} ↗
                              </a>
                            ) : null;
                          })()
                        ) : null}
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
                        {posts
                          .filter((x) => x.channel === 'tiktok' && !/^https?:/.test(x.url))
                          .map((x) => (
                            <TikTokPrivateChip
                              key={x.id}
                              postId={x.id}
                              madePublicAt={x.madePublicAt}
                              deletedAt={x.deletedAt}
                              tiktokUsername={tiktokUsername}
                            />
                          ))}
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
                          {leadsByContent.get(it.cid) ? (
                            <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--tone-ok, #16a34a)' }} title="Khách hỏi mua từ bài này (Zalo/inbox/gọi/gặp). BOSS ưu tiên bài ra nhiều Zalo hơn bài chỉ nhiều like.">🎯 {leadsByContent.get(it.cid)} khách hỏi</span>
                          ) : null}
                        </span>
                      ) : <span className="muted" style={{ fontSize: '.8rem' }}>Chưa có số liệu.</span>}
                      {/* User 27/8 layout: chia 2 cột. TRÁI = Ghi Zalo/inbox + Chia sẻ group.
                          PHẢI = Xuất TikTok + Copy caption (dòng 1) + Ghép TikTok (dòng 2). */}
                      {it.cid ? (() => {
                        const cnt = contents.get(it.cid);
                        const linkedVid = (cnt?.brief as any)?.tiktok_video_id as string | undefined;
                        const linkedUrl = (cnt?.brief as any)?.tiktok_share_url as string | undefined;
                        const videoVId = cnt?.brief?.assets?.video_v as string | undefined;
                        const videoVUrl = videoVId ? assetUrl.get(videoVId) : null;
                        const hasVideo = !!videoVUrl;
                        return (
                          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'start' }}>
                            {/* Cột TRÁI */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                              <AddLeadButton contentId={it.cid} />
                              {fbPost ? <ShareGroups postUrl={fbPost.url} planGroupsToday={groupsForDate(lastAt)} /> : null}
                            </div>
                            {/* Cột PHẢI: chỉ hiện nếu bài có video (bài content ảnh không có TikTok) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                              {hasVideo ? (
                                <ExportTiktokButton
                                  videoUrl={videoVUrl!}
                                  caption={cnt?.draft || cnt?.title || ''}
                                  contentTitle={cnt?.title || 'sdvico'}
                                />
                              ) : null}
                              {hasVideo ? (
                                <LinkTikTokButton contentId={it.cid} linkedVideoId={linkedVid || null} linkedShareUrl={linkedUrl || null} />
                              ) : null}
                            </div>
                          </div>
                        );
                      })() : null}
                      {!posts.some((x) => x.channel === 'facebook') && fbFailed.has(it.cid) ? (
                        fbRetrying.has(it.cid) ? (
                          <span className="badge tone-demo" style={{ marginTop: 6, display: 'inline-block' }} title="Máy đang đăng lại lên Facebook (upload + chờ FB xử lý video, 1 tới 2 phút). Thẻ tự cập nhật khi xong.">⏳ Đang đăng lại Facebook…</span>
                        ) : (
                          <form action={retryFacebookPublish} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
