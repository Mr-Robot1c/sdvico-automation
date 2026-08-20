import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import KenhTabs from './kenh-tabs';
import { getAllChannels, methodLabel } from '../../lib/channels';
import { toggleChannel, addChannel, removeChannel, trackPostedPost } from '../actions';
import { SubmitButton } from '../submit-button';

export const dynamic = 'force-dynamic';

type Post = { id: string; job_id: string | null; kenh: string | null; trang_thai: string };
type App = { id: string; job_id: string | null };

type ChannelRow = {
  kenh: string;
  ten: string;
  method: 'api' | 'manual';
  manual_default?: 'assisted' | 'track_only';
  builtin: boolean;
  post_url: string | null;
  enabled: boolean;
  postedCount: number;
  totalPosts: number;
  applicantCount: number;
};

export default async function Page() {
  const client = getServerClient();

  const [postsRes, jobsRes, appsRes] = await Promise.all([
    client.from('hr_job_posts').select('id, job_id, kenh, trang_thai').is('deleted_at', null),
    client.from('hr_jobs').select('id, title, status'),
    client.from('hr_applications').select('id, job_id'),
  ]);

  const posts = (postsRes.data || []) as Post[];
  const jobs = (jobsRes.data || []) as { id: string; title: string; status?: string }[];
  const apps = (appsRes.data || []) as App[];
  const channelViews = await getAllChannels(client);
  const manualChannels = channelViews.filter((c) => c.enabled && c.method === 'manual');

  // Số ứng viên theo từng vị trí — dùng để ước tính "kênh này ra bao nhiêu ứng viên".
  const appsByJob = new Map<string, number>();
  for (const a of apps) {
    if (!a.job_id) continue;
    appsByJob.set(a.job_id, (appsByJob.get(a.job_id) || 0) + 1);
  }

  // Thống kê per kênh: tổng bài, bài đã đăng, ứng viên ước tính.
  const stats = new Map<string, { total: number; posted: number; jobs: Set<string> }>();
  for (const p of posts) {
    const key = p.kenh || 'other';
    if (!stats.has(key)) stats.set(key, { total: 0, posted: 0, jobs: new Set() });
    const s = stats.get(key)!;
    s.total += 1;
    if (p.trang_thai === 'posted') s.posted += 1;
    if (p.job_id) s.jobs.add(p.job_id);
  }

  // Gộp channelViews + stats thành 1 mảng để render bảng.
  const rows: ChannelRow[] = channelViews.map((c) => {
    const s = stats.get(c.kenh);
    const applicantCount = s ? [...s.jobs].reduce((sum, jid) => sum + (appsByJob.get(jid) || 0), 0) : 0;
    return {
      kenh: c.kenh,
      ten: c.ten,
      method: c.method,
      manual_default: c.manual_default,
      builtin: c.builtin,
      post_url: c.post_url ?? null,
      enabled: c.enabled,
      postedCount: s?.posted || 0,
      totalPosts: s?.total || 0,
      applicantCount,
    };
  });

  // Kênh bật lên đầu, trong nhóm bật sort theo postedCount giảm dần.
  rows.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return b.postedCount - a.postedCount;
  });

  const totalPostedAllChannels = rows.reduce((s, r) => s + r.postedCount, 0);
  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kênh đăng tin</h1>
          <p className="sub">Cấu hình kênh đăng và tổng hợp bài đăng theo từng kênh.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <KenhTabs />

      <p className="sub" style={{ margin: '0 0 8px' }}>
        {rows.length} kênh · {enabledCount} đang bật · {totalPostedAllChannels} bài đã đăng.
      </p>

      <div className="table-scroll">
        <table className="chan-table">
          <thead>
            <tr>
              <th className="chan-th-name">Kênh</th>
              <th className="chan-th-method">Phương thức</th>
              <th className="chan-th-status">Trạng thái</th>
              <th className="chan-th-num">Bài đã đăng</th>
              <th className="chan-th-num">Ứng viên</th>
              <th className="chan-th-actions">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kenh} className={`chan-row${r.enabled ? '' : ' chan-row-off'}`}>
                <td className="chan-td-name">
                  <div className="chan-name">{r.ten}</div>
                  {r.post_url ? (
                    <a href={r.post_url} target="_blank" rel="noreferrer" className="chan-post-url">
                      Mở trang đăng ↗
                    </a>
                  ) : null}
                  {!r.builtin ? <span className="chan-tag">Tự thêm</span> : null}
                </td>
                <td className="chan-td-method">
                  <span>{methodLabel(r.kenh)}</span>
                  <div className="muted chan-method-sub">
                    {r.method === 'manual'
                      ? (r.manual_default === 'track_only' ? 'Ưu tiên gắn link' : 'Có hỗ trợ soạn')
                      : 'Tự đăng sau duyệt'}
                  </div>
                </td>
                <td className="chan-td-status">
                  <span className={`stage tone-${r.enabled ? 'ok' : 'default'}`}>
                    {r.enabled ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </td>
                <td className="chan-td-num">
                  <span className="chan-num-value">{r.postedCount}</span>
                  {r.totalPosts > r.postedCount ? (
                    <span className="muted chan-num-sub"> / {r.totalPosts} tổng</span>
                  ) : null}
                </td>
                <td className="chan-td-num">
                  {r.applicantCount > 0 ? (
                    <>~<span className="chan-num-value">{r.applicantCount}</span></>
                  ) : (
                    <span className="muted">0</span>
                  )}
                </td>
                <td className="chan-td-actions">
                  <form action={toggleChannel} style={{ display: 'inline-block' }}>
                    <input type="hidden" name="kenh" value={r.kenh} />
                    <input type="hidden" name="bat" value={r.enabled ? 'false' : 'true'} />
                    <SubmitButton
                      label={r.enabled ? 'Tắt' : 'Bật'}
                      className={`btn ${r.enabled ? 'ghost' : 'ok'}`}
                      style={{ fontSize: '0.82em', padding: '4px 12px' }}
                    />
                  </form>
                  {!r.builtin ? (
                    <form action={removeChannel} style={{ display: 'inline-block', marginLeft: 4 }}>
                      <input type="hidden" name="kenh" value={r.kenh} />
                      <SubmitButton
                        label="Xoá"
                        className="btn ghost"
                        style={{ fontSize: '0.82em', padding: '4px 12px', color: 'var(--no)' }}
                      />
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ghi nhận bài đã đăng lên sàn (track-only). Người tự đăng thẳng trên sàn, chỉ ghi link + ảnh để theo dõi.
          Cho phép "đăng tiếp tục" nhiều lần trên cùng 1 kênh: mỗi lần submit là 1 bài mới trong hr_job_posts.
          Bài mới sẽ tự hiện ở tab Tin đăng (trackPostedPost revalidate /dang-tin). */}
      {manualChannels.length > 0 ? (
        <form action={trackPostedPost} className="settings-box" style={{ marginTop: 16 }}>
          <b>Ghi nhận bài đã đăng lên sàn</b>
          <p className="muted" style={{ margin: '4px 0 8px', fontSize: '0.85em' }}>
            Dùng khi bạn tự đăng trực tiếp trên sàn (TopCV, JobsGO, VietnamWorks…). Chỉ ghi link + ảnh để
            theo dõi — không qua bước Duyệt. Có thể ghi nhận nhiều bài trên cùng 1 sàn: mỗi lần điền là 1 bài mới.
          </p>
          <div className="row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
            <select className="note" name="kenh" required aria-label="Kênh">
              {manualChannels.map((c) => <option key={c.kenh} value={c.kenh}>{c.ten}</option>)}
            </select>
            <select className="note" name="job_id" aria-label="Vị trí (tùy chọn)" defaultValue="">
              <option value="">Gắn vị trí (tùy chọn)</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input className="note" type="url" name="url" placeholder="Link bài đã đăng trên sàn" aria-label="Link bài đã đăng" />
            <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--ink-2)' }}>Ảnh bằng chứng:</span>
              <input type="file" name="proof_file" accept="image/*" style={{ fontSize: '0.85em' }} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <SubmitButton label="Ghi nhận đã đăng" />
          </div>
        </form>
      ) : null}

      {/* Thêm sàn tuyển dụng mới do người dùng nhập. Luôn là kênh đăng thủ công. */}
      <form action={addChannel} className="settings-box" style={{ marginTop: 16 }}>
        <b>Thêm sàn tuyển dụng mới</b>
        <p className="muted" style={{ margin: '4px 0 8px', fontSize: '0.85em' }}>
          Kênh tự thêm luôn là <b>đăng thủ công</b> (soạn có hỗ trợ + ghi nhận đã đăng). Nối API tự động
          cần cấu hình credentials trong code.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="note" name="ten" placeholder="Tên sàn, ví dụ JobsGO" required aria-label="Tên sàn" />
          <input className="note" type="url" name="post_url" placeholder="Link trang đăng (tùy chọn)" aria-label="Link trang đăng" />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <SubmitButton label="Thêm kênh" />
        </div>
      </form>

      <p className="muted" style={{ marginTop: 14, fontSize: '0.82em' }}>
        Số ứng viên bên trên là ước tính theo vị trí (job), không phải theo từng bài đăng — ứng viên
        gửi CV qua một hộp thư chung, không qua đường dẫn riêng của từng bài. Một vị trí đăng ở nhiều
        kênh sẽ bị tính ở tất cả các kênh đó nên tổng cộng có thể lớn hơn số ứng viên thực tế.
      </p>
    </main>
  );
}
