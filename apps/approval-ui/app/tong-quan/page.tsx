import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { cachedPlatformStatus, cachedWeekReport } from '../../lib/cached';
import PlatformLogo from '../noi-dung/platform-logo';
import { buildTodayView, TODAY_STAGE_LABEL } from '../../lib/today-plan';
import { CHANNEL_LABEL, DOW_LONG } from '../../lib/posting-plan';
import { planShareLots } from '../../lib/share-lot';
import ShareLotToday from './share-lot-today';
import NewcomerChecklist from './newcomer-checklist';

// 27/8 REDESIGN theo file "redesign web.docx" cua sep — trang TONG QUAN kieu ForLife Ops.
// v2 (feedback sep cung ngay): (1) icon kenh trong bang bam duoc -> mo bai tren nen tang do;
// (2) block "Tien do theo giai doan" rieng nhu anh (pipeline + 2 the Cho duyet / Da len lich);
// (3) Ke hoach hom nay doc DUNG DailyPlan (direction + sales + contentKind + groups);
// (4) bang Tat ca noi dung co filter Moi giai doan / Moi kenh / Moi ke hoach nhu anh.
export const dynamic = 'force-dynamic';

type QueueRow = { id: string; title: string | null; status: string; payload: any; created_at: string };
type PostRow = { content_id: string | null; channel: string; status: string; external_url: string | null; published_at: string | null };

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

export default async function Page() {
  const client = getServerClient();
  const now = Date.now();
  const since60 = new Date(now - 60 * 24 * 3600 * 1000).toISOString();
  const since7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  const today = todayVN();

  // 23/10 (đợt 1 sắp xếp lại, design-spec-app-noi-bo.md màn 1): trang Hôm nay chỉ còn Cần làm + Lịch hôm nay + 3 số
  // tuần này. Bỏ "Số bài ở từng bước", "Người hỏi mua", "Tất cả nội dung", đo lường 5 ô (trùng Duyệt bài, Khách hàng,
  // Số liệu), bỏ luôn các truy vấn chỉ phục vụ chúng.
  const [queueRes, postsRes, failedRes, todayView, leadsRes, yt, qaPendingRes, week] = await Promise.all([
    client
      .from('approval_queue')
      .select('id, title, status, payload, created_at')
      .eq('kind', 'mkt_publish_content')
      .eq('status', 'pending')
      .gte('created_at', since60)
      .order('created_at', { ascending: false })
      .limit(400),
    client
      .from('mkt_posts')
      .select('content_id, channel, status, external_url, published_at')
      .eq('status', 'published')
      .eq('channel', 'facebook')
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
    buildTodayView(client),
    client
      .from('mkt_leads')
      .select('id, status')
      .neq('status', 'spam')
      .gte('created_at', since7)
      .limit(500),
    cachedPlatformStatus().then((st) => st.yt),
    client.from('mkt_product_qa').select('id', { count: 'exact', head: true }).eq('verified', false),
    (async () => { try { return await cachedWeekReport(0); } catch { return null as any; } })(),
  ]);
  const qaPending = qaPendingRes.count ?? 0;
  const pendingRaw = (queueRes.data || []) as QueueRow[];
  const fbPublished = new Set(((postsRes.data || []) as PostRow[]).map((p) => p.content_id).filter(Boolean) as string[]);
  const failedStuckCids = [...new Set(((failedRes.data || []) as PostRow[])
    .filter((p) => p.content_id && !fbPublished.has(p.content_id)).map((p) => p.content_id))] as string[];
  const leads = (leadsRes.data || []) as Array<{ id: string; status: string | null }>;
  const leadNew = leads.filter((l) => String(l.status || 'new') === 'new');

  // Bài đã vào Thùng rác vẫn còn phiếu pending (soft-delete 26/8 không đụng approval_queue): không đếm (23/9).
  const pendingCids = [...new Set(pendingRaw.map((r) => String(r.payload?.content_id || '')).filter(Boolean))];
  const [delRowsRes, todayLots] = await Promise.all([
    pendingCids.length ? client.from('mkt_content').select('id').in('id', pendingCids).not('deleted_at', 'is', null) : Promise.resolve({ data: [] as any[] }),
    planShareLots(client, { [today]: todayView.rows.map((r) => ({ index: r.slot.index, time: r.slot.time, kind: r.slot.kind, channel: r.slot.channel, group_id: r.slot.group_id, contentId: r.contentId })) }),
  ]);
  const deletedCids = new Set(((delRowsRes as any).data || []).map((d: any) => String(d.id)));
  const pending = pendingRaw.filter((r) => !deletedCids.has(String(r.payload?.content_id || '')));
  const pendingStale = pending.filter((r) => now - new Date(r.created_at).getTime() > 24 * 3600 * 1000);
  const pendingRed = pending.filter((r) => r.payload?.risk === 'red' || r.payload?.needs_manager_approval === true);
  const vnI = (n: number | null | undefined) => Number(n || 0).toLocaleString('vi-VN');

  // 16/9 (Thanh: mỗi BUỔI 4 nhóm): lô nhóm theo từng ô đăng hôm nay, hiện ngay trong bảng Lịch hôm nay.
  const todayLot = todayLots[today] || null;
  const lotOfRow = (idx: number) => todayLot?.slots.find((s) => s.index === idx) || null;

  const needCount = (pending.length ? 1 : 0) + (pendingRed.length ? 1 : 0) + (failedStuckCids.length ? 1 : 0)
    + (yt.configured && yt.error ? 1 : 0) + (leadNew.length ? 1 : 0) + (qaPending ? 1 : 0);

  const stageCls = (s: string) => ({ waiting: 'stage-waiting', missed: 'stage-missed', draft: 'stage-draft', pending: 'stage-pending', scheduled: 'stage-scheduled', manual: 'stage-manual', published: 'stage-published', rejected: 'stage-rejected' } as Record<string, string>)[s] || 'stage-draft';
  const todayLabel = `${DOW_LONG[todayView.dowIdx]} ${today.slice(8, 10)}/${today.slice(5, 7)}`;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Hôm nay</h1>
        </div>
        <div className="head-actions">
          {pending.length === 0 && leadNew.length > 0
            ? <Link href="/khach-hang" className="btn ok">Trả lời khách ({fmt(leadNew.length)})</Link>
            : <Link href="/noi-dung" className="btn ok">Duyệt bài ({fmt(pending.length)})</Link>}
        </div>
      </header>

      <NewcomerChecklist pending={pending.length} />

      {/* ===== 1. CẦN LÀM — chỉ hiện khi có việc; không có thì 1 dòng xanh ===== */}
      {needCount === 0 ? (
        <p className="ok-line"><span aria-hidden="true">✅</span> Không có việc gấp.</p>
      ) : (
        <section className="blk tone-red">
          <h2><span aria-hidden="true">🔔</span> Cần làm</h2>
          <div className="need-list">
            {pending.length ? (
              <Link href="/noi-dung" className="need-item">
                <span className="need-n">{fmt(pending.length)}</span>
                <span className="need-text">bài chờ duyệt{pendingStale.length ? `, ${fmt(pendingStale.length)} bài chờ quá 24 giờ` : ''}</span>
              </Link>
            ) : null}
            {pendingRed.length ? (
              <Link href="/noi-dung" className="need-item warn">
                <span className="need-n">{fmt(pendingRed.length)}</span>
                <span className="need-text">bài chạm quy định, cần quản lý duyệt</span>
              </Link>
            ) : null}
            {failedStuckCids.length ? (
              <Link href="/noi-dung" className="need-item warn">
                <span className="need-n">{fmt(failedStuckCids.length)}</span>
                <span className="need-text">bài đăng Facebook lỗi, cần bấm Đăng lại</span>
              </Link>
            ) : null}
            {leadNew.length ? (
              <Link href="/khach-hang" className="need-item">
                <span className="need-n">{fmt(leadNew.length)}</span>
                <span className="need-text">khách hỏi mua chưa được trả lời</span>
              </Link>
            ) : null}
            {qaPending ? (
              <Link href="/hoi-dap" className="need-item">
                <span className="need-n">{fmt(qaPending)}</span>
                <span className="need-text">câu hỏi đáp chờ Kinh doanh xác nhận</span>
              </Link>
            ) : null}
            {yt.configured && yt.error ? (
              <Link href="/ket-noi" className="need-item warn">
                <span className="need-n" aria-hidden="true">▶️</span>
                <span className="need-text">Kết nối YouTube bị lỗi, báo kỹ thuật</span>
              </Link>
            ) : null}
          </div>
        </section>
      )}

      {/* ===== 2. KẾ HOẠCH HÔM NAY — bảng giờ · kênh · group · bài · trạng thái ===== */}
      <section className="blk tone-accent">
        <h2>
          <span aria-hidden="true">📅</span> Lịch hôm nay{' '}
          <span className="sub">· {todayLabel} · {fmt(todayView.counts.total)} bài theo lịch{todayView.overridden ? ' · ✏️ lịch riêng hôm nay' : ''}{!todayView.saved ? ' · lịch mặc định (chưa lưu)' : ''}</span>
        </h2>
        <p className="sub today-share">
          📣 Chia sẻ group: <b>{fmt(todayLot?.done || 0)}/{fmt(todayLot?.lotSize || 0)}</b> nhóm đã chia hôm nay
        </p>
        {todayView.rows.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Hôm nay lịch không có bài nào. <Link href="/ke-hoach/lich-dang" className="src">Sửa lịch đăng →</Link></p>
        ) : (
          <div className="tablewrap">
            <table className="datatable today-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Giờ</th>
                  <th style={{ width: 150 }}>Kênh</th>
                  <th style={{ width: 300 }}>Chia sẻ group (4 nhóm/buổi)</th>
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
                    <td>
                      {(() => {
                        const sl = lotOfRow(r.slot.index);
                        if (!sl || sl.channel !== 'facebook') return <span className="muted">— (không phải Facebook)</span>;
                        if (!sl.items.length) return <span className="muted">—</span>;
                        return (
                          <ShareLotToday
                            compact
                            lot={sl.items.map((g) => ({ id: g.id, label: g.label, url: g.url, sharedToday: g.done ? { id: 'da-ghi', content_id: r.contentId, shared_at: '' } : null }))}
                            lotSize={sl.lotSize}
                            doneToday={sl.done}
                            post={r.contentId ? { contentId: r.contentId, url: r.publishedUrl } : null}
                          />
                        );
                      })()}
                    </td>
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
                  <span className="sub" style={{ fontSize: '.78rem', flexShrink: 0 }}>{fmtDT(e.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 8 }}>
          <Link href="/ke-hoach" className="src" style={{ fontSize: '.85rem' }}>Kế hoạch tuần →</Link>
          <Link href="/ke-hoach/lich-dang" className="src" style={{ fontSize: '.85rem' }}>Sửa lịch đăng cố định →</Link>
        </div>
      </section>

      {/* ===== 3. TUẦN NÀY — 3 số, chi tiết ở Số liệu ===== */}
      <section className="blk tone-ok">
        <h2><span aria-hidden="true">📊</span> Tuần này</h2>
        {week ? (
          <div className="pl-tiles">
            <Link href="/do-luong/tuan" className="pl-tile"><b>{vnI(week.totals.posts)}</b><span>Bài đã đăng</span></Link>
            <Link href="/do-luong/tuan" className="pl-tile"><b>{vnI(week.totals.engagement)}</b><span>Tương tác</span></Link>
            <Link href="/khach-hang" className="pl-tile"><b>{vnI(leads.length)}</b><span>Người hỏi mua 7 ngày</span></Link>
          </div>
        ) : (
          <p className="sub">Chưa đọc được số liệu tuần.</p>
        )}
        <div className="blk-links">
          <Link href="/do-luong/tuan" className="src">Xem số liệu →</Link>
        </div>
      </section>
    </main>
  );
}
