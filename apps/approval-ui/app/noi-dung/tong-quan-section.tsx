import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { fbStatus, tiktokStatus } from '../../lib/platform-status';
import { getTikTokVideoCount } from '../../lib/tiktok';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import { zaloOaStatus } from '../../lib/zalo-oa';
import PlatformLogo from './platform-logo';
import PlanQuickView from './plan-quick-view';
import LeadQuickView, { type QuickLead } from './lead-quick-view';
import PullMetricsButton from './pull-metrics-button';

// TỔNG QUAN thiết kế lại (user 21/8 đêm, nhắc lại yêu cầu gốc): một trang tổng quát để xem
// cho đỡ rối mắt — mỗi NỀN TẢNG một thẻ: đang làm tốt cỡ nào (thông số react, cmt, view),
// chạy tới đâu (bao nhiêu bài, gần nhất khi nào), bấm cả thẻ để xem chi tiết. Kanban duyệt
// bài nằm ở tab "Bảng bài viết" riêng, không nhét vào đây.

type M = { reactions?: number; comments?: number; shares?: number; views?: number };

function fmtVNDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23'
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}`;
}

export default async function TongQuanSection() {
  const client = getServerClient();

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const todayStartIso = new Date(new Date(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) + 'T00:00:00+07:00')).toISOString();
  const [fb, tt, yt, za, ttVideoCount, postsRes, metricsRes, pendingRes, logRes, planRes, leadsRes, leadsTodayRes] = await Promise.all([
    fbStatus(),
    tiktokStatus(),
    getYouTubeChannelInfo(),
    zaloOaStatus(client),
    // Số video THỰC trên profile TikTok qua Display API (user 26/8: "không còn dựa vào số bài
    // đăng trên tiktok nữa à" — thay đếm mkt_posts bằng số thực). Null = API fail → fallback.
    getTikTokVideoCount(client),
    client
      .from('mkt_posts')
      .select('channel, published_at')
      .eq('status', 'published')
      .is('deleted_at', null)
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
      .eq('status', 'pending'),
    client
      .from('run_log')
      .select('task, status, detail, created_at')
      .in('task', ['mkt.rotate', 'mkt.publish_facebook_ui', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull', 'mkt.live_apply', 'mkt.direction_rejected'])
      .order('created_at', { ascending: false })
      .limit(40),
    // Bản kế hoạch đang áp (user 24/8: "cần thể hiện ngày lên plan").
    // Ưu tiên bản LIVE (có daily_schedule 7 ngày cập nhật mỗi 30 phút) hơn bản manual/weekly
    // vì user 26/8 chốt: "hiện kế hoạch NGÀY HÔM ĐÓ", cần daily_schedule[today].
    client
      .from('mkt_plans')
      .select('created_at, generated_by, data')
      .eq('data->>origin', 'live')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Số người hỏi mua bắt được trong 7 ngày qua (user: "khối đó có bao nhiêu người hay sao đó").
    client
      .from('mkt_leads')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'spam')
      .gte('created_at', sevenDaysAgoIso),
    // Riêng HÔM NAY, cho tile đầu trang (24/8: theo mẫu "Lead mới hôm nay"). User 26/8: tile
    // này bấm mở MODAL xem lead ngay tại Tổng quan, không navigate — nên lấy full field cho
    // modal chứ không chỉ count. Limit 50 (hôm nay hiếm khi vượt).
    client
      .from('mkt_leads')
      .select('id, source, fb_user_name, fb_profile_url, message, created_at, content_id', { count: 'exact' })
      .neq('status', 'spam')
      .gte('created_at', todayStartIso)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Bài đã đăng theo kênh + lần đăng gần nhất.
  const byChannel = new Map<string, { count: number; lastAt: string }>();
  for (const p of postsRes.data || []) {
    const ch = (p as any).channel as string;
    const at = (p as any).published_at as string | null;
    const e = byChannel.get(ch) || { count: 0, lastAt: '' };
    e.count += 1;
    if (!e.lastAt && at) e.lastAt = at;
    byChannel.set(ch, e);
  }
  const totalPosted = [...byChannel.values()].reduce((s, e) => s + e.count, 0);

  // Số liệu mới nhất mỗi bài, tách Facebook / YouTube. entity_ref '__*' là số page-level.
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
  let yViews = 0, yLikes = 0, yComments = 0;
  for (const m of ytLatest.values()) {
    yViews += m.views || 0;
    yLikes += m.reactions || 0;
    yComments += m.comments || 0;
  }
  const tEngagement = tReactions + tComments + tShares + yLikes + yComments;
  const pendingCount = pendingRes.count || 0;
  const leadCount = leadsRes.count || 0;
  const leadTodayCount = leadsTodayRes.count || 0;
  const planRow = planRes.data as any;
  const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

  // Build danh sách lead hôm nay cho LeadQuickView (modal xem nhanh ở tile Tổng quan).
  // Query nhỏ join content title vì mkt_leads chỉ có content_id, không có tiêu đề bài.
  const leadsTodayRaw = (leadsTodayRes.data || []) as any[];
  const leadContentIds = [...new Set(leadsTodayRaw.map((l) => l.content_id).filter(Boolean))] as string[];
  const leadContentTitle = new Map<string, string>();
  if (leadContentIds.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', leadContentIds);
    for (const c of cs || []) leadContentTitle.set((c as any).id, (c as any).title || '(không tên)');
  }
  const leadsToday: QuickLead[] = leadsTodayRaw.map((l) => ({
    id: String(l.id),
    source: String(l.source || ''),
    fbUserName: (l.fb_user_name as string) || null,
    fbProfileUrl: (l.fb_profile_url as string) || null,
    message: String(l.message || ''),
    createdAt: String(l.created_at || ''),
    contentTitle: l.content_id ? (leadContentTitle.get(l.content_id) || null) : null,
  }));

  const fbPosts = byChannel.get('facebook') || { count: 0, lastAt: '' };
  const ytPosts = byChannel.get('youtube') || { count: 0, lastAt: '' };
  const ttPostsBot = byChannel.get('tiktok') || { count: 0, lastAt: '' };
  // Tile TikTok ưu tiên số THỰC từ Display API (đúng với profile). Fallback về đếm mkt_posts
  // (soft-delete deleted_at) nếu API fail — vẫn cần đếm mkt_posts để user mark tay được.
  const ttCount = (typeof ttVideoCount === 'number') ? ttVideoCount : ttPostsBot.count;
  const ttFromApi = typeof ttVideoCount === 'number';
  const ttPosts = { count: ttCount, lastAt: ttPostsBot.lastAt };
  const ytOk = !!(yt.configured && yt.channelTitle);

  // BÀI NỔI BẬT: gộp CẢ Facebook lẫn YouTube của cùng một bài (user 21/8: "xếp hạng sai sai"
  // — bài có 200 lượt xem YouTube mà hiện 5 và thua bài 45). Xếp theo tương tác, bằng nhau
  // thì bài nhiều lượt xem đứng trên.
  const scoreByCid = new Map<string, { eng: number; views: number }>();
  for (const [cid, m] of latest) {
    const e = scoreByCid.get(cid) || { eng: 0, views: 0 };
    e.eng += (m.reactions || 0) + (m.comments || 0) + (m.shares || 0);
    e.views += m.views || 0;
    scoreByCid.set(cid, e);
  }
  for (const [cid, m] of ytLatest) {
    const e = scoreByCid.get(cid) || { eng: 0, views: 0 };
    e.eng += (m.reactions || 0) + (m.comments || 0);
    e.views += m.views || 0;
    scoreByCid.set(cid, e);
  }
  const topIds = [...scoreByCid.entries()]
    .map(([cid, e]) => ({ cid, eng: e.eng, views: e.views }))
    .sort((a, b) => b.eng - a.eng || b.views - a.views)
    .slice(0, 3);
  const topTitles = new Map<string, string>();
  if (topIds.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', topIds.map((t) => t.cid));
    for (const c of cs || []) topTitles.set((c as any).id, (c as any).title || '(không tên)');
  }

  // HOẠT ĐỘNG GẦN ĐÂY: dịch run_log ra câu người đọc được, bỏ các lượt trống.
  const activity: Array<{ at: string; text: string }> = [];
  for (const r of (logRes.data || []) as any[]) {
    if (activity.length >= 6) break;
    const d = r.detail || {};
    let text = '';
    if (r.task === 'mkt.rotate' && r.status === 'ok' && (d.created || 0) > 0) text = `🤖 Máy sinh ${d.created} bài mới${d.videoTriggered ? ', đã kích dựng video' : ''}`;
    else if (r.task === 'mkt.publish_facebook_ui' && r.status === 'ok') text = '📘 Đăng bài lên Facebook';
    else if (r.task === 'mkt.publish_youtube' && r.status === 'ok') text = '▶️ Đăng video lên YouTube Shorts';
    else if (r.task === 'mkt.publish_tiktok' && r.status === 'ok') text = '🎵 Đăng video lên TikTok';
    else if (r.task === 'mkt.metrics_pull' && r.status === 'ok' && ((d.pulled || 0) > 0 || (d.ytPulled || 0) > 0)) text = `📈 Kéo số liệu (${d.pulled || 0} bài Facebook${d.ytPulled ? `, ${d.ytPulled} video YouTube` : ''})`;
    else if (r.task === 'mkt.live_apply' && r.status === 'ok') text = '🧭 BOSS áp trọng số buổi tối';
    else if (r.task === 'mkt.direction_rejected') text = '⛔ Loại một hướng đi (bản thử bị từ chối)';
    if (text) activity.push({ at: r.created_at, text });
  }

  return (
    <section>
      {/* Nút kéo số liệu tay - user 26/8 khong muon cho cron 1h/lan. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <PullMetricsButton size="sm" />
      </div>
      {/* Hàng số tổng, nhìn 3 giây biết sức khỏe hệ thống. 24/8 (user "gộp lượt xem/follower
          vào ô nền tảng đi, dư thừa chả được mẹ gì"): Lượt xem video + Người theo dõi Page
          đã BỎ khỏi hàng này — số đó đã hiện sẵn trong pf-card Facebook/YouTube bên dưới,
          để cả 2 chỗ là trùng lặp. Hàng này giữ 4 số KHÔNG trùng ở đâu khác: bài đăng, tương
          tác, bài chờ xử lý, lead mới hôm nay — cộng ô Kế hoạch mở modal xem nhanh. */}
      <div className="board-top">
        <div className="board-stat">
          <div className="stat-lbl">Bài đã đăng (mọi kênh)</div>
          <div className="stat-num">{fmt(totalPosted)}</div>
        </div>
        <div className="board-stat">
          <div className="stat-lbl">Tổng tương tác</div>
          <div className="stat-num">{fmt(tEngagement)}</div>
        </div>
        <Link href="/noi-dung?loai=bang" className="board-stat" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="stat-lbl">Bài chờ duyệt</div>
          <div className="stat-num">{fmt(pendingCount)}</div>
        </Link>
        <LeadQuickView leads={leadsToday} count={leadTodayCount} />
        <PlanQuickView todayPlan={(() => {
          if (!planRow) return null;
          const vnToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
          const schedule = Array.isArray(planRow.data?.daily_schedule) ? planRow.data.daily_schedule : [];
          const today = schedule.find((d: any) => d.date === vnToday) || null;
          return today;
        })()} />
      </div>

      {/* Bài chờ duyệt: chỉ nhắc khi có, bấm qua Bảng bài viết để xử. */}
      {pendingCount > 0 ? (
        <div className="pending-callout">
          <span>📥 <b>{fmt(pendingCount)}</b> bài đang chờ duyệt.</span>
          <Link className="btn sm ok" href="/noi-dung?loai=bang">Mở Bảng bài viết</Link>
        </div>
      ) : null}

      {/* Playbook 26/8 item 4 - CANH BAO PHAN PHOI: Page ~8 follower thi reach tu nhien
          gan bang 0, noi dung tot may cung khong toi ba con. Chi hien khi followers < 100
          (chua "hoc" thuat toan). Nhac 4 kenh phan phoi ngoai reach tu nhien. */}
      {followers > 0 && followers < 100 ? (
        <div className="pending-callout" style={{ background: '#fff8e1', border: '1px solid #f59e0b', color: '#92400e' }}>
          <span style={{ flex: 1 }}>
            ⚠️ <b>Page mới chỉ {fmt(followers)} người theo dõi</b> — reach tự nhiên rất thấp. Nội dung tốt cần thêm 4 kênh phân phối:
            <br />
            <span style={{ fontSize: '.85rem' }}>
              1. Chia sẻ bài vào <b>group mua bán tàu thuyền theo vùng</b> (dùng nút "Chia sẻ vào nhóm" trên card bài) ·
              2. Mời bạn thuyền/khách cũ <b>follow Page</b> ·
              3. Chạy <b>quảng cáo địa phương</b> nhắm chủ tàu quanh cảng (FB Ads) ·
              4. Dùng <b>Zalo OA</b> giữ khách đã liên hệ (nhập lead vào bài để BOSS học).
            </span>
          </span>
        </div>
      ) : null}

      {/* Mỗi nền tảng một thẻ: trạng thái, chạy tới đâu, thông số. Bấm cả thẻ xem chi tiết. */}
      <div className="pf-grid">
        <Link className="pf-card" href="/do-luong" title="Bấm xem số liệu chi tiết từng bài">
          <div className="pf-head">
            <span className="pf-icon facebook" aria-hidden="true"><PlatformLogo platform="facebook" size={24} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="pf-name">Facebook</span>
            </span>
            <span className={`badge ${fb.ok ? 'tone-ok' : 'tone-no'}`}>{fb.ok ? 'Đang chạy' : 'Cần cấu hình'}</span>
          </div>
          <p className="pf-run">
            {fbPosts.count
              ? `Đã đăng ${fmt(fbPosts.count)} bài, gần nhất ${fmtVNDateTime(fbPosts.lastAt)}. Máy tự đăng khi bấm Duyệt.`
              : 'Chưa có bài nào. Máy tự đăng khi bấm Duyệt.'}
          </p>
          <div className="pf-stats">
            <span className="pf-stat"><b>{fmt(fbPosts.count)}</b><span>Số bài viết</span></span>
            <span className="pf-stat"><b>{fmt(tReactions)}</b><span>Like</span></span>
            <span className="pf-stat"><b>{fmt(tComments)}</b><span>Comment</span></span>
            <span className="pf-stat"><b>{fmt(tViews)}</b><span>Lượt xem</span></span>
          </div>
          {followers ? <p className="pf-note">📣 {fmt(followers)} người theo dõi Page</p> : null}
          <div className="pf-foot"><span>Xem số liệu từng bài</span><span aria-hidden="true">→</span></div>
        </Link>

        <Link className="pf-card" href="/do-luong" title="Bấm xem số liệu chi tiết từng video">
          <div className="pf-head">
            <span className="pf-icon youtube" aria-hidden="true"><PlatformLogo platform="youtube" size={24} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="pf-name">YouTube Shorts</span>
            </span>
            <span className={`badge ${ytOk ? 'tone-ok' : 'tone-no'}`}>{ytOk ? 'Đang chạy' : 'Cần cấu hình'}</span>
          </div>
          <p className="pf-run">
            {ytOk
              ? `Kênh ${yt.channelTitle}. ${ytPosts.count ? `Đã đăng ${fmt(ytPosts.count)} video, gần nhất ${fmtVNDateTime(ytPosts.lastAt)}.` : 'Chưa có video nào.'} Bản dọc tự đăng khi bấm Duyệt.`
              : yt.configured
                ? `Token lỗi: ${yt.error || 'không rõ'}. Chế độ Testing hết hạn sau 7 ngày, lấy token mới theo runbook.`
                : 'Chưa cấu hình 3 biến YOUTUBE_* trên Vercel.'}
          </p>
          <div className="pf-stats">
            <span className="pf-stat"><b>{fmt(ytPosts.count)}</b><span>Video đã đăng</span></span>
            <span className="pf-stat"><b>{fmt(yViews)}</b><span>Lượt xem</span></span>
            <span className="pf-stat"><b>{fmt(yLikes)}</b><span>Like</span></span>
            <span className="pf-stat"><b>{fmt(yComments)}</b><span>Comment</span></span>
          </div>
          <div className="pf-foot"><span>Xem số liệu từng video</span><span aria-hidden="true">→</span></div>
        </Link>

        <Link className="pf-card" href="/tiktok" title="Bấm xem trạng thái kết nối TikTok">
          <div className="pf-head">
            <span className="pf-icon tiktok" aria-hidden="true"><PlatformLogo platform="tiktok" size={24} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="pf-name">TikTok</span>
            </span>
            <span className={`badge ${tt.ok ? 'tone-demo' : 'tone-no'}`}>{tt.ok ? 'Chờ audit' : 'Cần cấu hình'}</span>
          </div>
          <p className="pf-run">
            {tt.ok
              ? `${ttPosts.count ? `${ttFromApi ? 'Trên kênh có' : 'Đã đăng'} ${fmt(ttPosts.count)} video${ttFromApi ? '' : ' (chế độ riêng tư)'}. ` : ''}App chưa qua audit nên video chỉ đăng riêng tư, qua audit mới công khai và đo được số liệu.`
              : tt.text}
          </p>
          <div className="pf-stats three">
            <span className="pf-stat"><b>{fmt(ttPosts.count)}</b><span>Video đã đăng</span></span>
            <span className="pf-stat"><b>—</b><span>Lượt xem</span></span>
            <span className="pf-stat"><b>—</b><span>Like</span></span>
          </div>
          <div className="pf-foot"><span>Xem kết nối và audit</span><span aria-hidden="true">→</span></div>
        </Link>

        <Link className="pf-card" href="/ket-noi" title="Bấm xem hướng dẫn thiết lập Zalo OA">
          <div className="pf-head">
            <span className="pf-icon zalo" aria-hidden="true"><PlatformLogo platform="zalo" size={24} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="pf-name">Zalo OA</span>
            </span>
            <span className={`badge ${za.configured ? 'tone-ok' : 'tone-demo'}`}>{za.configured ? 'Đang chạy' : 'Chờ thiết lập'}</span>
          </div>
          <p className="pf-run">
            {za.configured ? za.text : 'Khung đã dựng xong, chờ xác thực OA và lấy token theo runbook Zalo.'}
          </p>
          <div className="pf-stats three">
            <span className="pf-stat"><b>0</b><span>Bài đã đăng</span></span>
            <span className="pf-stat"><b>—</b><span>Lượt xem</span></span>
            <span className="pf-stat"><b>—</b><span>Quan tâm</span></span>
          </div>
          <div className="pf-foot"><span>Xem thiết lập</span><span aria-hidden="true">→</span></div>
        </Link>
      </div>

      {/* Lấp phần dưới trang (user 21/8: "còn dư 1 khúc trống trải"): bài nổi bật + nhật ký máy. */}
      <div className="tq-cols">
        <div className="tq-panel">
          <b>🔥 Bài nổi bật</b>
          {topIds.length === 0 ? (
            <p className="sub" style={{ margin: '8px 0 0' }}>Chưa có bài nào có số liệu.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {topIds.map((t, i) => (
                <Link key={t.cid} href="/do-luong" className="tq-item" title="Bấm xem số liệu chi tiết">
                  <span className="tq-rank" aria-hidden="true">{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="tq-item-title">{topTitles.get(t.cid) || '(không tên)'}</span>
                    <span className="sub" style={{ display: 'block', fontSize: '.78rem' }}>
                      {fmt(t.eng)} tương tác, {fmt(t.views)} lượt xem
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="tq-panel">
          <b>🕒 Máy vừa làm gì</b>
          {activity.length === 0 ? (
            <p className="sub" style={{ margin: '8px 0 0' }}>Chưa có hoạt động nào được ghi.</p>
          ) : (
            <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
              {activity.map((a, i) => (
                <div key={i} className="tq-act">
                  <span>{a.text}</span>
                  <span className="muted" style={{ marginLeft: 'auto', whiteSpace: 'nowrap', fontSize: '.78rem' }}>{fmtVNDateTime(a.at)}</span>
                </div>
              ))}
            </div>
          )}
          <Link className="src" href="/du-lieu-ai" style={{ display: 'inline-block', marginTop: 10, fontSize: '.85rem' }}>Xem các AI đang học gì</Link>
        </div>
        {/* Theo dõi người mua (user 24/8): số người hỏi mua bắt được tuần qua, bấm xem chi tiết. */}
        <div className="tq-panel">
          <b>👥 Người hỏi mua (7 ngày qua)</b>
          <div style={{ marginTop: 10 }}>
            <div className="stat-num" style={{ fontSize: '2rem' }}>{fmt(leadCount)}</div>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Bắt tự động từ comment Facebook dưới bài đăng (tin nhắn inbox đang chờ Facebook duyệt quyền).
            </p>
          </div>
          <Link className="src" href="/khach-hang" style={{ display: 'inline-block', marginTop: 10, fontSize: '.85rem' }}>Xem danh sách →</Link>
        </div>
      </div>

    </section>
  );
}
