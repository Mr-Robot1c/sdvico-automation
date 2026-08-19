// P2-15: dashboard giám sát các bất biến an toàn + hoạt động ngày.
// Đọc run_log + daily_counters + approval_queue để dựng 4 KPI:
//   1. Bài đăng thành công hôm nay (Facebook + LinkedIn)
//   2. Bình luận trả lời hôm nay
//   3. Alert đang mở trong hàng đợi (dead-letter + heartbeat)
//   4. Hồ sơ ứng viên chấm xong hôm nay
// Kèm bảng chi tiết: quota theo kênh, lần chạy gần nhất theo task, alert đang mở.
// Không giải quyết được P2-14 (cost_vnd) vì hệ thống chưa có cột này — TODO khi ghi cost.

import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';

export const dynamic = 'force-dynamic';

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function ago(iso: string | null): string {
  if (!iso) return 'chưa có lần nào';
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

type CounterRow = { account: string; kind: string; day: string; count: number };
type RunRow = { task: string; status: string; detail: unknown; created_at: string };
type AlertRow = { id: string; title: string; payload: unknown; created_at: string; ref_table: string | null; ref_id: string | null };

const WATCHED_TASKS = [
  { task: 'hr.publish_facebook', label: 'Đăng Facebook', threshold: 180 },
  { task: 'hr.publish_linkedin', label: 'Đăng LinkedIn', threshold: 180 },
  { task: 'hr.publish_comment_reply', label: 'Trả lời bình luận', threshold: 180 },
  { task: 'hr.queue_facebook', label: 'Soạn bài Facebook', threshold: 180 },
  { task: 'hr.queue_comment_replies', label: 'Soạn trả lời bình luận', threshold: 180 },
  { task: 'hr.retention_purge', label: 'Xóa hồ sơ hết hạn', threshold: 30 * 60 },
  { task: 'hr.reinvite_scan', label: 'Tự mời lại ứng viên', threshold: 26 * 60 },
  { task: 'hr.heartbeat', label: 'Heartbeat', threshold: 120 },
];

export default async function GiamSatPage() {
  const client = getServerClient();
  const day = todayVN();

  const [countersRes, runsRes, alertsRes, screenedRes] = await Promise.all([
    client.from('daily_counters').select('account, kind, day, count').eq('day', day),
    // Lấy 1 bản ghi mới nhất cho mỗi task quan sát.
    client.from('run_log').select('task, status, detail, created_at').in('task', WATCHED_TASKS.map((w) => w.task)).order('created_at', { ascending: false }).limit(500),
    client.from('approval_queue').select('id, title, payload, created_at, ref_table, ref_id').eq('kind', 'alert').eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
    client.from('hr_applications').select('id', { count: 'exact', head: true }).eq('stage', 'review').gte('screened_at', `${day}T00:00:00Z`),
  ]);

  const counters = (countersRes.data || []) as CounterRow[];
  const runs = (runsRes.data || []) as RunRow[];
  const alerts = (alertsRes.data || []) as AlertRow[];
  const screenedToday = screenedRes.count ?? 0;

  // Bài đăng hôm nay = tổng count của các account đăng.
  const kpiPosts = counters
    .filter((c) => ['fb_page_publish', 'linkedin_publish'].includes(c.account))
    .reduce((sum, c) => sum + Number(c.count || 0), 0);
  const kpiReplies = counters
    .filter((c) => c.account === 'fb_comment_reply')
    .reduce((sum, c) => sum + Number(c.count || 0), 0);
  const kpiAlerts = alerts.length;

  // Lần chạy gần nhất theo task.
  const lastByTask = new Map<string, RunRow>();
  for (const r of runs) if (!lastByTask.has(r.task)) lastByTask.set(r.task, r);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Giám sát</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-2)', fontSize: '0.9em' }}>
            Bốn chỉ tiêu nghiệm thu, nhịp chạy nền, và các cảnh báo còn mở. Đọc từ <code>run_log</code>, <code>daily_counters</code>, <code>approval_queue</code>. Ngày tham chiếu: <code>{day}</code> (giờ VN).
          </p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        <Kpi label="Bài đã đăng hôm nay" value={kpiPosts} sub="Facebook + LinkedIn" />
        <Kpi label="Bình luận đã trả lời" value={kpiReplies} sub="Đã qua cổng duyệt" />
        <Kpi label="Hồ sơ đã chấm hôm nay" value={screenedToday} sub="Chuyển sang bước review" />
        <Kpi label="Alert đang mở" value={kpiAlerts} sub={kpiAlerts > 0 ? 'Cần xử lý' : 'Sạch'} tone={kpiAlerts > 0 ? 'warn' : 'ok'} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05em', marginBottom: 8 }}>Trần hạn mức ngày</h2>
        {counters.length === 0 ? (
          <p className="empty">Chưa có tác vụ đăng nào hôm nay.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Kênh</th><th>Loại</th><th style={{ textAlign: 'right' }}>Đã dùng</th></tr>
            </thead>
            <tbody>
              {counters
                .filter((c) => ['fb_page_publish', 'linkedin_publish', 'fb_comment_reply', 'fb_comment_react'].includes(c.account))
                .map((c) => (
                  <tr key={`${c.account}-${c.kind}`}>
                    <td><code>{c.account}</code></td>
                    <td><code>{c.kind}</code></td>
                    <td style={{ textAlign: 'right' }}>{c.count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05em', marginBottom: 8 }}>Nhịp chạy nền</h2>
        <p style={{ fontSize: '0.85em', color: 'var(--ink-2)', margin: '0 0 8px' }}>
          Task im lặng quá ngưỡng sẽ được cron <code>heartbeat</code> đẩy vào cột Alert. Bảng này chỉ hiển thị lần chạy gần nhất từ <code>run_log</code>.
        </p>
        <table className="table">
          <thead>
            <tr><th>Task</th><th>Lần chạy gần nhất</th><th>Trạng thái</th><th>Ngưỡng cảnh báo</th></tr>
          </thead>
          <tbody>
            {WATCHED_TASKS.map((w) => {
              const last = lastByTask.get(w.task);
              const stale = last && (Date.now() - new Date(last.created_at).getTime()) > w.threshold * 60000;
              return (
                <tr key={w.task}>
                  <td>{w.label}<br /><code style={{ fontSize: '0.8em', color: 'var(--ink-2)' }}>{w.task}</code></td>
                  <td>{ago(last?.created_at || null)}{stale ? ' ⚠' : ''}</td>
                  <td>{last?.status ? <code>{last.status}</code> : '—'}</td>
                  <td style={{ fontSize: '0.85em', color: 'var(--ink-2)' }}>{w.threshold} phút</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05em', marginBottom: 8 }}>Alert đang mở ({alerts.length})</h2>
        {alerts.length === 0 ? (
          <p className="empty">Không có cảnh báo. Worker chạy đều.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Tiêu đề</th><th>Ref</th><th>Chi tiết</th><th>Thời điểm</th></tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const p = (a.payload || {}) as { task?: string; attempts?: number; error?: string; silent_minutes?: number };
                return (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td><code style={{ fontSize: '0.8em' }}>{a.ref_table || '—'}</code></td>
                    <td style={{ fontSize: '0.85em' }}>
                      {p.error ? <div style={{ color: 'var(--red, #c0392b)' }}>{p.error.slice(0, 200)}</div> : null}
                      {p.attempts ? <div>Thử {p.attempts} lần</div> : null}
                      {p.silent_minutes ? <div>Im lặng {p.silent_minutes} phút</div> : null}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{ago(a.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'ok' | 'warn' }) {
  const border = tone === 'warn' ? '2px solid var(--red, #c0392b)' : '1px solid var(--border)';
  return (
    <div style={{ border, borderRadius: 8, padding: 14, background: 'var(--panel, transparent)' }}>
      <div style={{ fontSize: '0.85em', color: 'var(--ink-2)' }}>{label}</div>
      <div style={{ fontSize: '2em', fontWeight: 600, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: '0.8em', color: 'var(--ink-2)', marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
