import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { editDraft, retryFacebookPublish, requestVideoForContent } from '../actions';
import DecideActions from '../decide-actions';
import ViewModal from '../view-modal';
import ShareGroups from './share-groups';
import { channelsLabel, riskMeta, formatRelative, formatDateTimeVN } from '../labels';
import PlatformLogo, { type PlatformKey } from './platform-logo';
import TikTokPrivateChip from './tiktok-private-chip';
import ExportTiktokButton from './export-tiktok-button';
import AddLeadButton from './add-lead-button';
import LinkFbButton from './link-fb-button';
import PostFbButton from './post-fb-button';
import CopyCaptionButton from './copy-caption-button';
import LinkTikTokButton from './link-tiktok-button';
import PexelsScenesButton from './pexels-scenes-button';
import { loadPostingPlan, groupsForDate, isFutureVNLocal, CHANNEL_LABEL } from '../../lib/posting-plan';

// BẢNG BÀI VIẾT kiểu board (user 21/8: "duyệt + vận hành + quản lý bài viết gộp lại, dùng
// board thể hiện tổng quan"). Bốn cột theo dòng chảy: Chờ duyệt (duyệt ngay trên thẻ, vẫn
// qua decideForm — điều cấm 1) rồi Đã duyệt rồi Đã đăng (kèm số liệu) rồi Từ chối.
// 4/9: trang Vận hành và 2 công tắc đã bỏ theo yêu cầu user; cổng an toàn trong lib/safety.ts
// vẫn chạy ngầm với giá trị app_config hiện có.

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

  const [queueRes, alertRes, pp] = await Promise.all([
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
    // Lịch đăng cố định (user 26/8: "chia sẻ vào group này có thể nhìn vào bảng kế hoạch ngày
    // đó để hiển thị chỉ đăng vào group đó không?"). Chưa lưu lịch → dùng lịch mặc định.
    loadPostingPlan(client),
  ]);

  // Group chia sẻ theo LỊCH ĐĂNG CỐ ĐỊNH của ngày bài được đăng (trước đọc bản live xoay vòng).
  const groupsOfDay = (isoDatetime: string): string[] => {
    if (!isoDatetime) return [];
    const t = new Date(isoDatetime).getTime();
    if (!Number.isFinite(t)) return [];
    const vnDate = new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
    return groupsForDate(pp.plan, vnDate, pp.shareGroups);
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
  // 29/8 (user: "lên lịch mà nhảy sang đã đăng"): bài hẹn giờ có mkt_posts với published_at
  // TƯƠNG LAI (giờ hẹn) — chưa tới giờ thì vẫn là "Lên lịch", có ít nhất 1 bài đã tới giờ mới
  // sang "Trạng thái".
  const nowIso = new Date().toISOString();
  const hasLivePost = (cid: string) => (postsByContent.get(cid) || []).some((p) => p.at && p.at <= nowIso);
  const approvedWaiting = items.filter((it) => it.status === 'approved' && !hasLivePost(it.cid));
  const published = items
    .filter((it) => hasLivePost(it.cid))
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

  // 28/8 (user thay 4 cot bi tran card -> "gop Da dang va Tu choi thanh 1 khoi Trang thai"):
  // board 3 COT: Cho duyet | Len lich | Trang thai (4 bai Da dang + 4 bai Tu choi gan nhat,
  // dem tong that o countOverride). Card trong cot Trang thai render theo it.status.
  const statusItems = [...published.slice(0, PUB_CAP), ...rejected.slice(0, REJ_CAP)];
  const statusTotal = published.length + rejected.length;
  const columns: { key: string; label: string; icon: string; tone: string; items: QItem[]; cap: number; moreHref?: string; countOverride?: number }[] = [
    { key: 'pending', label: 'Chờ duyệt', icon: '📥', tone: 'pending', items: pending, cap: 50 },
    { key: 'scheduled', label: 'Lên lịch', icon: '⏰', tone: 'pending', items: approvedWaiting, cap: 10 },
    { key: 'status', label: 'Trạng thái', icon: '🗂️', tone: 'published', items: statusItems, cap: PUB_CAP + REJ_CAP, moreHref: '/noi-dung?loai=bai-viet', countOverride: statusTotal }
  ];

  return (
    <section>
      {/* 4/9: trang Vận hành + công tắc dừng khẩn đã bỏ hẳn — banner dừng khẩn không còn.
          Bảng chỉ còn cảnh báo KHI CẦN: có bài đã duyệt mà chưa lên kênh (kèm nút đăng lại FB). */}
      {/* 27/8: banner "da duyet chua len kenh" bo — thanh cot "Len lich" rieng tren board. */}

      {/* Board 4 cột theo dòng chảy bài viết, chiếm trọn chiều ngang. */}
      <div className="kanban-wrap">
        <div className="kanban">
          {columns.map((col) => (
            <div key={col.key} className="kanban-col">
              <div className={`kanban-head tone-${col.tone}`}>
                <span aria-hidden="true">{col.icon}</span>
                <span>{col.label}</span>
                <span className="n">{col.countOverride ?? col.items.length}</span>
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
                // 28/8: bài content có thể mang ảnh LINK NGOÀI (image_url, không lưu kho) — preview thẳng link.
                const imgUrl = (typeof p.assets?.image_url === 'string' && p.assets.image_url) || (typeof p.assets?.image === 'string' ? assetUrl.get(p.assets.image) : undefined);
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
                        {p.plan_time ? <span className="badge tone-default" title="Ô giờ trong Lịch đăng cố định">🗓 {String(p.plan_time).slice(11, 16)} · {CHANNEL_LABEL[(p.plan_channel === 'youtube' ? 'youtube' : p.plan_channel === 'tiktok' ? 'tiktok' : 'facebook') as 'facebook' | 'youtube' | 'tiktok']}{p.plan_group ? ` · 👥 ${p.plan_group}` : ''}</span> : null}
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
                              <video src={vidUrl} muted preload="none" />
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
                        defaultSchedule={typeof p.plan_time === 'string' && p.plan_channel !== 'tiktok' && isFutureVNLocal(p.plan_time, 15) ? String(p.plan_time) : ''}
                      />
                    </div>
                  );
                }

                // 27/8: cot "Len lich" — bai duyet roi, cho hen gio hoac dang dang len kenh.
                if (col.key === 'scheduled') {
                  const hasSched = !!it.scheduledAt;
                  const future = hasSched && isFutureVN(it.scheduledAt);
                  // 29/8 (user: "bài lên lịch t muốn coi được chứ không đứng yên"): thêm mục
                  // Xem bài — ảnh/video + nguyên văn nội dung sẽ đăng.
                  const schImg = (typeof p.assets?.image_url === 'string' && p.assets.image_url) || (typeof p.assets?.image === 'string' ? assetUrl.get(p.assets.image) : undefined);
                  const schVid = typeof p.assets?.video === 'string' ? assetUrl.get(p.assets.video) : undefined;
                  // 4/9 khuya: ô TikTok của lịch cố định — API không đăng được, người XUẤT TAY.
                  const tiktokOnly = chans.length > 0 && chans.every((x) => x === 'tiktok');
                  const tiktokLinked = !!(brief as any).tiktok_share_url;
                  const ttVideoVId = brief?.assets?.video_v as string | undefined;
                  const ttVideoUrl = ttVideoVId ? assetUrl.get(ttVideoVId) : undefined;
                  return (
                    <div key={it.qid} className="card tone-mkt" style={{ display: 'grid', gap: 6, padding: 12 }}>
                      <b>{title}</b>
                      <div className="badges">
                        {tiktokOnly ? (
                          <span className="badge tone-demo" title="TikTok không cho đăng qua API. Bấm Xuất TikTok để tải video dọc + copy caption, đăng trên app/web TikTok, rồi Ghép TikTok để hệ thống tính là đã đăng.">🎵 Chờ bạn xuất TikTok tay</span>
                        ) : hasSched ? (
                          <span className={`badge ${future ? 'tone-demo' : 'tone-ok'}`} title="Giờ hẹn đăng người duyệt đã chọn. Tới giờ máy tự đăng.">
                            ⏰ Hẹn {fmtSchedule(it.scheduledAt)}{future ? '' : ' (đang đăng)'}
                          </span>
                        ) : (
                          <span className="badge tone-demo" title="Đã duyệt, máy đang đăng lên kênh (1 tới 2 phút với video).">⏳ Đang đăng lên kênh</span>
                        )}
                        <span className="badge badge-format">📍 {channelsLabel(chans, p.post_reel === true)}</span>
                      </div>
                      {/* 29/8 (user: "bấm xem bài như bên chờ duyệt"): mở MODAL lớn ViewModal
                          thay vì xổ inline trong card. */}
                      <ViewModal title={title} label="👁 Xem bài">
                        {c?.draft ? <div className="draftbox">{c.draft}</div> : <p className="muted">Chưa có bản nháp.</p>}
                        {schImg || schVid ? (
                          <div className="modal-media">
                            {schImg ? <img src={schImg} alt="Ảnh bài viết" /> : null}
                            {schVid ? <video src={schVid} controls preload="none" playsInline /> : null}
                          </div>
                        ) : null}
                      </ViewModal>
                      {tiktokOnly && !tiktokLinked ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                          <span style={{ fontSize: '.75rem', minWidth: 76, color: 'var(--ink-2)' }}>🎵 TikTok</span>
                          {ttVideoUrl ? (
                            <ExportTiktokButton videoUrl={ttVideoUrl} caption={c?.draft || title} contentTitle={c?.title || 'sdvico'} />
                          ) : (
                            <span className="badge badge-video-pending" title="Máy đang dựng video dọc cho TikTok (10 tới 30 phút). Xong sẽ hiện nút Xuất TikTok.">🎬 Đang làm video AI</span>
                          )}
                          <LinkTikTokButton contentId={it.cid} linkedVideoId={(brief as any).tiktok_video_id || null} linkedShareUrl={(brief as any).tiktok_share_url || null} />
                          <CopyCaptionButton caption={c?.draft || title} />
                        </div>
                      ) : null}
                      {fbFailed.has(it.cid) ? (
                        <form action={retryFacebookPublish}>
                          <input type="hidden" name="content_id" value={it.cid} />
                          <button className="btn ghost sm" type="submit" title="Lượt đăng Facebook thất bại — bấm đăng lại (chạy nền 1 tới 2 phút)">↻ Đăng lại Facebook</button>
                        </form>
                      ) : null}
                    </div>
                  );
                }

                // Cot Trang thai: bai Tu choi render card gon (default cuoi), bai Da dang
                // render card day du ben duoi.
                if (col.key === 'status' && it.status !== 'rejected') {
                  const posts = postsByContent.get(it.cid) || [];
                  const m = metricsByContent.get(it.cid);
                  const fbPost = posts.find((x) => x.channel === 'facebook' && /^https?:/.test(x.url) && !/\/reel\//.test(x.url));
                  const lastAt = posts[0]?.at || '';
                  const ab = (brief.ab_variant as string | undefined) || (p.ab_variant as string | undefined);
                  // 29/8 (user: "thêm con mắt hiện layout xem như bên chờ duyệt"): xem lại
                  // ảnh/video + nguyên văn bài đã đăng ngay trên card.
                  const pubImg = (typeof p.assets?.image_url === 'string' && p.assets.image_url) || (typeof p.assets?.image === 'string' ? assetUrl.get(p.assets.image) : undefined);
                  const pubVid = typeof p.assets?.video === 'string' ? assetUrl.get(p.assets.video) : undefined;
                  return (
                    <div key={it.qid} className="card tone-web" style={{ display: 'grid', gap: 6, padding: 12 }}>
                      <b>{title}{ab ? <span className="badge badge-ab" style={{ marginLeft: 6 }} title="Bài thử của cặp A/B theo hướng đi kế hoạch.">🧪 Thử {ab}</span> : null}</b>
                      {(brief as any).insight_line ? <span className="insight-line" title={(brief as any).insight_situation || ''}><span aria-hidden="true">🎯</span> {(brief as any).insight_line}</span> : null}
                      {lastAt ? <span className="muted" style={{ fontSize: '.8rem' }}>Đăng {formatRelative(lastAt)}</span> : null}
                      <div className="ch-links">
                        {posts.filter((x) => /^https?:/.test(x.url)).map((x, i) => {
                          // 29/8 (user): chip Facebook GIỐNG TikTok — CHỈ hiện khi đã Ghép FB chính
                          // (brief.fb_real_url). Link page phụ vô nghĩa từ khi tắt kênh phụ, giấu đi;
                          // chưa ghép thì bấm nút "Ghép FB chính" ngay dưới card.
                          const fbReal = x.channel === 'facebook' ? String((brief as any).fb_real_url || '') : '';
                          if (x.channel === 'facebook' && !fbReal) return null;
                          const href = fbReal || x.url;
                          const label = fbReal ? 'FB SDVICO VN' : (CH_LABEL[x.channel] || x.channel);
                          return (
                            <a key={i} className="ch-link" href={href} target="_blank" rel="noreferrer" title={fbReal ? 'Mở bài trên Page chính SDVICO VN (đã ghép tay)' : `Xem bài trên ${CH_LABEL[x.channel] || x.channel}`}>
                              {isPlat(x.channel) ? <PlatformLogo platform={x.channel} size={15} /> : <span aria-hidden="true">🔗</span>}
                              <span>{label}</span>
                            </a>
                          );
                        })}
                        {/* 28/8 (user): bai da GHEP TAY video TikTok (brief.tiktok_video_id) —
                            hien icon TikTok nhu cac kenh khac, link mo video that. */}
                        {(brief as any).tiktok_video_id && (brief as any).tiktok_share_url && !posts.some((x) => x.channel === 'tiktok' && /^https?:/.test(x.url)) ? (
                          <a className="ch-link" href={String((brief as any).tiktok_share_url)} target="_blank" rel="noreferrer" title="Video TikTok đã ghép tay — xem trên TikTok">
                            <PlatformLogo platform="tiktok" size={15} />
                            <span>TikTok</span>
                          </a>
                        ) : null}
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
                      {/* 29/8 (user: "xoá mấy icon 👍💬👁▶️ đi — không hiển thị đúng"): số trên
                          card trộn nguồn cũ (kênh phụ) gây nhiễu — số chuẩn xem ở Đo lường.
                          Chỉ giữ 🎯 khách hỏi mua (đếm từ lead thật, luôn đúng). */}
                      {leadsByContent.get(it.cid) ? (
                        <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--ok)' }} title="Khách hỏi mua từ bài này (Zalo/inbox/gọi/gặp). BOSS ưu tiên bài ra nhiều Zalo hơn bài chỉ nhiều like.">🎯 {leadsByContent.get(it.cid)} khách hỏi</span>
                      ) : null}
                      <ViewModal title={title} label="👁 Xem bài">
                        {c?.draft ? <div className="draftbox">{c.draft}</div> : <p className="muted">Chưa có bản nháp.</p>}
                        {pubImg || pubVid ? (
                          <div className="modal-media">
                            {pubImg ? <img src={pubImg} alt="Ảnh bài viết" /> : null}
                            {pubVid ? <video src={pubVid} controls preload="none" playsInline /> : null}
                          </div>
                        ) : null}
                      </ViewModal>
                      {/* User 27/8 layout: chia 2 cột. TRÁI = Ghi Zalo/inbox + Chia sẻ group.
                          PHẢI = Xuất TikTok + Copy caption (dòng 1) + Ghép TikTok (dòng 2). */}
                      {it.cid ? (() => {
                        const cnt = contents.get(it.cid);
                        const linkedVid = (cnt?.brief as any)?.tiktok_video_id as string | undefined;
                        const linkedUrl = (cnt?.brief as any)?.tiktok_share_url as string | undefined;
                        const videoVId = cnt?.brief?.assets?.video_v as string | undefined;
                        const videoVUrl = videoVId ? assetUrl.get(videoVId) : null;
                        const hasVideo = !!videoVUrl;
                        // Ảnh tốt nhất để đính khi đăng FB tay: link ngoài (image_url) hoặc ảnh kho.
                        const fbImg = (typeof cnt?.brief?.assets?.image_url === 'string' && cnt.brief.assets.image_url)
                          || (typeof cnt?.brief?.assets?.image === 'string' ? assetUrl.get(cnt.brief.assets.image) : undefined);
                        // Ô soạn bài Page chính SDVICO VN (không cần page token). Đổi bằng env
                        // FB_MANUAL_COMPOSER_URL nếu Business Suite composer không mở đúng.
                        const fbComposerUrl = process.env.FB_MANUAL_COMPOSER_URL
                          || `https://business.facebook.com/latest/composer?asset_id=${process.env.FB_SUITE_ASSET_ID || '101052306114292'}`;
                        // 30/8 (user: "gộp các chức năng lại" — thẻ từng có 8 nút xổ 2 cột, trùng
                        // 2 nút Copy caption): sắp thành HÀNG THEO NỀN TẢNG, nhãn đầu hàng nói
                        // platform nên nút trong hàng rút gọn chữ; 1 nút Copy caption chung.
                        const rowStyle = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const };
                        const rowLabel = { fontSize: '.75rem', minWidth: 76, color: 'var(--ink-2)' };
                        const capText = cnt?.draft || cnt?.title || '';
                        return (
                          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={rowStyle}>
                              <span style={rowLabel}>📘 Facebook</span>
                              {/* Đăng TAY lên Page chính (copy caption + tải ảnh + mở ô soạn bài), khỏi page token. */}
                              <PostFbButton caption={capText} imageUrl={fbImg} composerUrl={fbComposerUrl} contentTitle={cnt?.title || 'sdvico'} />
                              {fbPost ? <ShareGroups postUrl={fbPost.url} planGroupsToday={groupsOfDay(lastAt)} /> : null}
                              {/* Dán link bài đăng tay trên Page chính SDVICOVN — chip FB ưu tiên link này. */}
                              <LinkFbButton contentId={it.cid} linkedUrl={String((cnt?.brief as any)?.fb_real_url || '') || null} />
                            </div>
                            {hasVideo ? (
                              <div style={rowStyle}>
                                <span style={rowLabel}>🎵 TikTok</span>
                                <ExportTiktokButton videoUrl={videoVUrl!} caption={capText} contentTitle={cnt?.title || 'sdvico'} />
                                <LinkTikTokButton contentId={it.cid} linkedVideoId={linkedVid || null} linkedShareUrl={linkedUrl || null} />
                              </div>
                            ) : null}
                            <div style={rowStyle}>
                              <AddLeadButton contentId={it.cid} />
                              <CopyCaptionButton caption={capText} />
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

              {/* 29/8 (user: "thêm chỗ xem tất cả bài như trước — sao xoá chi"): hiện LUÔN khi có
                  moreHref, không chờ vượt sức chứa cột. */}
              {col.moreHref ? (
                <Link className="src" href={col.moreHref} style={{ fontSize: '.85rem' }}>Xem tất cả {col.countOverride ?? col.items.length} bài</Link>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
