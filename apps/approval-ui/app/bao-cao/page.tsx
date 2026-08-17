import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import DailyChart from './daily-chart';

// Trang báo cáo. Đọc số thật từ run_log và các bảng nghiệp vụ.
// Mọi chỉ số đều tính hai mức: 7 ngày qua và 30 ngày qua.

export const dynamic = 'force-dynamic';

const ONE_DAY = 24 * 60 * 60 * 1000;

// Định danh task khớp lỏng để chịu được các tên biến thể trong run_log:
// hr-intake, hr.intake, hr-post, hr.publish_facebook, hr.publish_facebook_ui, v.v.
function matchTask(task: string, prefixes: string[]): boolean {
  const t = String(task || '').toLowerCase();
  return prefixes.some((p) => t.startsWith(p));
}

type Row = { task: string; status: string; created_at: string };

// Đếm dòng trong khoảng ngày (từ N ngày trước tới giờ), lọc theo bộ prefix và status.
function count(rows: Row[], days: number, prefixes: string[], status?: string): number {
  const since = Date.now() - days * ONE_DAY;
  let n = 0;
  for (const r of rows) {
    if (new Date(r.created_at).getTime() < since) continue;
    if (status && r.status !== status) continue;
    if (matchTask(r.task, prefixes)) n++;
  }
  return n;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dựng chuỗi số theo 30 ngày qua (mảng 30 số, ngày cũ nhất đứng đầu).
function series30(items: { created_at: string }[]): number[] {
  const now = Date.now();
  const buckets: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) buckets[dayKey(now - i * ONE_DAY)] = 0;
  for (const it of items) {
    const k = dayKey(new Date(it.created_at).getTime());
    if (k in buckets) buckets[k]++;
  }
  return Object.values(buckets);
}

export default async function Page() {
  const client = getServerClient();
  const sinceIso = new Date(Date.now() - 30 * ONE_DAY).toISOString();

  const [runsRes, candRes, appsRes, postsRes, queueRes] = await Promise.all([
    client.from('run_log').select('task, status, created_at').gte('created_at', sinceIso).limit(5000),
    client.from('hr_candidates').select('id, created_at').gte('created_at', sinceIso).limit(2000),
    client.from('hr_applications').select('id, stage'),
    client.from('hr_job_posts').select('id, kenh, trang_thai, posted_at').eq('trang_thai', 'posted').gte('posted_at', sinceIso),
    client.from('approval_queue').select('kind, status').eq('status', 'pending'),
  ]);

  const runs = (runsRes.data || []) as Row[];
  const cands = (candRes.data || []) as { id: string; created_at: string }[];
  const apps = (appsRes.data || []) as { id: string; stage: string }[];
  const posts = (postsRes.data || []) as { id: string; kenh: string | null; trang_thai: string; posted_at: string }[];
  const queue = (queueRes.data || []) as { kind: string; status: string }[];

  const intake7 = count(runs, 7, ['hr-intake', 'hr.intake']);
  const intake30 = count(runs, 30, ['hr-intake', 'hr.intake']);
  const screen7 = count(runs, 7, ['hr-screen', 'hr.screen']);
  const screen30 = count(runs, 30, ['hr-screen', 'hr.screen']);
  const interview7 = count(runs, 7, ['hr-interview', 'hr.interview']);

  const cv7 = cands.filter((c) => new Date(c.created_at).getTime() >= Date.now() - 7 * ONE_DAY).length;

  const publishOk7 = count(runs, 7, ['hr.publish_facebook', 'hr.approve_and_publish', 'hr.publish_linkedin'], 'ok');
  const publishOk30 = count(runs, 30, ['hr.publish_facebook', 'hr.approve_and_publish', 'hr.publish_linkedin'], 'ok');
  const publishErr30 = count(runs, 30, ['hr.publish_facebook', 'hr.approve_and_publish', 'hr.publish_linkedin'], 'error');

  const mailOk30 = count(runs, 30, ['hr.send_email'], 'ok');
  const mailErr30 = count(runs, 30, ['hr.send_email'], 'error');
  const mailOk7 = count(runs, 7, ['hr.send_email'], 'ok');

  const stageCount: Record<string, number> = {};
  for (const a of apps) stageCount[a.stage] = (stageCount[a.stage] || 0) + 1;
  const queuePending = queue.length;

  const cvSeries = series30(cands);
  const postSeries = series30(posts.map((p) => ({ created_at: p.posted_at })));

  const recentRuns = [...runs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 20);

  const stages: Array<{ key: string; label: string }> = [
    { key: 'new', label: 'Mới về' },
    { key: 'review', label: 'Chờ xem' },
    { key: 'interview', label: 'Đang phỏng vấn' },
    { key: 'offer', label: 'Đã nhận' },
    { key: 'rejected', label: 'Đã từ chối' },
  ];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Báo cáo</h1>
          <p className="sub">Số liệu 7 ngày và 30 ngày qua, đọc từ run_log và các bảng nghiệp vụ. Tự làm mới mỗi 30 giây.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <section className="report-grid">
        <Stat label="CV nạp về" value7={cv7} value30={cands.length} sub="Đếm hồ sơ mới trong hr_candidates" />
        <Stat label="Lượt nạp CV" value7={intake7} value30={intake30} sub="hr.yml chạy đầu mỗi giờ, bước 1" />
        <Stat label="Lượt chấm CV" value7={screen7} value30={screen30} sub="hr.yml, bước 2" />
        <Stat label="Lượt soạn thư mời" value7={interview7} value30={count(runs, 30, ['hr-interview', 'hr.interview'])} sub="hr.yml, bước 3" />

        <Stat
          label="Bài đăng thành công"
          value7={publishOk7} value30={publishOk30}
          sub={publishErr30 > 0 ? `${publishErr30} lần đăng hỏng trong 30 ngày` : 'Không có lần đăng hỏng'}
          tone={publishErr30 > 0 ? 'warn' : 'ok'}
        />

        <Stat
          label="Thư gửi ứng viên"
          value7={mailOk7} value30={mailOk30}
          sub={mailErr30 > 0 ? `${mailErr30} lần gửi hỏng trong 30 ngày, kiểm hàng đợi Duyệt` : 'Không có lần gửi hỏng'}
          tone={mailErr30 > 0 ? 'warn' : 'ok'}
        />
      </section>

      <section className="settings-box">
        <h2 style={{ margin: '0 0 6px', fontSize: '1.02rem' }}>Số theo ngày, 30 ngày qua</h2>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85em' }}>
          Đường xanh: CV nạp về. Đường vàng: bài đăng thành công. Trục dọc là số lượt trong ngày.
        </p>
        <DailyChart cv={cvSeries} posts={postSeries} />
      </section>

      <section className="report-grid">
        {stages.map((s) => (
          <MiniStat key={s.key} label={s.label} value={stageCount[s.key] || 0} />
        ))}
        <MiniStat label="Đang chờ duyệt" value={queuePending} tone="warn" />
      </section>

      <section className="settings-box">
        <h2 style={{ margin: '0 0 10px', fontSize: '1.02rem' }}>Nhật ký chạy gần nhất</h2>
        {recentRuns.length === 0 ? (
          <p className="muted">Chưa có nhật ký nào trong 30 ngày qua.</p>
        ) : (
          <table className="run-log">
            <thead>
              <tr>
                <th>Lúc</th>
                <th>Việc</th>
                <th>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r, i) => (
                <tr key={i}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.created_at).toLocaleString('vi-VN', { hour12: false })}
                  </td>
                  <td><code>{r.task}</code></td>
                  <td>
                    <span className={`stage tone-${r.status === 'ok' ? 'ok' : r.status === 'error' ? 'no' : 'mkt'}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value7, value30, sub, tone }: { label: string; value7: number; value30: number; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`stat${tone ? ' stat-' + tone : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-values">
        <div><span className="stat-n">{value7}</span><span className="stat-unit">7 ngày</span></div>
        <div><span className="stat-n muted">{value30}</span><span className="stat-unit">30 ngày</span></div>
      </div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`stat mini${tone ? ' stat-' + tone : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-n">{value}</div>
    </div>
  );
}
