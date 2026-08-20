import { Fragment } from 'react';
import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import KenhTabs from './kenh-tabs';
import { getAllChannels, methodLabel, type ChannelMethod, type ManualDefault } from '../../lib/channels';
import { toggleChannel, addChannel, removeChannel, trackPostedPost, setChannelPostUrl } from '../actions';
import { SubmitButton } from '../submit-button';

export const dynamic = 'force-dynamic';

type Post = { id: string; job_id: string | null; kenh: string | null; trang_thai: string };
type App = { id: string; job_id: string | null };

type ChannelRow = {
  kenh: string;
  ten: string;
  method: ChannelMethod;
  manual_default?: ManualDefault;
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
            {rows.map((r) => {
              // Mọi kênh đăng tay đều có nút "+ Thêm bài", kể cả kênh built-in chưa bật.
              // Nếu kênh đang tắt, user vẫn ghi nhận được bài đã đăng lâu rồi ở đó.
              // Facebook/LinkedIn (method='api') không có nút — chúng đăng qua worker sau khi duyệt.
              const canAddPost = r.method === 'manual';
              return (
                <Fragment key={r.kenh}>
                  <tr className={`chan-row${r.enabled ? '' : ' chan-row-off'}`}>
                    <td className="chan-td-name">
                      <div className="chan-name">{r.ten}</div>
                      {r.post_url ? (
                        <a href={r.post_url} target="_blank" rel="noreferrer" className="chan-post-url">
                          Mở trang đăng ↗
                        </a>
                      ) : null}
                      {!r.builtin ? <span className="chan-tag">Tự thêm</span> : null}
                      {/* Cho phép sửa link "Mở trang đăng" cho MỌI kênh (built-in + tự thêm).
                          Kênh built-in mặc định lấy post_url từ code; user sửa xong DB sẽ override. */}
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.78em', color: 'var(--ink-2)', userSelect: 'none' }}>
                          {r.post_url ? 'Sửa link' : 'Đặt link'}
                        </summary>
                        <form action={setChannelPostUrl} style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          <input type="hidden" name="kenh" value={r.kenh} />
                          <input
                            className="note"
                            type="url"
                            name="post_url"
                            defaultValue={r.post_url || ''}
                            placeholder="https://... (để trống = bỏ link)"
                            aria-label={`Link trang đăng cho ${r.ten}`}
                            style={{ fontSize: '0.82em', minWidth: 220, flex: '1 1 220px' }}
                          />
                          <SubmitButton
                            label="Lưu"
                            className="btn ok"
                            style={{ fontSize: '0.78em', padding: '3px 10px' }}
                          />
                        </form>
                      </details>
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
                      {canAddPost ? (
                        // Nút chỉ điều hướng ánh mắt xuống hàng "Thêm bài" ngay bên dưới; details
                        // ở hàng phụ mới là chỗ mở form. Dùng anchor #add-<kenh> để bấm là scroll tới.
                        <a href={`#add-${r.kenh}`} className="btn ok" style={{ fontSize: '0.82em', padding: '4px 12px', textDecoration: 'none' }}>
                          + Thêm bài
                        </a>
                      ) : null}
                      <form action={toggleChannel} style={{ display: 'inline-block', marginLeft: canAddPost ? 4 : 0 }}>
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
                  {canAddPost ? (
                    // Hàng phụ: form "Thêm bài" gắn cứng với kênh của hàng chính. Ẩn ban đầu qua <details>
                    // để bảng không dài; click summary sẽ mở form full-width ngay dưới hàng dữ liệu.
                    <tr className="chan-addpost-row" id={`add-${r.kenh}`}>
                      <td colSpan={6} style={{ background: 'var(--surface, #fafafa)', padding: '4px 8px 10px' }}>
                        <details style={{ padding: '2px 0' }}>
                          <summary style={{ cursor: 'pointer', fontSize: '0.85em', color: 'var(--brand, #2563eb)', padding: '4px 6px', userSelect: 'none' }}>
                            + Thêm bài đăng lên <b>{r.ten}</b> (dán link bài đã đăng trên sàn)
                          </summary>
                          <form action={trackPostedPost} style={{ marginTop: 8, padding: '10px 6px 4px' }}>
                            <input type="hidden" name="kenh" value={r.kenh} />
                            <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                              <select className="note" name="job_id" aria-label="Vị trí (tùy chọn)" defaultValue="">
                                <option value="">Gắn vị trí (tùy chọn)</option>
                                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                              </select>
                              <input className="note" type="url" name="url" placeholder="Link bài đã đăng trên sàn" aria-label="Link bài đã đăng" style={{ flex: '1 1 240px' }} />
                            </div>
                            <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                              <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: 'var(--ink-2)' }}>Ảnh bằng chứng:</span>
                                <input type="file" name="proof_file" accept="image/*" style={{ fontSize: '0.85em' }} />
                              </label>
                              <SubmitButton label="Ghi nhận đã đăng" className="btn ok" style={{ fontSize: '0.85em' }} />
                            </div>
                            <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.8em' }}>
                              Bài sẽ xuất hiện ở <a href="/dang-tin">tab Tin đăng</a> ngay sau khi ghi nhận.
                              Không qua bước Duyệt (chỉ theo dõi).
                            </p>
                          </form>
                        </details>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

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
