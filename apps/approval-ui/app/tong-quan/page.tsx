import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { kindMeta, formatRelative, formatDateTime, recruitSourceLabel } from '../labels';

// Trang tổng quan — mở đầu ngày làm việc: đủ để biết có việc gì gấp.
// Không thay trang /: người quen bấm "Duyệt & gửi" vẫn giữ đường cũ, trang này thêm vào,
// đặt trước "Duyệt & gửi" trong sidebar. Tất cả truy vấn chỉ đọc, force-dynamic.
export const dynamic = 'force-dynamic';

const ONE_DAY = 24 * 60 * 60 * 1000;

// Nhãn task hiếm dùng trong feed — giữ đơn giản, không lặp cả bảng map như /bao-cao.
const RUN_TASK_LABEL: Record<string, string> = {
  'hr.publish_facebook': 'Đăng bài Facebook',
  'hr.publish_facebook_ui': 'Đăng bài Facebook',
  'hr.publish_linkedin': 'Đăng bài LinkedIn',
  'hr.send_email': 'Gửi thư ứng viên',
  'hr.intake': 'Nạp CV từ hộp thư',
  'hr.screen': 'Chấm điểm CV',
};

function runTaskLabel(task: string): string {
  const t = String(task || '');
  const hit = Object.keys(RUN_TASK_LABEL).find((k) => t === k || t.startsWith(k));
  return hit ? RUN_TASK_LABEL[hit] : t;
}

// Parse chuỗi khung giờ do thư mời sinh ra: "Thứ Ba, 18/08/2026, 09:00"
function slotTs(s: string): number {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})/);
  if (!m) return NaN;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
}

function isToday(ts: number): boolean {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return ts >= start && ts < start + ONE_DAY;
}

function isTomorrow(ts: number): boolean {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + ONE_DAY;
  return ts >= start && ts < start + ONE_DAY;
}

export default async function Page() {
  const client = getServerClient();
  const sinceIso24h = new Date(Date.now() - ONE_DAY).toISOString();
  const startTodayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const inThreeDaysIso = new Date(Date.now() + 3 * ONE_DAY).toISOString();

  const [queueRes, cvTodayRes, applicationsRes, appsTodayRes, openJobsRes, interviewsRes, upcomingPostsRes, incidentsRes, recentDecidedRes] =
    await Promise.all([
      // Chờ duyệt: đếm theo kind (loại alert — có trang giám sát riêng)
      client.from('approval_queue').select('kind').eq('status', 'pending').neq('kind', 'alert'),
      // CV mới hôm nay
      client.from('hr_candidates').select('id').gte('created_at', startTodayIso),
      // Ứng viên đang chờ xem (đã chấm, chưa quyết định mời hay không) — kèm job_id để tách theo vị trí
      client.from('hr_applications').select('id, job_id').eq('stage', 'review'),
      // Hồ sơ ứng tuyển tạo hôm nay — để đếm "CV mới hôm nay" theo từng vị trí
      client.from('hr_applications').select('job_id').gte('created_at', startTodayIso).limit(500),
      // Vị trí đang tuyển — gốc của trang tổng quan
      client
        .from('hr_jobs')
        .select('id, title, headcount, department, location')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(100),
      // Phỏng vấn sắp tới: đọc từ approval_queue kind=hr_interview, lọc ở JS theo chosen_slot/khung_gio
      client
        .from('approval_queue')
        .select('id, status, title, ref_id, payload')
        .eq('kind', 'hr_interview')
        .limit(200),
      // Bài đăng sắp lên lịch trong 72h tới
      client
        .from('hr_job_posts')
        .select('id, tieu_de, kenh, scheduled_at')
        .eq('trang_thai', 'scheduled')
        .lte('scheduled_at', inThreeDaysIso)
        .order('scheduled_at', { ascending: true })
        .limit(10),
      // Sự cố 24h qua: run_log có status error
      client
        .from('run_log')
        .select('task, status, created_at, payload')
        .eq('status', 'error')
        .gte('created_at', sinceIso24h)
        .order('created_at', { ascending: false })
        .limit(8),
      // 8 mục duyệt gần nhất để làm feed hoạt động
      client
        .from('approval_queue')
        .select('id, kind, status, title, decided_at, decided_by')
        .neq('status', 'pending')
        .not('decided_at', 'is', null)
        .order('decided_at', { ascending: false })
        .limit(8),
    ]);

  const queue = (queueRes.data || []) as Array<{ kind: string }>;
  const cvToday = (cvTodayRes.data || []).length;
  const reviewApps = (applicationsRes.data || []) as Array<{ id: string; job_id: string | null }>;
  const reviewCount = reviewApps.length;
  const openJobs = (openJobsRes.data || []) as Array<{
    id: string; title: string; headcount: number | null; department: string | null; location: string | null;
  }>;
  const appsToday = (appsTodayRes.data || []) as Array<{ job_id: string | null }>;
  const interviewsRaw = (interviewsRes.data || []) as Array<{
    id: string;
    status: string;
    title: string;
    ref_id: string | null;
    payload: { ung_vien?: string; vi_tri?: string; khung_gio?: string[] } | null;
  }>;
  const upcomingPosts = (upcomingPostsRes.data || []) as Array<{
    id: string;
    tieu_de: string;
    kenh: string | null;
    scheduled_at: string;
  }>;
  const incidents = (incidentsRes.data || []) as Array<{
    task: string;
    status: string;
    created_at: string;
    payload: unknown;
  }>;
  const recentDecided = (recentDecidedRes.data || []) as Array<{
    id: string;
    kind: string;
    status: string;
    title: string | null;
    decided_at: string;
    decided_by: string | null;
  }>;

  // Chọn khung gần nhất của mỗi phỏng vấn (ưu tiên chosen_slot nếu ứng viên đã chọn).
  // Lấy thêm job_id để quy mỗi buổi phỏng vấn về đúng vị trí (thay vì chỉ chuỗi tên).
  const refIds = interviewsRaw.map((r) => r.ref_id).filter(Boolean) as string[];
  const chosenMap = new Map<string, string | null>();
  const jobIdByApp = new Map<string, string | null>();
  if (refIds.length) {
    const { data: apps } = await client.from('hr_applications').select('id, chosen_slot, job_id').in('id', refIds);
    for (const a of (apps || []) as Array<{ id: string; chosen_slot: string | null; job_id: string | null }>) {
      chosenMap.set(a.id, a.chosen_slot);
      jobIdByApp.set(a.id, a.job_id);
    }
  }

  const interviews = interviewsRaw
    .map((r) => {
      const slots = r.payload?.khung_gio || [];
      const chosen = r.ref_id ? chosenMap.get(r.ref_id) || null : null;
      const candidates: string[] = chosen ? [chosen] : slots;
      const times = candidates.map((s) => ({ label: s, ts: slotTs(s) })).filter((x) => Number.isFinite(x.ts));
      times.sort((a, b) => a.ts - b.ts);
      const upcoming = times.find((t) => t.ts >= Date.now()) || null;
      return {
        id: r.id,
        candName: r.payload?.ung_vien || r.title,
        viTri: r.payload?.vi_tri || '',
        jobId: r.ref_id ? jobIdByApp.get(r.ref_id) || null : null,
        chosen,
        near: upcoming,
      };
    })
    .filter((iv) => iv.near !== null) as Array<{
      id: string;
      candName: string;
      viTri: string;
      jobId: string | null;
      chosen: string | null;
      near: { label: string; ts: number };
    }>;

  const interviewsToday = interviews.filter((iv) => isToday(iv.near.ts));
  const interviewsTomorrow = interviews.filter((iv) => isTomorrow(iv.near.ts));
  const nextInterview = interviews.sort((a, b) => a.near.ts - b.near.ts)[0] || null;

  // Gộp số liệu theo từng vị trí đang tuyển: CV mới hôm nay, hồ sơ chờ xem, phỏng vấn sắp tới.
  const countByJob = (rows: Array<{ job_id?: string | null; jobId?: string | null }>) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = (r.job_id ?? r.jobId) || null;
      if (id) m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  };
  const cvTodayByJob = countByJob(appsToday);
  const reviewByJob = countByJob(reviewApps);
  const interviewByJob = countByJob(interviews);
  const totalHeadcount = openJobs.reduce((s, j) => s + (j.headcount || 0), 0);

  const pendingByKind = new Map<string, number>();
  for (const q of queue) pendingByKind.set(q.kind, (pendingByKind.get(q.kind) || 0) + 1);
  const pendingTotal = queue.length;
  const pendingTopKinds = [...pendingByKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Nguồn hồ sơ 30 ngày qua (đo hiệu quả từng kênh). Cột nguon_kenh có thể chưa migrate —
  // đọc an toàn: thiếu cột thì danh sách rỗng, panel hiện lời nhắc gán nguồn.
  const cvBySource = new Map<string, number>();
  {
    const since30Iso = new Date(Date.now() - 30 * ONE_DAY).toISOString();
    const { data: srcRows } = await client
      .from('hr_candidates')
      .select('nguon_kenh')
      .gte('created_at', since30Iso)
      .limit(2000);
    for (const r of (srcRows || []) as Array<{ nguon_kenh: string | null }>) {
      const key = r.nguon_kenh || 'khac';
      cvBySource.set(key, (cvBySource.get(key) || 0) + 1);
    }
  }
  const sourceRows = [...cvBySource.entries()].sort((a, b) => b[1] - a[1]);
  const sourceTotal = sourceRows.reduce((s, [, n]) => s + n, 0);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tổng quan</h1>
          <p className="sub">Việc cần làm hôm nay, số liệu vắn tắt và hoạt động gần đây của hệ thống.</p>
        </div>
        <AutoRefresh seconds={60} />
      </header>

      {/* KHỐI CHÍNH: các vị trí đang tuyển là thẻ lớn, mỗi vị trí highlight CV mới hôm nay cùng
          hồ sơ chờ xem và phỏng vấn sắp tới. Tín hiệu "chờ duyệt" đã có ở badge mục Duyệt & gửi
          bên trái nên bỏ hàng KPI phụ phía trên. */}
      <section style={{ marginBottom: 22 }}>
        <div className="dash-section-head">
          <h2 className="dash-panel-title" style={{ margin: 0 }}>
            Vị trí đang tuyển <span className="muted">({openJobs.length})</span>
          </h2>
          {totalHeadcount > 0 ? (
            <span className="muted" style={{ fontSize: '0.85rem' }}>Cần tuyển tổng {totalHeadcount} người</span>
          ) : null}
        </div>
        {openJobs.length === 0 ? (
          <p className="muted dash-empty">
            Chưa có vị trí nào đang tuyển. Sang <Link href="/tao-jd">Vị trí tuyển dụng</Link> để mở tin.
          </p>
        ) : (
          <div className="pos-cards">
            {openJobs.map((j) => {
              const cvNew = cvTodayByJob.get(j.id) || 0;
              const review = reviewByJob.get(j.id) || 0;
              const pv = interviewByJob.get(j.id) || 0;
              const meta = [j.department, j.location].filter(Boolean).join(' · ');
              return (
                <div key={j.id} className="pos-card">
                  <Link href="/tao-jd" className="pos-card-title">{j.title}</Link>
                  <div className="pos-card-sub muted">
                    {j.headcount ? `Cần ${j.headcount} người` : 'Chưa đặt số lượng'}
                    {meta ? ` · ${meta}` : ''}
                  </div>
                  <div className="pos-card-stats">
                    <Link href="/ho-so" className="pos-stat-tile pos-stat-tile--accent" aria-label="CV mới hôm nay của vị trí này">
                      <span className="pos-stat-n">{cvNew}</span>
                      <span className="pos-stat-l">CV mới hôm nay</span>
                    </Link>
                    <Link href="/ho-so" className="pos-stat-tile" aria-label="Hồ sơ chờ xem của vị trí này">
                      <span className="pos-stat-n">{review}</span>
                      <span className="pos-stat-l">Chờ xem</span>
                    </Link>
                    <Link href="/lich" className="pos-stat-tile" aria-label="Phỏng vấn sắp tới của vị trí này">
                      <span className="pos-stat-n">{pv}</span>
                      <span className="pos-stat-l">PV sắp tới</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Nguồn hồ sơ 30 ngày — liếc nhanh hiệu quả từng kênh. Bảng đầy đủ 7/30 ngày ở trang Báo cáo. */}
      <section className="dash-panel" style={{ marginBottom: 22 }}>
        <h2 className="dash-panel-title">
          Nguồn hồ sơ <span className="muted">(30 ngày · {sourceTotal})</span>
        </h2>
        {sourceRows.length === 0 ? (
          <p className="muted dash-empty">
            Chưa có dữ liệu nguồn. Mở một hồ sơ ở <Link href="/ho-so">Hồ sơ ứng viên</Link> rồi bấm
            &quot;Gán nguồn&quot; để ghi CV đến từ kênh nào.
          </p>
        ) : (
          <ul className="src-list">
            {sourceRows.map(([kenh, n]) => {
              const pct = sourceTotal > 0 ? Math.round((n / sourceTotal) * 100) : 0;
              return (
                <li key={kenh} className="src-row">
                  <span className="src-name">{recruitSourceLabel(kenh)}</span>
                  <span className="src-bar"><i style={{ width: `${pct}%` }} /></span>
                  <span className="src-n"><b>{n}</b> <span className="muted">({pct}%)</span></span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dash-two-col">
        {/* Cột trái: sắp tới */}
        <div className="dash-panel">
          <h2 className="dash-panel-title">Sắp tới</h2>

          <div className="dash-subsection">
            <h3 className="dash-subtitle">
              Phỏng vấn <span className="muted">({interviewsToday.length} hôm nay · {interviewsTomorrow.length} ngày mai)</span>
            </h3>
            {interviewsToday.length === 0 && interviewsTomorrow.length === 0 ? (
              <p className="muted dash-empty">Chưa có buổi nào trong hai ngày tới.</p>
            ) : (
              <ul className="dash-list">
                {[...interviewsToday, ...interviewsTomorrow].map((iv) => (
                  <li key={iv.id} className="dash-item">
                    <div className="dash-item-main">
                      <span className="dash-item-title">{iv.candName}</span>
                      {iv.viTri ? <span className="muted dash-item-sub">{iv.viTri}</span> : null}
                    </div>
                    <span className={`dash-item-time${isToday(iv.near.ts) ? ' dash-item-time--today' : ''}`}>
                      {isToday(iv.near.ts) ? 'Hôm nay ' : 'Mai '}
                      {iv.near.label.replace(/^[^,]+,\s*\d{2}\/\d{2}\/\d{4},\s*/, '')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="dash-subsection">
            <h3 className="dash-subtitle">
              Bài sắp đăng <span className="muted">({upcomingPosts.length})</span>
            </h3>
            {upcomingPosts.length === 0 ? (
              <p className="muted dash-empty">Không có bài nào đặt lịch trong 3 ngày tới.</p>
            ) : (
              <ul className="dash-list">
                {upcomingPosts.map((p) => (
                  <li key={p.id} className="dash-item">
                    <div className="dash-item-main">
                      <span className="dash-item-title">{p.tieu_de}</span>
                      {p.kenh ? <span className="muted dash-item-sub">{p.kenh}</span> : null}
                    </div>
                    <span className="dash-item-time">{formatDateTime(p.scheduled_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Cột phải: hoạt động gần đây */}
        <div className="dash-panel">
          <h2 className="dash-panel-title">Hoạt động gần đây</h2>

          {incidents.length > 0 ? (
            <div className="dash-subsection">
              <h3 className="dash-subtitle dash-subtitle--warn">
                Sự cố cần xem <span className="muted">({incidents.length})</span>
              </h3>
              <ul className="dash-list">
                {incidents.map((it, i) => (
                  <li key={i} className="dash-item dash-item--warn">
                    <div className="dash-item-main">
                      <span className="dash-item-title">{runTaskLabel(it.task)}</span>
                      <span className="muted dash-item-sub">
                        {(() => {
                          const p = it.payload as { message?: string } | null;
                          return p?.message ? p.message.slice(0, 90) : 'Xem chi tiết trong Nhật ký chạy';
                        })()}
                      </span>
                    </div>
                    <span className="dash-item-time">{formatRelative(it.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="dash-subsection">
            <h3 className="dash-subtitle">Mục vừa duyệt</h3>
            {recentDecided.length === 0 ? (
              <p className="muted dash-empty">Chưa có mục nào được xử lý gần đây.</p>
            ) : (
              <ul className="dash-list">
                {recentDecided.map((r) => (
                  <li key={r.id} className="dash-item">
                    <div className="dash-item-main">
                      <span className="dash-item-title">{r.title || kindMeta(r.kind).label}</span>
                      <span className="muted dash-item-sub">
                        {kindMeta(r.kind).label}
                        {r.decided_by ? ` · ${r.decided_by}` : ''}
                      </span>
                    </div>
                    <span className={`dash-item-time dash-item-time--${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'no' : 'muted'}`}>
                      {r.status === 'approved' ? 'Đã duyệt' : r.status === 'rejected' ? 'Từ chối' : r.status === 'dismissed' ? 'Đã bỏ qua' : r.status}
                      <span className="muted"> · {formatRelative(r.decided_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
