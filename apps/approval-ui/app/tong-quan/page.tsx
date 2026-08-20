import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { kindMeta, formatRelative, formatDateTime } from '../labels';

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

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tổng quan</h1>
          <p className="sub">Việc cần làm hôm nay, số liệu vắn tắt và hoạt động gần đây của hệ thống.</p>
        </div>
        <AutoRefresh seconds={60} />
      </header>

      {/* 4 KPI chính — vị trí đứng đầu vì đó là gốc. Bấm đi thẳng tới trang xử lý. */}
      <section className="dash-grid">
        <Link href="/tao-jd" className="dash-kpi dash-kpi--accent" aria-label="Xem các vị trí đang tuyển">
          <span className="dash-kpi-label">Đang tuyển</span>
          <span className="dash-kpi-value">{openJobs.length}</span>
          <span className="dash-kpi-sub">
            {openJobs.length === 0
              ? 'Chưa mở vị trí nào.'
              : totalHeadcount > 0
                ? `${openJobs.length} vị trí · cần tuyển ${totalHeadcount} người`
                : `${openJobs.length} vị trí đang mở`}
          </span>
        </Link>

        <Link
          href="/"
          className={`dash-kpi${pendingTotal > 0 ? ' dash-kpi--warn' : ''}`}
          aria-label="Vào trang Duyệt và gửi"
        >
          <span className="dash-kpi-label">Đang chờ duyệt</span>
          <span className="dash-kpi-value">{pendingTotal}</span>
          <span className="dash-kpi-sub">
            {pendingTotal === 0
              ? 'Đã duyệt hết. Không có việc nào chờ bạn.'
              : pendingTopKinds.length > 0
                ? pendingTopKinds.map(([k, n]) => `${kindMeta(k).label} ${n}`).join(' · ')
                : 'Có việc chờ duyệt.'}
          </span>
        </Link>

        <Link href="/ho-so" className="dash-kpi">
          <span className="dash-kpi-label">CV mới hôm nay</span>
          <span className="dash-kpi-value">{cvToday}</span>
          <span className="dash-kpi-sub">
            {cvTodayByJob.size > 0
              ? `Trải ${cvTodayByJob.size} vị trí · ${reviewCount} hồ sơ chờ xem`
              : reviewCount > 0 ? `${reviewCount} hồ sơ chờ xem` : 'Chưa có hồ sơ chờ xem'}
          </span>
        </Link>

        <Link href="/lich" className={`dash-kpi${interviewsToday.length > 0 ? ' dash-kpi--accent' : ''}`}>
          <span className="dash-kpi-label">Phỏng vấn hôm nay</span>
          <span className="dash-kpi-value">{interviewsToday.length}</span>
          <span className="dash-kpi-sub">
            {interviewsToday.length === 0 && interviewsTomorrow.length > 0
              ? `${interviewsTomorrow.length} buổi ngày mai`
              : interviewsToday.length === 0
                ? nextInterview
                  ? `Gần nhất: ${nextInterview.near.label}`
                  : 'Không có buổi nào sắp tới'
                : nextInterview
                  ? `Sớm nhất: ${nextInterview.near.label.replace(/^.+?,\s*/, '')}`
                  : ''}
          </span>
        </Link>
      </section>

      {/* Trọng tâm: mỗi vị trí đang tuyển kèm số CV mới, hồ sơ chờ xem, phỏng vấn sắp tới.
          Đây là gốc — các con số CV và phỏng vấn ở trên được tách rõ về từng vị trí ở đây. */}
      <section className="dash-panel" style={{ marginBottom: 22 }}>
        <h2 className="dash-panel-title">
          Vị trí đang tuyển <span className="muted">({openJobs.length})</span>
        </h2>
        {openJobs.length === 0 ? (
          <p className="muted dash-empty">
            Chưa có vị trí nào đang tuyển. Sang <Link href="/tao-jd">Vị trí tuyển dụng</Link> để mở tin.
          </p>
        ) : (
          <ul className="dash-list">
            {openJobs.map((j) => {
              const cvNew = cvTodayByJob.get(j.id) || 0;
              const review = reviewByJob.get(j.id) || 0;
              const pv = interviewByJob.get(j.id) || 0;
              const meta = [j.department, j.location].filter(Boolean).join(' · ');
              return (
                <li key={j.id} className="dash-item">
                  <div className="dash-item-main">
                    <Link href="/tao-jd" className="dash-item-title" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                      {j.title}
                    </Link>
                    <span className="muted dash-item-sub">
                      {j.headcount ? `Cần ${j.headcount} người` : 'Chưa đặt số lượng'}
                      {meta ? ` · ${meta}` : ''}
                    </span>
                  </div>
                  <div className="pos-nums">
                    <Link href="/ho-so" className={`pos-num${cvNew === 0 ? ' pos-num--zero' : ''}`} style={{ textDecoration: 'none' }}>
                      CV mới <b>{cvNew}</b>
                    </Link>
                    <Link href="/ho-so" className={`pos-num pos-num--accent${review === 0 ? ' pos-num--zero' : ''}`} style={{ textDecoration: 'none' }}>
                      Chờ xem <b>{review}</b>
                    </Link>
                    <Link href="/lich" className={`pos-num pos-num--warn${pv === 0 ? ' pos-num--zero' : ''}`} style={{ textDecoration: 'none' }}>
                      PV sắp tới <b>{pv}</b>
                    </Link>
                  </div>
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
