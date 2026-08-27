import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { isEmergencyStopped } from '../../lib/safety';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import PlatformLogo, { type PlatformKey } from '../noi-dung/platform-logo';

// 27/8 REDESIGN theo file "redesign web.docx" cua sep — trang TONG QUAN kieu ForLife Ops:
//   1. Tile giai doan (Y tuong -> Cho duyet -> Da len lich -> Da dang, + Tu choi)
//   2. Khoi "Can lam" — viec dang ket/loi can nguoi xu ly
//   3. Nguoi hoi mua (lead tu cmt/inbox cac nen tang) + Ke hoach hom nay
//   4. Tat ca noi dung — bang: bai o giai doan nao, dang kenh dau, thuoc ke hoach gi
// Cac trang cu (/noi-dung, /ke-hoach, /khach-hang) van song — day la man tong hop, bam
// "Chi tiet" de vao trang day du.
export const dynamic = 'force-dynamic';

type QueueRow = { id: string; status: string; payload: any; created_at: string };
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

export default async function Page({ searchParams }: { searchParams?: { q?: string } }) {
  const client = getServerClient();
  const q = String(searchParams?.q || '').trim();
  const now = Date.now();
  const since60 = new Date(now - 60 * 24 * 3600 * 1000).toISOString();
  const since7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

  let contentQuery = client
    .from('mkt_content')
    .select('id, title, brief, status, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(40);
  if (q) contentQuery = contentQuery.ilike('title', `%${q}%`);

  const [queueRes, postsRes, failedRes, contentRes, planAppliedRes, planLiveRes, leadsRes, emergencyStopped, yt] = await Promise.all([
    client
      .from('approval_queue')
      .select('id, status, payload, created_at')
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
  const firstPostAt = new Map<string, string>();
  const fbUrlByCid = new Map<string, string>();
  for (const p of posts) {
    if (!p.content_id) continue;
    if (!channelsByCid.has(p.content_id)) channelsByCid.set(p.content_id, new Set());
    channelsByCid.get(p.content_id)!.add(p.channel);
    if (p.published_at && (!firstPostAt.has(p.content_id) || p.published_at < firstPostAt.get(p.content_id)!)) firstPostAt.set(p.content_id, p.published_at);
    if (p.channel === 'facebook' && p.external_url && !fbUrlByCid.has(p.content_id)) fbUrlByCid.set(p.content_id, p.external_url);
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
    return s && new Date(s).getTime() > now;
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

  // Ke hoach hom nay (tu ban live).
  const planLive = planLiveRes.data as any;
  const todaySchedule = Array.isArray(planLive?.data?.daily_schedule)
    ? planLive.data.daily_schedule.find((d: any) => d.date === today) || null
    : null;

  // Giai doan cua tung bai trong bang Tat ca noi dung.
  function stageOf(c: ContentRow): { cls: string; label: string } {
    const qr = queueByCid.get(c.id);
    if (publishedCids.has(c.id)) return { cls: 'stage-published', label: 'Đã đăng' };
    if (qr?.status === 'rejected') return { cls: 'stage-rejected', label: 'Từ chối' };
    if (qr?.status === 'approved') {
      const s = String(qr.payload?.scheduled_at || '');
      if (s && new Date(s).getTime() > now) return { cls: 'stage-scheduled', label: `Đã lên lịch ${fmtDT(s)}` };
      return { cls: 'stage-scheduled', label: 'Đang đăng' };
    }
    if (qr?.status === 'pending') return { cls: 'stage-pending', label: 'Chờ duyệt' };
    if (String(c.brief?.trend_generating) === 'true') return { cls: 'stage-draft', label: 'Đang sinh' };
    return { cls: 'stage-draft', label: 'Nháp' };
  }

  const needCount = (pendingStale.length ? 1 : 0) + (failedStuckCids.length ? 1 : 0) + (emergencyStopped ? 1 : 0) + (yt.configured && yt.error ? 1 : 0) + (leadNew.length ? 1 : 0);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tổng quan</h1>
          <p className="sub">Dây chuyền nội dung SDVICO — bài đi từ Ý tưởng đến Đã đăng. Máy soạn, người bấm Duyệt mới đăng.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/noi-dung?loai=bang" className="btn ok">📥 Duyệt bài ({fmt(pending.length)})</Link>
          <Link href="/ke-hoach" className="btn ghost">🧭 Kế hoạch chi tiết</Link>
        </div>
      </header>

      {/* ===== 1. TILE GIAI DOAN ===== */}
      <div className="pl-tiles">
        <Link href="/ke-hoach" className="pl-tile" title="Hướng đi bài viết BOSS đề xuất trong bản kế hoạch đang áp">
          <b>{fmt(ideaCount)}</b>
          <span>Ý tưởng (hướng đi tuần)</span>
        </Link>
        <Link href="/noi-dung?loai=bang" className={`pl-tile ${pending.length ? 'hot' : ''}`} title="Bài chờ người bấm Duyệt">
          <b>{fmt(pending.length)}</b>
          <span>Chờ duyệt</span>
        </Link>
        <Link href="/noi-dung?loai=bang" className="pl-tile" title="Bài đã duyệt kèm giờ hẹn, tới giờ máy tự đăng">
          <b>{fmt(scheduled.length)}</b>
          <span>Đã lên lịch</span>
        </Link>
        <Link href="/kenh" className="pl-tile" title="Bài đã đăng thật lên các kênh">
          <b>{fmt(publishedCids.size)}</b>
          <span>Đã đăng</span>
        </Link>
        <Link href="/noi-dung?loai=bang" className="pl-tile" title="Bài bị người duyệt từ chối (60 ngày)">
          <b>{fmt(rejected.length)}</b>
          <span>Từ chối</span>
        </Link>
      </div>

      {/* ===== 2. CAN LAM ===== */}
      <section className="blk">
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
                <span style={{ flex: 1 }}>bài kẹt ở bước <b>Chờ duyệt</b> quá 24 giờ — duyệt hoặc từ chối để dây chuyền chạy tiếp. <Link href="/noi-dung?loai=bang">Mở Bảng bài viết →</Link></span>
              </div>
            ) : null}
            {failedStuckCids.length ? (
              <div className="need-item warn">
                <span className="need-n">{fmt(failedStuckCids.length)}</span>
                <span style={{ flex: 1 }}>bài đăng <b>Facebook thất bại</b> chưa đăng lại được — mở bài và bấm "Đăng lại Facebook". <Link href="/noi-dung?loai=bang">Mở Bảng bài viết →</Link></span>
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
          <h2>📅 Kế hoạch hôm nay <span className="sub">{appliedPlan ? `· tuần ${String(appliedPlan.period_start || '').slice(5)} đến ${String(appliedPlan.period_end || '').slice(5)}` : ''}</span></h2>
          {todaySchedule ? (
            <div style={{ display: 'grid', gap: 6, fontSize: '.9rem' }}>
              <div><b>{String(todaySchedule.product || todaySchedule.products?.join(', ') || 'Theo vòng xoay')}</b>{todaySchedule.kind ? ` · dạng ${todaySchedule.kind}` : ''}</div>
              {todaySchedule.note ? <div className="sub">{String(todaySchedule.note).slice(0, 200)}</div> : null}
              <div className="sub">Máy sinh bài theo lịch, bài vào cột Chờ duyệt — người bấm Duyệt mới đăng.</div>
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
          <span className="sub">40 bài mới nhất — bài ở giai đoạn nào, đăng kênh đâu, thuộc kế hoạch gì</span>
        </h2>
        <form method="get" style={{ margin: '0 0 10px' }}>
          <input className="search" type="search" name="q" defaultValue={q} placeholder="Tìm theo tiêu đề bài..." style={{ maxWidth: 420 }} />
        </form>
        <div className="tablewrap">
          <table className="datatable">
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th style={{ width: 150 }}>Giai đoạn</th>
                <th style={{ width: 110 }}>Kênh</th>
                <th style={{ width: 190 }}>Kế hoạch</th>
                <th style={{ width: 110 }}>Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {contents.map((c) => {
                const st = stageOf(c);
                const chSet = new Set<string>([
                  ...((Array.isArray(c.brief?.channels) ? c.brief.channels : []) as string[]),
                  ...(channelsByCid.get(c.id) || []),
                ]);
                const chs = ['facebook', 'youtube', 'tiktok', 'zalo'].filter((k) => chSet.has(k)) as PlatformKey[];
                const fbUrl = fbUrlByCid.get(c.id);
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
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {chs.length ? chs.map((k) => <PlatformLogo key={k} platform={k} size={16} />) : <span className="muted">—</span>}
                      </span>
                    </td>
                    <td className="sub" style={{ fontSize: '.82rem' }}>{campaignOf(c.brief)}</td>
                    <td className="sub" style={{ fontSize: '.82rem' }}>{fmtDT(firstPostAt.get(c.id) || c.created_at)}</td>
                  </tr>
                );
              })}
              {contents.length === 0 ? (
                <tr><td colSpan={5} className="sub" style={{ textAlign: 'center', padding: 20 }}>{q ? `Không tìm thấy bài nào có "${q}".` : 'Chưa có bài nào.'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ margin: '10px 0 0', fontSize: '.85rem' }}>
          <Link href="/noi-dung?loai=bang" className="src">Mở Bảng bài viết để duyệt/sửa/xoá →</Link>
          {' · '}
          <Link href="/noi-dung?loai=bai-viet" className="src">Danh sách đầy đủ →</Link>
          {' · '}
          <Link href="/noi-dung?loai=thung-rac" className="src">Thùng rác →</Link>
        </p>
      </section>
    </main>
  );
}
