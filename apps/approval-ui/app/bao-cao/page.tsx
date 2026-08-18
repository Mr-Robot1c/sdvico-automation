import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import DailyChart from './daily-chart';
import { kindMeta, formatDateTime } from '../labels';

// Nhãn tiếng Việt cho các task hay gặp trong run_log — thay cho mã máy như "hr.publish_facebook".
const TASK_LABELS: Record<string, string> = {
  'hr.intake': 'Nạp CV từ hộp thư',
  'hr-intake': 'Nạp CV từ hộp thư',
  'hr.screen': 'Chấm điểm CV',
  'hr-screen': 'Chấm điểm CV',
  'hr.interview': 'Soạn thư mời phỏng vấn',
  'hr-interview': 'Soạn thư mời phỏng vấn',
  'hr.send_email': 'Gửi thư cho ứng viên',
  'hr.publish_facebook': 'Đăng bài Facebook',
  'hr.approve_and_publish': 'Duyệt và đăng bài',
  'hr.publish_linkedin': 'Đăng bài LinkedIn',
  'hr.queue_facebook': 'Soạn bài Facebook',
  'hr.publish_facebook_ui': 'Đăng bài Facebook (từ UI)',
};

function taskLabel(task: string): string {
  const t = String(task || '');
  const hit = Object.keys(TASK_LABELS).find((k) => t === k || t.startsWith(k));
  return hit ? TASK_LABELS[hit] : t;
}

const STATUS_LABELS: Record<string, string> = { ok: 'Thành công', error: 'Lỗi', warn: 'Cảnh báo' };
const DECISION_LABELS: Record<string, string> = {
  approved: 'Đã duyệt', rejected: 'Đã từ chối', dismissed: 'Đã bỏ qua',
};

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

  // Nhật ký duyệt gần đây: 20 mục approval_queue mới bấm nhất, có ghi decided_by (cột mới,
  // ở chế độ AUTH_MODE=basic sẽ luôn là null nên cột "Người bấm" hiện dấu gạch).
  const { data: decidedRows } = await client
    .from('approval_queue')
    .select('kind, status, decided_at, decided_by, title')
    .neq('status', 'pending')
    .not('decided_at', 'is', null)
    .order('decided_at', { ascending: false })
    .limit(20);
  const decided = (decidedRows || []) as Array<{
    kind: string; status: string; decided_at: string;
    decided_by: string | null; title: string | null;
  }>;

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
          <p className="sub">Số liệu 7 ngày và 30 ngày qua. Tự làm mới mỗi 30 giây.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <section className="report-grid">
        <Stat label="CV nạp về" value7={cv7} value30={cands.length} sub="Hồ sơ mới nhận được" />
        <Stat label="Lượt nạp CV" value7={intake7} value30={intake30} sub="Số lần máy quét hộp thư tuyển dụng" />
        <Stat label="Lượt chấm CV" value7={screen7} value30={screen30} sub="Số hồ sơ máy đã chấm điểm" />
        <Stat label="Lượt soạn thư mời" value7={interview7} value30={count(runs, 30, ['hr-interview', 'hr.interview'])} sub="Số thư mời phỏng vấn máy đã soạn" />

        <Stat
          label="Bài đăng thành công"
          value7={publishOk7} value30={publishOk30}
          sub={publishErr30 > 0 ? `${publishErr30} lần đăng hỏng trong 30 ngày` : 'Không có lần đăng hỏng'}
          tone={publishErr30 > 0 ? 'warn' : 'ok'}
        />

        <Stat
          label="Thư gửi ứng viên"
          value7={mailOk7} value30={mailOk30}
          sub={mailErr30 > 0 ? `${mailErr30} lần gửi hỏng trong 30 ngày. Xem lại ở trang Duyệt.` : 'Không có lần gửi hỏng'}
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
          <div className="table-scroll">
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
                    <td className="muted nowrap">{formatDateTime(r.created_at)}</td>
                    <td>{taskLabel(r.task)}</td>
                    <td>
                      <span className={`stage tone-${r.status === 'ok' ? 'ok' : r.status === 'error' ? 'no' : 'mkt'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-box">
        <h2 style={{ margin: '0 0 10px', fontSize: '1.02rem' }}>Nhật ký duyệt gần đây</h2>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.82em' }}>
          20 mục hàng đợi mới được xử lý. Cột &quot;Người bấm&quot; chỉ hiển thị khi đã bật
          đăng nhập theo từng người; ở chế độ mật khẩu chung sẽ để trống.
        </p>
        {decided.length === 0 ? (
          <p className="muted">Chưa có mục nào được xử lý.</p>
        ) : (
          <div className="table-scroll">
            <table className="run-log">
              <thead>
                <tr>
                  <th>Lúc</th>
                  <th>Loại</th>
                  <th>Kết quả</th>
                  <th>Người bấm</th>
                  <th>Tiêu đề</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((r, i) => (
                  <tr key={i}>
                    <td className="muted nowrap">{formatDateTime(r.decided_at)}</td>
                    <td>{kindMeta(r.kind).label}</td>
                    <td>
                      <span className={`stage tone-${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'no' : 'mkt'}`}>
                        {DECISION_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td>{r.decided_by || <span className="muted">Không rõ</span>}</td>
                    <td className="cell-ellipsis">{r.title || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
