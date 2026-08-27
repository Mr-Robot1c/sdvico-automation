import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { isEmergencyStopped } from '../../lib/safety';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import PlatformLogo, { type PlatformKey } from '../noi-dung/platform-logo';

// 27/8 REDESIGN theo file "redesign web.docx" cua sep — trang TONG QUAN kieu ForLife Ops.
// v2 (feedback sep cung ngay): (1) icon kenh trong bang bam duoc -> mo bai tren nen tang do;
// (2) block "Tien do theo giai doan" rieng nhu anh (pipeline + 2 the Cho duyet / Da len lich);
// (3) Ke hoach hom nay doc DUNG DailyPlan (direction + sales + contentKind + groups);
// (4) bang Tat ca noi dung co filter Moi giai doan / Moi kenh / Moi ke hoach nhu anh.
export const dynamic = 'force-dynamic';

type QueueRow = { id: string; title: string | null; status: string; payload: any; created_at: string };
type PostRow = { content_id: string | null; channel: string; status: string; external_url: string | null; published_at: string | null };
type ContentRow = { id: string; title: string | null; brief: any; status: string; created_at: string };

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
// Gio hen tu payload.scheduled_at (dang local VN "YYYY-MM-DDTHH:mm") -> "HH:mm dd/mm".
function fmtSched(s: string): string {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}` : s;
}
function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

// Nhan "ke hoach" (campaign) cua 1 bai theo brief.generator.
function campaignOf(brief: any): string {
  const g = String(brief?.generator || '');
  if (g === 'rotation') return 'Kế hoạch tuần (vòng xoay)';
  if (g === 'trend') return 'Bài trend';
  if (g === 'seven-angles' || g === 'angles') return 'Bung 7 góc';
  if (g === 'manual-import') return 'Nhập tay từ Page';
  if (String(brief?.source || '') === 'reimport_facebook') return 'Nhập lại lịch sử';
  if (g) return g;
  return brief?.rotation_group ? `Vòng xoay · ${brief.rotation_group}` : 'Xưởng sản xuất';
}

export default async function Page({ searchParams }: { searchParams?: { q?: string; gd?: string; kenh?: string; kh?: string } }) {
  const client = getServerClient();
  const q = String(searchParams?.q || '').trim();
  const fGd = String(searchParams?.gd || '').trim();      // filter giai doan
  const fKenh = String(searchParams?.kenh || '').trim();  // filter kenh
  const fKh = String(searchParams?.kh || '').trim();      // filter ke hoach
  const now = Date.now();
  const since60 = new Date(now - 60 * 24 * 3600 * 1000).toISOString();
  const since7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

  let contentQuery = client
    .from('mkt_content')
    .select('id, title, brief, status, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (q) contentQuery = contentQuery.ilike('title', `%${q}%`);

  const [queueRes, postsRes, failedRes, contentRes, planAppliedRes, planLiveRes, leadsRes, emergencyStopped, yt] = await Promise.all([
    client
      .from('approval_queue')
      .select('id, title, status, payload, created_at')
      .eq('kind', 'mkt_publish_content')
      .gte('created_at', since60)
      .order('created_at', { ascending: false })
      .limit(400),
    client
      .from('mkt_posts')
      .select('content_id, channel, status, external_url, published_at')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(1000),
    client
      .from('mkt_posts')
      .select('content_id, channel, status, external_url, published_at')
      .eq('status', 'failed')
      .eq('channel', 'facebook')
      .order('id', { ascending: false })
      .limit(50),
    contentQuery,
    client
      .from('mkt_plans')
      .select('id, period_start, period_end, data, applied, created_at')
      .eq('applied', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('mkt_plans')
      .select('data, created_at')
      .eq('data->>origin', 'live')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('mkt_leads')
      .select('id, source, fb_user_name, message, created_at, status')
      .neq('status', 'spam')
      .gte('created_at', since7)
      .order('created_at', { ascending: false })
      .limit(100),
    isEmergencyStopped(client),
    getYouTubeChannelInfo(),
  ]);

  const queueRows = (queueRes.data || []) as QueueRow[];
  const posts = (postsRes.data || []) as PostRow[];
  const failedFb = (failedRes.data || []) as PostRow[];
  const contents = (contentRes.data || []) as ContentRow[];
  const leads = (leadsRes.data || []) as any[];

  // ---- Trang thai theo content id (tu queue + posts) ----
  const publishedCids = new Set(posts.map((p) => p.content_id).filter(Boolean) as string[]);
  const channelsByCid = new Map<string, Set<string>>();
  const urlByCidChannel = new Map<string, Map<string, string>>(); // cid -> channel -> external_url
  const firstPostAt = new Map<string, string>();
  for (const p of posts) {
    if (!p.content_id) continue;
    if (!channelsByCid.has(p.content_id)) channelsByCid.set(p.content_id, new Set());
    channelsByCid.get(p.content_id)!.add(p.channel);
    if (p.published_at && (!firstPostAt.has(p.content_id) || p.published_at < firstPostAt.get(p.content_id)!)) firstPostAt.set(p.content_id, p.published_at);
    if (p.external_url) {
      if (!urlByCidChannel.has(p.content_id)) urlByCidChannel.set(p.content_id, new Map());
      const m = urlByCidChannel.get(p.content_id)!;
      // TikTok external_url dang "tiktok:<publishId>" khong mo duoc — bo, dung brief.tiktok_share_url.
      if (!m.has(p.channel) && !String(p.external_url).startsWith('tiktok:')) m.set(p.channel, String(p.external_url));
    }
  }

  const queueByCid = new Map<string, QueueRow>();
  for (const r of queueRows) {
    const cid = String(r.payload?.content_id || '');
    if (cid && !queueByCid.has(cid)) queueByCid.set(cid, r);
  }

  const pending = queueRows.filter((r) => r.status === 'pending');
  const rejected = queueRows.filter((r) => r.status === 'rejected');
  const scheduled = queueRows.filter((r) => {
    if (r.status !== 'approved') return false;
    const s = String(r.payload?.scheduled_at || '');
    if (!s) return false;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return false;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5]) > now;
  });
  const pendingStale = pending.filter((r) => now - new Date(r.created_at).getTime() > 24 * 3600 * 1000);

  // Y tuong = huong di bai viet cua ban ke hoach dang ap.
  const appliedPlan = planAppliedRes.data as any;
  const ideaCount = Array.isArray(appliedPlan?.data?.content_suggestions) ? appliedPlan.data.content_suggestions.length : 0;

  // FB failed ma content chua co ban published nao tren facebook -> con ket that.
  const failedStuck = failedFb.filter((p) => p.content_id && !(channelsByCid.get(p.content_id) || new Set()).has('facebook'));
  const failedStuckCids = [...new Set(failedStuck.map((p) => p.content_id))] as string[];

  // Lead
  const leadNew = leads.filter((l) => String(l.status || 'new') === 'new');
  const today = todayVN();
  const dayStartIso = new Date(today + 'T00:00:00+07:00').toISOString();
  const leadToday = leads.filter((l) => String(l.created_at || '') >= dayStartIso);

  // Ke hoach hom nay (tu ban live) — doc DUNG shape DailyPlan (lib/plan.ts):
  // direction {title, product, variant} + sales[{product,count}] + contentKindLabel +
  // contentPurpose + groups[].
  const planLive = planLiveRes.data as any;
  const todaySchedule = Array.isArray(planLive?.data?.daily_schedule)
    ? planLive.data.daily_schedule.find((d: any) => d.date === today) || null
    : null;

  // Giai doan cua tung bai trong bang Tat ca noi dung.
  function stageOf(c: ContentRow): { key: string; cls: string; label: string } {
    const qr = queueByCid.get(c.id);
    if (publishedCids.has(c.id)) return { key: 'published', cls: 'stage-published', label: 'Đã đăng' };
    if (qr?.status === 'rejected') return { key: 'rejected', cls: 'stage-rejected', label: 'Từ chối' };
    if (qr?.status === 'approved') {
      const s = String(qr.payload?.scheduled_at || '');
      if (s) return { key: 'scheduled', cls: 'stage-scheduled', label: `Lên lịch ${fmtSched(s)}` };
      return { key: 'scheduled', cls: 'stage-scheduled', label: 'Đang đăng' };
    }
    if (qr?.status === 'pending') return { key: 'pending', cls: 'stage-pending', label: 'Chờ duyệt' };
    if (String(c.brief?.trend_generating) === 'true') return { key: 'draft', cls: 'stage-draft', label: 'Đang sinh' };
    return { key: 'draft', cls: 'stage-draft', label: 'Nháp' };
  }

  // Link mo bai tren tung nen tang cho icon kenh (user 27/8: "bam icon dan den link bai").
  function linkOf(c: ContentRow, ch: string): string | null {
    const fromPost = urlByCidChannel.get(c.id)?.get(ch);
    if (fromPost) return fromPost;
    if (ch === 'tiktok' && c.brief?.tiktok_share_url) return String(c.brief.tiktok_share_url);
    return null;
  }

  // ---- Filter bang Tat ca noi dung ----
  const allCampaigns = [...new Set(contents.map((c) => campaignOf(c.brief)))].sort();
  const filtered = contents.filter((c) => {
    if (fGd && stageOf(c).key !== fGd) return false;
    if (fKenh) {
      const chSet = new Set<string>([
        ...((Array.isArray(c.brief?.channels) ? c.brief.channels : []) as string[]),
        ...(channelsByCid.get(c.id) || []),
      ]);
      if (!chSet.has(fKenh)) return false;
    }
    if (fKh && campaignOf(c.brief) !== fKh) return false;
    return true;
  });
  const shown = filtered.slice(0, 60);

  const needCount = (pendingStale.length ? 1 : 0) + (failedStuckCids.length ? 1 : 0) + (emergencyStopped ? 1 : 0) + (yt.configured && yt.error ? 1 : 0) + (leadNew.length ? 1 : 0);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tổng quan</h1>
          <p className="sub">Dây chuyền nội dung SDVICO — bài đi từ Ý tưởng đến Đã đăng. Máy soạn, người bấm Duyệt mới đăng.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/noi-dung" className="btn ok">📥 Duyệt bài ({fmt(pending.length)})</Link>
          <Link href="/ke-hoach" className="btn ghost">🧭 Kế hoạch chi tiết</Link>
        </div>
      </header>

      {/* ===== 1. CAN LAM ===== */}
      <section className="blk" style={{ marginTop: 16 }}>
        <h2>🔔 Cần làm <span className="sub">({needCount} việc)</span></h2>
        {needCount === 0 ? (
          <p className="sub" style={{ margin: 0 }}>✅ Không có việc gấp. Dây chuyền đang chạy bình thường.</p>
        ) : (
          <div className="need-list">
            {emergencyStopped ? (
              <div className="need-item warn">
                <span>🛑</span>
                <span style={{ flex: 1 }}><b>Đang DỪNG KHẨN</b> — mọi lượt đăng bị chặn. <Link href="/van-hanh">Vào Vận hành để gỡ →</Link></span>
              </div>
            ) : null}
            {pendingStale.length ? (
              <div className="need-item warn">
                <span className="need-n">{fmt(pendingStale.length)}</span>
                <span style={{ flex: 1 }}>bài kẹt ở bước <b>Chờ duyệt</b> quá 24 giờ — duyệt hoặc từ chối để dây chuyền chạy tiếp. <Link href="/noi-dung">Mở Bảng bài viết →</Link></span>
              </div>
            ) : null}
            {failedStuckCids.length ? (
              <div className="need-item warn">
                <span className="need-n">{fmt(failedStuckCids.length)}</span>
                <span style={{ flex: 1 }}>bài đăng <b>Facebook thất bại</b> chưa đăng lại được — mở bài và bấm "Đăng lại Facebook". <Link href="/noi-dung">Mở Bảng bài viết →</Link></span>
              </div>
            ) : null}
            {yt.configured && yt.error ? (
              <div className="need-item warn">
                <span>▶️</span>
                <span style={{ flex: 1 }}><b>YouTube token lỗi</b>: {String(yt.error).slice(0, 120)}. Lấy token mới theo runbook. <Link href="/youtube">Trang YouTube →</Link></span>
              </div>
            ) : null}
            {leadNew.length ? (
              <div className="need-item">
                <span className="need-n">{fmt(leadNew.length)}</span>
                <span style={{ flex: 1 }}>người hỏi mua <b>chưa được liên hệ</b> — chuyển cho nhân viên kinh doanh. <Link href="/noi-dung?loai=khach-hang">Mở Khách hàng →</Link></span>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* ===== 2. TIEN DO THEO GIAI DOAN (dashboard nhu anh ForLife) ===== */}
      <section className="blk">
        <h2>📶 Tiến độ theo giai đoạn <span className="sub">bài chạy từ trái sang phải — ô đỏ là chỗ cần người động tay</span></h2>
        <div className="stage-flow">
          <Link href="/ke-hoach" className="stage-node" title="Hướng đi bài viết BOSS đề xuất trong bản kế hoạch đang áp">
            <b>{fmt(ideaCount)}</b><span>Ý tưởng</span>
          </Link>
          <span className="stage-sep" aria-hidden="true">→</span>
          <Link href="/noi-dung" className={`stage-node ${pending.length ? 'act' : ''}`} title="Bài chờ người bấm Duyệt">
            <b>{fmt(pending.length)}</b><span>Chờ duyệt</span>
          </Link>
          <span className="stage-sep" aria-hidden="true">→</span>
          <Link href="/noi-dung" className="stage-node" title="Bài đã duyệt kèm giờ hẹn, tới giờ máy tự đăng">
            <b>{fmt(scheduled.length)}</b><span>Đã lên lịch</span>
          </Link>
          <span className="stage-sep" aria-hidden="true">→</span>
          <Link href="/kenh" className="stage-node done" title="Bài đã đăng thật lên các kênh">
            <b>{fmt(publishedCids.size)}</b><span>Đã đăng</span>
          </Link>
          <span className="stage-sep" aria-hidden="true">·</span>
          <Link href="/noi-dung" className="stage-node" title="Bài bị người duyệt từ chối (60 ngày)">
            <b>{fmt(rejected.length)}</b><span>Từ chối</span>
          </Link>
        </div>
        {/* 2 the giai doan can dong tay, nhu anh ForLife ("Cho duyet: khong co muc nao"...). */}
        <div className="blk-cols" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="agent-card">
            <div className="ag-head"><span className="ag-name">📥 Chờ duyệt</span><span className="badge tone-demo">{fmt(pending.length)} bài</span></div>
            {pending.length === 0 ? (
              <p className="ag-role" style={{ margin: 0 }}>Trống — không bài nào đợi duyệt.</p>
            ) : (
              <div style={{ display: 'grid', gap: 4, fontSize: '.85rem' }}>
                {pending.slice(0, 3).map((r) => (
                  <div key={r.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {String(r.title || '(không tên)').slice(0, 70)}</div>
                ))}
                <Link href="/noi-dung" className="src" style={{ fontSize: '.82rem' }}>Duyệt ngay →</Link>
              </div>
            )}
          </div>
          <div className="agent-card">
            <div className="ag-head"><span className="ag-name">⏰ Đã lên lịch</span><span className="badge tone-demo">{fmt(scheduled.length)} bài</span></div>
            {scheduled.length === 0 ? (
              <p className="ag-role" style={{ margin: 0 }}>Chưa bài nào được xếp lịch đăng.</p>
            ) : (
              <div style={{ display: 'grid', gap: 4, fontSize: '.85rem' }}>
                {scheduled.slice(0, 3).map((r) => (
                  <div key={r.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    • {fmtSched(String(r.payload?.scheduled_at || ''))} — {String(r.title || '(không tên)').slice(0, 55)}
                  </div>
                ))}
                <Link href="/noi-dung" className="src" style={{ fontSize: '.82rem' }}>Xem bảng →</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== 3. NGUOI HOI MUA + KE HOACH HOM NAY ===== */}
      <div className="blk-cols">
        <section className="blk">
          <h2>🛒 Người hỏi mua <span className="sub">({fmt(leads.length)} trong 7 ngày · {fmt(leadToday.length)} hôm nay)</span></h2>
          {leads.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>Chưa có ai hỏi mua trong 7 ngày. Bài đăng đều + chia sẻ group để tăng tiếp cận.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {leads.slice(0, 6).map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: '.88rem', borderBottom: '1px dashed var(--line)', paddingBottom: 6 }}>
                  <span className={`badge ${String(l.status || 'new') === 'new' ? 'tone-no' : 'tone-ok'}`} style={{ flexShrink: 0 }}>
                    {String(l.status || 'new') === 'new' ? 'Mới' : String(l.status) === 'done' ? 'Xong' : 'Đã liên hệ'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{String(l.fb_user_name || 'Khách')}</b> · {String(l.message || '').slice(0, 60)}
                  </span>
                  <span className="sub" style={{ fontSize: '.75rem', flexShrink: 0 }}>{fmtDT(l.created_at)}</span>
                </div>
              ))}
              <Link href="/noi-dung?loai=khach-hang" className="src" style={{ fontSize: '.85rem' }}>Xem tất cả khách hàng →</Link>
            </div>
          )}
        </section>

        <section className="blk">
          <h2>📅 Kế hoạch hôm nay <span className="sub">{todaySchedule?.dow ? `· ${todaySchedule.dow} ${today.slice(8, 10)}/${today.slice(5, 7)}` : appliedPlan ? `· tuần ${String(appliedPlan.period_start || '').slice(5)} đến ${String(appliedPlan.period_end || '').slice(5)}` : ''}</span></h2>
          {todaySchedule ? (
            <div style={{ display: 'grid', gap: 8, fontSize: '.9rem' }}>
              {todaySchedule.direction?.title ? (
                <div className="need-item">
                  <span>🎯</span>
                  <span style={{ flex: 1 }}>
                    <b>Bài bán:</b> {String(todaySchedule.direction.title).slice(0, 120)}
                    <span className="sub" style={{ display: 'block', fontSize: '.8rem' }}>
                      Sản phẩm {String(todaySchedule.direction.product || '')}
                      {todaySchedule.direction.done ? ' · ✓ đã sinh' : ' · chưa sinh'}
                    </span>
                  </span>
                </div>
              ) : Array.isArray(todaySchedule.sales) && todaySchedule.sales.length ? (
                <div className="need-item">
                  <span>🎯</span>
                  <span style={{ flex: 1 }}><b>Bài bán:</b> {todaySchedule.sales.map((s: any) => `${s.product} (${s.count} bài)`).join(', ')}</span>
                </div>
              ) : null}
              {todaySchedule.contentKindLabel ? (
                <div className="need-item">
                  <span>📚</span>
                  <span style={{ flex: 1 }}>
                    <b>Bài content:</b> {String(todaySchedule.contentKindLabel)}
                    {todaySchedule.contentEmotion ? ` · chạm chữ ${String(todaySchedule.contentEmotion)}` : ''}
                    {todaySchedule.contentPurpose ? (
                      <span className="sub" style={{ display: 'block', fontSize: '.8rem' }}>{String(todaySchedule.contentPurpose).slice(0, 140)}</span>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {Array.isArray(todaySchedule.groups) && todaySchedule.groups.length ? (
                <div className="need-item">
                  <span>📣</span>
                  <span style={{ flex: 1 }}><b>Chia sẻ nhóm:</b> {todaySchedule.groups.join(' · ')}</span>
                </div>
              ) : null}
              <Link href="/ke-hoach" className="src" style={{ fontSize: '.85rem' }}>Xem kế hoạch tuần đầy đủ →</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <p className="sub" style={{ margin: 0 }}>Chưa đọc được lịch hôm nay từ bản kế hoạch sống.</p>
              <Link href="/ke-hoach" className="src" style={{ fontSize: '.85rem' }}>Mở trang Kế hoạch →</Link>
            </div>
          )}
        </section>
      </div>

      {/* ===== 4. TAT CA NOI DUNG ===== */}
      <section className="blk">
        <h2>
          📄 Tất cả nội dung
          <span className="sub">bài ở giai đoạn nào, đăng kênh đâu, thuộc kế hoạch gì — bấm icon kênh để mở bài thật</span>
        </h2>
        <form method="get" style={{ margin: '0 0 10px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="search" type="search" name="q" defaultValue={q} placeholder="Tìm theo tiêu đề bài..." style={{ maxWidth: 300, flex: '1 1 220px' }} />
          <select name="gd" defaultValue={fGd} className="note" style={{ maxWidth: 170 }}>
            <option value="">Mọi giai đoạn</option>
            <option value="draft">Nháp / đang sinh</option>
            <option value="pending">Chờ duyệt</option>
            <option value="scheduled">Lên lịch / đang đăng</option>
            <option value="published">Đã đăng</option>
            <option value="rejected">Từ chối</option>
          </select>
          <select name="kenh" defaultValue={fKenh} className="note" style={{ maxWidth: 150 }}>
            <option value="">Mọi kênh</option>
            <option value="facebook">Facebook</option>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="zalo">Zalo</option>
          </select>
          <select name="kh" defaultValue={fKh} className="note" style={{ maxWidth: 210 }}>
            <option value="">Mọi kế hoạch</option>
            {allCampaigns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn ghost sm" type="submit">Lọc</button>
          {q || fGd || fKenh || fKh ? <Link href="/tong-quan" className="src" style={{ fontSize: '.85rem' }}>Bỏ lọc</Link> : null}
        </form>
        <p className="sub" style={{ margin: '0 0 8px', fontSize: '.82rem' }}>Hiện {fmt(shown.length)} / {fmt(filtered.length)} bài khớp (trong 200 bài mới nhất).</p>
        <div className="tablewrap">
          <table className="datatable">
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th style={{ width: 160 }}>Giai đoạn</th>
                <th style={{ width: 120 }}>Kênh</th>
                <th style={{ width: 190 }}>Kế hoạch</th>
                <th style={{ width: 110 }}>Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const st = stageOf(c);
                const chSet = new Set<string>([
                  ...((Array.isArray(c.brief?.channels) ? c.brief.channels : []) as string[]),
                  ...(channelsByCid.get(c.id) || []),
                ]);
                const chs = ['facebook', 'youtube', 'tiktok', 'zalo'].filter((k) => chSet.has(k)) as PlatformKey[];
                const fbUrl = linkOf(c, 'facebook');
                return (
                  <tr key={c.id}>
                    <td className="cell-title">
                      {fbUrl ? (
                        <a href={fbUrl} target="_blank" rel="noreferrer" className="src" title="Mở bài trên Facebook"><b>{String(c.title || '(không tên)').slice(0, 90)}</b></a>
                      ) : (
                        <b>{String(c.title || '(không tên)').slice(0, 90)}</b>
                      )}
                    </td>
                    <td><span className={`stage-badge ${st.cls}`}>{st.label}</span></td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {chs.length ? chs.map((k) => {
                          const u = linkOf(c, k);
                          return u ? (
                            <a key={k} href={u} target="_blank" rel="noreferrer" title={`Mở bài trên ${k}`}>
                              <PlatformLogo platform={k} size={16} />
                            </a>
                          ) : (
                            <span key={k} title={`${k}: chưa có link bài (chưa đăng)`} style={{ opacity: 0.45 }}>
                              <PlatformLogo platform={k} size={16} />
                            </span>
                          );
                        }) : <span className="muted">—</span>}
                      </span>
                    </td>
                    <td className="sub" style={{ fontSize: '.82rem' }}>{campaignOf(c.brief)}</td>
                    <td className="sub" style={{ fontSize: '.82rem' }}>{fmtDT(firstPostAt.get(c.id) || c.created_at)}</td>
                  </tr>
                );
              })}
              {shown.length === 0 ? (
                <tr><td colSpan={5} className="sub" style={{ textAlign: 'center', padding: 20 }}>{q || fGd || fKenh || fKh ? 'Không có bài nào khớp bộ lọc.' : 'Chưa có bài nào.'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ margin: '10px 0 0', fontSize: '.85rem' }}>
          <Link href="/noi-dung" className="src">Mở Bảng bài viết để duyệt/sửa/xoá →</Link>
          {' · '}
          <Link href="/noi-dung?loai=bai-viet" className="src">Danh sách đầy đủ →</Link>
          {' · '}
          <Link href="/noi-dung?loai=thung-rac" className="src">Thùng rác →</Link>
        </p>
      </section>
    </main>
  );
}
