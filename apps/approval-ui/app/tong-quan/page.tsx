import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import PlatformLogo, { type PlatformKey } from '../noi-dung/platform-logo';
import PageSuiteBlock from '../do-luong/page-suite-block';
import { buildTodayView, TODAY_STAGE_LABEL } from '../../lib/today-plan';
import { CHANNEL_LABEL, DOW_LONG } from '../../lib/posting-plan';

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

  // 200 bai moi nhat, KHONG ilike o DB — q loc bang JS de tile "Da viet" khong lech khi search.
  const contentQuery = client
    .from('mkt_content')
    .select('id, title, brief, status, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  const [queueRes, postsRes, failedRes, contentRes, planAppliedRes, todayView, leadsRes, yt] = await Promise.all([
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
    buildTodayView(client),
    client
      .from('mkt_leads')
      .select('id, source, fb_user_name, message, created_at, status, content_id')
      .neq('status', 'spam')
      .gte('created_at', since7)
      .order('created_at', { ascending: false })
      .limit(100),
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

  // 29/8 (sếp: "đem đo lường và báo cáo tuần ra tổng quan"): số liệu TUẦN NÀY (kênh chính,
  // buildWeekReport offset 0) + đếm lượt đăng hôm nay + sức khoẻ Trang từ bộ quét Business Suite.
  let week: any = null;
  try {
    const { buildWeekReport } = await import('../../lib/week-report');
    week = await buildWeekReport(client, 0);
  } catch { /* thiếu số liệu thì block tự ẩn */ }
  const { count: postsTodayCount } = await client
    .from('mkt_posts').select('id', { count: 'exact', head: true })
    .eq('status', 'published').gte('published_at', dayStartIso).lte('published_at', new Date().toISOString());
  const { data: pageScans } = await client
    .from('mkt_metrics').select('metrics, created_at')
    .eq('source', 'facebook').eq('entity_ref', '__page_real__')
    .not('metrics->suite28', 'is', null)
    .order('created_at', { ascending: false }).limit(30);
  const scanList = (pageScans || []) as any[];
  const scanCur = scanList[0]?.metrics || null;
  const scanPrev = (scanList.find((r: any) => String(r.created_at) < dayStartIso) as any)?.metrics || null;
  const vnI = (n: number | null | undefined) => Number(n || 0).toLocaleString('vi-VN');
  const deltaTag = (v: number) => (!v ? null : (
    <span className={`sub ${v > 0 ? 'delta-up' : 'delta-down'}`} style={{ fontSize: '.78rem', marginLeft: 4 }}>{v > 0 ? '▲' : '▼'} {Math.abs(v)}%</span>
  ));

  // 27/8 dot 2 (docx sep: "nguoi hoi mua danh cho so nguoi cmt tren cac bai... de ghi nhan
  // don lead"): dem lead theo TUNG BAI (content_id) -> bai nao hut khach nhat 7 ngay.
  const leadByCid = new Map<string, number>();
  for (const l of leads) {
    const cid = String(l.content_id || '');
    if (cid) leadByCid.set(cid, (leadByCid.get(cid) || 0) + 1);
  }
  const topLeadPosts = [...leadByCid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const leadPostTitles = new Map<string, string>();
  if (topLeadPosts.length) {
    const { data: lp } = await client.from('mkt_content').select('id, title').in('id', topLeadPosts.map(([cid]) => cid));
    for (const c of lp || []) leadPostTitles.set(String((c as any).id), String((c as any).title || '(không tên)'));
  }

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
  // 29/8 (user): Facebook GIỐNG TikTok — CHỈ có link khi đã Ghép FB chính (fb_real_url);
  // link page phụ vô nghĩa từ khi tắt kênh phụ, không fallback nữa (icon mờ khi chưa ghép).
  function linkOf(c: ContentRow, ch: string): string | null {
    if (ch === 'facebook') return c.brief?.fb_real_url ? String(c.brief.fb_real_url) : null;
    const fromPost = urlByCidChannel.get(c.id)?.get(ch);
    if (fromPost) return fromPost;
    if (ch === 'tiktok' && c.brief?.tiktok_share_url) return String(c.brief.tiktok_share_url);
    return null;
  }

  // "Da viet" = bai da viet xong con nam o buoc nhap/dang sinh (chua vao duyet, chua dang).
  const writtenCount = contents.filter((c) => stageOf(c).key === 'draft').length;

  // ---- Filter bang Tat ca noi dung (q loc JS — xem ghi chu o query) ----
  const allCampaigns = [...new Set(contents.map((c) => campaignOf(c.brief)))].sort();
  const qLower = q.toLowerCase();
  const filtered = contents.filter((c) => {
    if (qLower && !String(c.title || '').toLowerCase().includes(qLower)) return false;
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
  const shown = filtered.slice(0, 30);
  const hasFilter = !!(q || fGd || fKenh || fKh);

  const needCount = (pendingStale.length ? 1 : 0) + (failedStuckCids.length ? 1 : 0) + (yt.configured && yt.error ? 1 : 0) + (leadNew.length ? 1 : 0);

  const stageCls = (s: string) => ({ waiting: 'stage-waiting', missed: 'stage-missed', draft: 'stage-draft', pending: 'stage-pending', scheduled: 'stage-scheduled', manual: 'stage-manual', published: 'stage-published', rejected: 'stage-rejected' } as Record<string, string>)[s] || 'stage-draft';
  const todayLabel = `${DOW_LONG[todayView.dowIdx]} ${today.slice(8, 10)}/${today.slice(5, 7)}`;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tổng quan</h1>
          <p className="sub">Hôm nay đăng gì, giờ nào, kênh nào. Máy soạn, người bấm Duyệt mới đăng.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/noi-dung" className="btn ok">📥 Duyệt bài ({fmt(pending.length)})</Link>
          <Link href="/san-xuat" className="btn ghost">➕ Thêm bài ngoài lịch</Link>
          <Link href="/ke-hoach#lich-dang" className="btn ghost">🗓 Sửa lịch đăng</Link>
        </div>
      </header>

      {/* ===== 1. CẦN LÀM — chỉ hiện khi có việc; không có thì 1 dòng xanh ===== */}
      {needCount === 0 ? (
        <p className="ok-line"><span aria-hidden="true">✅</span> Không có việc gấp. Dây chuyền đang chạy bình thường.</p>
      ) : (
        <section className="blk tone-red" style={{ marginTop: 16 }}>
          <h2><span aria-hidden="true">🔔</span> Cần làm <span className="sub">({needCount} việc)</span></h2>
          <div className="need-list">
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
        </section>
      )}

      {/* ===== 2. KẾ HOẠCH HÔM NAY — bảng giờ · kênh · group · bài · trạng thái ===== */}
      <section className="blk tone-accent">
        <h2>
          <span aria-hidden="true">📅</span> Kế hoạch hôm nay{' '}
          <span className="sub">· {todayLabel} · {fmt(todayView.counts.total)} bài theo lịch{todayView.overridden ? ' · ✏️ lịch riêng hôm nay' : ''}{!todayView.saved ? ' · lịch mặc định (chưa lưu)' : ''}</span>
        </h2>
        {todayView.rows.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Hôm nay lịch không có bài nào. <Link href="/ke-hoach#lich-dang" className="src">Sửa lịch đăng →</Link></p>
        ) : (
          <div className="tablewrap">
            <table className="datatable today-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Giờ</th>
                  <th style={{ width: 150 }}>Kênh</th>
                  <th style={{ width: 170 }}>Chia sẻ group</th>
                  <th>Bài</th>
                  <th style={{ width: 170 }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {todayView.rows.map((r, i) => (
                  <tr key={i} className={`today-row ${r.stage === 'published' ? 'is-done' : ''}`}>
                    <td className="today-time">{r.slot.time}</td>
                    <td>
                      <span className={`ch-chip ${r.slot.channel}`}>
                        <PlatformLogo platform={r.slot.channel} size={14} /> {CHANNEL_LABEL[r.slot.channel]}
                      </span>
                      <div className="sub" style={{ fontSize: '.78rem', marginTop: 2 }}>{r.slot.kind === 'sale' ? 'Bài bán' : 'Bài content'}</div>
                    </td>
                    <td>{r.slot.group_label ? <span className="ch-chip group">👥 {r.slot.group_label}</span> : <span className="muted">—</span>}</td>
                    <td className="cell-title">
                      {r.title ? (
                        r.publishedUrl
                          ? <a href={r.publishedUrl} target="_blank" rel="noreferrer" className="src" title="Mở bài đã đăng"><b>{r.title.slice(0, 90)}</b></a>
                          : <b className="cell-title-nolink">{r.title.slice(0, 90)}</b>
                      ) : (
                        <span className="sub">{r.stage === 'waiting' ? `Máy viết lúc ${r.slot.window === 'sang' ? '8h' : '14h'}` : 'Chưa có bài cho ô này'}</span>
                      )}
                      {r.product ? <div className="sub" style={{ fontSize: '.8rem' }}>{r.product}</div> : null}
                    </td>
                    <td>
                      <span className={`stage-badge ${stageCls(r.stage)}`}>
                        {r.stage === 'scheduled' && r.scheduledAt ? `Lên lịch ${fmtSched(r.scheduledAt)}` : TODAY_STAGE_LABEL[r.stage]}
                      </span>
                      {r.stage === 'pending' ? <div><Link href="/noi-dung" className="src" style={{ fontSize: '.8rem' }}>Duyệt →</Link></div> : null}
                      {r.stage === 'missed' ? <div><Link href="/ke-hoach" className="src" style={{ fontSize: '.8rem' }}>Sinh bài ngay →</Link></div> : null}
                      {r.stage === 'manual' ? <div><Link href="/noi-dung" className="src" style={{ fontSize: '.8rem' }}>Xuất TikTok →</Link></div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {todayView.extras.length ? (
          <div style={{ marginTop: 10 }}>
            <b style={{ fontSize: '.9rem' }}>➕ Bài ngoài lịch hôm nay ({fmt(todayView.extras.length)})</b>
            <div style={{ display: 'grid', gap: 4, marginTop: 4, fontSize: '.85rem' }}>
              {todayView.extras.slice(0, 6).map((e) => (
                <div key={e.contentId} style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                  <span className={`stage-badge ${stageCls(e.stage)}`}>{TODAY_STAGE_LABEL[e.stage]}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.publishedUrl ? <a href={e.publishedUrl} target="_blank" rel="noreferrer" className="src">{e.title.slice(0, 80)}</a> : e.title.slice(0, 80)}
                  </span>
                  <span className="sub" style={{ fontSize: '.78rem', flexShrink: 0 }}>{e.generator} · {fmtDT(e.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 8 }}>
          <Link href="/ke-hoach" className="src" style={{ fontSize: '.85rem' }}>Kế hoạch tuần →</Link>
          <Link href="/ke-hoach#lich-dang" className="src" style={{ fontSize: '.85rem' }}>Sửa lịch đăng cố định →</Link>
        </div>
      </section>

      {/* ===== 3. TIẾN ĐỘ | NGƯỜI HỎI MUA (2 cột) ===== */}
      <div className="blk-cols">
        <section className="blk">
          <h2><span aria-hidden="true">📶</span> Tiến độ theo giai đoạn <span className="sub">ô đỏ = cần người động tay</span></h2>
          <div className="stage-flow">
            <Link href="/ke-hoach" className="stage-node" title="Hướng đi bài viết BOSS đề xuất trong bản kế hoạch đang áp">
              <b>{fmt(ideaCount)}</b><span>Ý tưởng</span>
            </Link>
            <span className="stage-sep" aria-hidden="true">→</span>
            <Link href="/tong-quan?gd=draft" className="stage-node" title="Bài đã viết xong còn ở bước nháp / đang sinh (trong 200 bài mới nhất)">
              <b>{fmt(writtenCount)}</b><span>Đã viết</span>
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
          </div>
        </section>
        <section className="blk">
          <h2><span aria-hidden="true">🛒</span> Người hỏi mua <span className="sub">({fmt(leads.length)} trong 7 ngày · {fmt(leadToday.length)} hôm nay)</span></h2>
          {leads.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>Chưa có ai hỏi mua trong 7 ngày. Bài đăng đều + chia sẻ group để tăng tiếp cận.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {leads.slice(0, 4).map((l) => (
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
              {topLeadPosts.length ? (
                <div className="sub" style={{ fontSize: '.82rem', paddingTop: 2 }}>
                  🔥 Bài hút khách nhất: {topLeadPosts.map(([cid, n]) => `${(leadPostTitles.get(cid) || '(không tên)').slice(0, 50)} (${n} người hỏi)`).join(' · ')}
                </div>
              ) : null}
              <Link href="/noi-dung?loai=khach-hang" className="src" style={{ fontSize: '.85rem' }}>Xem tất cả khách hàng →</Link>
            </div>
          )}
        </section>
      </div>

      {/* ===== 4. ĐO LƯỜNG — 5 tile, phần chi tiết gấp lại ===== */}
      <section className="blk tone-ok">
        <h2>
          <span aria-hidden="true">📊</span> Đo lường{' '}
          <span className="sub">tuần này (Thứ 2 → hôm nay) · kênh chính</span>
        </h2>
        {week ? (
          <div className="pl-tiles" style={{ margin: '12px 0' }}>
            <Link href="/do-luong/tuan" className="pl-tile"><b>{vnI(week.totals.posts)}</b><span>Bài đã đăng tuần này</span></Link>
            <Link href="/do-luong/tuan" className="pl-tile"><b>{vnI(week.totals.engagement)}{deltaTag(week.delta.engagement)}</b><span>Tương tác</span></Link>
            <Link href="/do-luong/tuan" className="pl-tile"><b>{vnI(week.totals.views)}{deltaTag(week.delta.views)}</b><span>Lượt xem</span></Link>
            <Link href="/khach-hang" className="pl-tile"><b>{vnI(week.totals.conversions)}{deltaTag(week.delta.conversions)}</b><span>Khách hỏi mua</span></Link>
            <Link href="/do-luong" className="pl-tile"><b>{vnI(postsTodayCount)}</b><span>Lượt đăng hôm nay</span></Link>
          </div>
        ) : (
          <p className="sub">Chưa đọc được số liệu tuần.</p>
        )}
        <details className="tq-details">
          <summary>🏆 Bài tốt nhất tuần và sức khoẻ Trang <span className="sub">bấm để mở</span></summary>
          <div className="blk-cols" style={{ marginBottom: 10 }}>
            <div>
              <b style={{ fontSize: '.9rem' }}>🏆 Bài tốt nhất tuần</b>
              {week && week.topPosts && week.topPosts.length ? (
                week.topPosts.slice(0, 3).map((p: any, i: number) => (
                  <div key={i} className="sub" style={{ fontSize: '.85rem', marginTop: 4 }}>
                    {i + 1}. {String(p.title || '').slice(0, 70)} <b>· {vnI(p.m?.engagement || 0)} tương tác</b>
                  </div>
                ))
              ) : (
                <p className="sub" style={{ margin: '4px 0 0' }}>Tuần này chưa có bài nào có số liệu.</p>
              )}
            </div>
            <div>
              {scanCur ? (
                <PageSuiteBlock cur={scanCur} prev={scanPrev} compareLabel="so với hôm qua" />
              ) : (
                <div>
                  <b style={{ fontSize: '.9rem' }}>📈 Sức khoẻ Trang SDVICO VN</b>
                  <p className="sub" style={{ margin: '4px 0 0' }}>Chưa có lần quét Business Suite nào — bộ quét trên máy chủ sẽ tự chộp phiên Brave rồi quét mỗi 2 giờ.</p>
                </div>
              )}
            </div>
          </div>
        </details>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link href="/do-luong" className="src" style={{ fontSize: '.85rem' }}>Đo lường ngày →</Link>
          <Link href="/do-luong/tuan" className="src" style={{ fontSize: '.85rem' }}>Báo cáo tuần đầy đủ →</Link>
        </div>
      </section>

      {/* ===== 5. TẤT CẢ NỘI DUNG — gấp mặc định, mở khi đang lọc ===== */}
      <details className="blk tq-details" open={hasFilter}>
        <summary><span aria-hidden="true">📄</span> Tất cả nội dung <span className="sub">{fmt(filtered.length)} bài trong 200 bài mới nhất · bấm để mở bảng và bộ lọc</span></summary>
        <form method="get" style={{ margin: '0 0 10px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 30/8 (audit L1): ô tìm + bộ lọc có aria-label, không chỉ dựa placeholder. */}
          <input className="search" type="search" name="q" defaultValue={q} placeholder="Tìm theo tiêu đề bài..." aria-label="Tìm theo tiêu đề bài" style={{ maxWidth: 300, flex: '1 1 220px' }} />
          <select name="gd" defaultValue={fGd} className="note" aria-label="Lọc theo giai đoạn" style={{ maxWidth: 170 }}>
            <option value="">Mọi giai đoạn</option>
            <option value="draft">Nháp / đang sinh</option>
            <option value="pending">Chờ duyệt</option>
            <option value="scheduled">Lên lịch / đang đăng</option>
            <option value="published">Đã đăng</option>
            <option value="rejected">Từ chối</option>
          </select>
          <select name="kenh" defaultValue={fKenh} className="note" aria-label="Lọc theo kênh" style={{ maxWidth: 150 }}>
            <option value="">Mọi kênh</option>
            <option value="facebook">Facebook</option>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="zalo">Zalo</option>
          </select>
          <select name="kh" defaultValue={fKh} className="note" aria-label="Lọc theo kế hoạch" style={{ maxWidth: 210 }}>
            <option value="">Mọi kế hoạch</option>
            {allCampaigns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn ghost sm" type="submit">Lọc</button>
          {hasFilter ? <Link href="/tong-quan" className="src" style={{ fontSize: '.85rem' }}>Bỏ lọc</Link> : null}
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
                        <b className="cell-title-nolink" title="Bài chưa có link đăng để mở">{String(c.title || '(không tên)').slice(0, 90)}</b>
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
                <tr><td colSpan={5} className="sub" style={{ textAlign: 'center', padding: 20 }}>{hasFilter ? 'Không có bài nào khớp bộ lọc.' : 'Chưa có bài nào.'}</td></tr>
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
      </details>
    </main>
  );
}
