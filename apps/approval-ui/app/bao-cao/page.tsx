import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import DailyChart from './daily-chart';
import { kindMeta, formatDateTime, formatDate } from '../labels';
import { loadFbMetricsMap } from '../../lib/fb-metrics';

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
  'hr.fb_metrics': 'Kéo số tương tác Facebook',
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
    client.from('hr_job_posts').select('id, tieu_de, kenh, trang_thai, posted_at, fb_post_id, url').eq('trang_thai', 'posted').gte('posted_at', sinceIso),
    client.from('approval_queue').select('kind, status').eq('status', 'pending').neq('kind', 'alert'),
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
  const posts = (postsRes.data || []) as {
    id: string; tieu_de: string; kenh: string | null; trang_thai: string;
    posted_at: string; fb_post_id: string | null; url: string | null;
  }[];
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

  // Tương tác Facebook. Kéo snapshot mới nhất cho các bài đã đăng trong 30 ngày, tính tổng
  // like/comment/share theo 7 và 30 ngày, và top 5 bài có tương tác cao nhất.
  const fbIds = posts.map((p) => p.fb_post_id).filter((x): x is string => !!x);
  const metricsMap = await loadFbMetricsMap(client, fbIds);
  const now = Date.now();
  const since7 = now - 7 * ONE_DAY;
  let fbReact7 = 0, fbComm7 = 0, fbShare7 = 0;
  let fbReact30 = 0, fbComm30 = 0, fbShare30 = 0;
  const enriched: Array<{
    id: string; tieu_de: string; posted_at: string; url: string | null;
    reactions: number; comments: number; shares: number; total: number;
  }> = [];
  for (const p of posts) {
    if (!p.fb_post_id) continue;
    const m = metricsMap.get(p.fb_post_id);
    if (!m) continue;
    fbReact30 += m.reactions; fbComm30 += m.comments; fbShare30 += m.shares;
    if (new Date(p.posted_at).getTime() >= since7) {
      fbReact7 += m.reactions; fbComm7 += m.comments; fbShare7 += m.shares;
    }
    enriched.push({
      id: p.id, tieu_de: p.tieu_de, posted_at: p.posted_at, url: p.url,
      reactions: m.reactions, comments: m.comments, shares: m.shares,
      total: m.reactions + m.comments + m.shares,
    });
  }
  const topPosts = [...enriched].sort((a, b) => b.total - a.total).slice(0, 5);
  const fbTotalPosts = enriched.length;

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

      {/* Tương tác Facebook — cộng dồn số like/bình luận/chia sẻ của các bài đã đăng qua hệ thống.
          Snapshot do cron /api/cron/fb-metrics kéo về mỗi giờ, chỉ tính các bài có fb_post_id. */}
      <section className="report-grid" aria-label="Tương tác Facebook">
        <Stat
          label="Lượt like Facebook"
          value7={fbReact7} value30={fbReact30}
          sub={fbTotalPosts > 0 ? `Cộng từ ${fbTotalPosts} bài đã đăng có số liệu` : 'Chưa có snapshot — chờ cron kéo về'}
        />
        <Stat
          label="Bình luận Facebook"
          value7={fbComm7} value30={fbComm30}
          sub="Tổng bình luận công khai trên các bài đã đăng"
        />
        <Stat
          label="Chia sẻ Facebook"
          value7={fbShare7} value30={fbShare30}
          sub="Tổng lượt chia sẻ trên các bài đã đăng"
        />
      </section>

      {topPosts.length > 0 ? (
        <section className="settings-box">
          <h2 style={{ margin: '0 0 6px', fontSize: '1.02rem' }}>Top bài tương tác cao nhất</h2>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85em' }}>
            5 bài đã đăng trong 30 ngày qua có tổng like + bình luận + chia sẻ cao nhất.
          </p>
          <div className="table-scroll">
            <table className="run-log">
              <thead>
                <tr>
                  <th>Ngày đăng</th>
                  <th>Tiêu đề</th>
                  <th style={{ textAlign: 'right' }}>Like</th>
                  <th style={{ textAlign: 'right' }}>Bình luận</th>
                  <th style={{ textAlign: 'right' }}>Chia sẻ</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p) => (
                  <tr key={p.id}>
                    <td className="muted nowrap">{formatDate(p.posted_at)}</td>
                    <td className="cell-ellipsis">
                      {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.tieu_de}</a> : p.tieu_de}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{new Intl.NumberFormat('vi-VN').format(p.reactions)}</td>
                    <td style={{ textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(p.comments)}</td>
                    <td style={{ textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(p.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
