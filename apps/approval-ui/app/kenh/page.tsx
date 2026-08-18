import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { kenhLabel } from '../labels';
import KenhTabs from './kenh-tabs';
import { getAllChannels, methodLabel } from '../../lib/channels';
import { toggleChannel, addChannel, removeChannel } from '../actions';
import { SubmitButton } from '../submit-button';

export const dynamic = 'force-dynamic';

type Post = { id: string; job_id: string | null; kenh: string | null; trang_thai: string };
type Job = { id: string; title: string };
type App = { id: string; job_id: string | null };

type ChannelStat = {
  kenh: string;
  totalPosts: number;
  postedCount: number;
  jobs: { id: string; title: string }[];
  applicantCount: number;
};

export default async function Page() {
  const client = getServerClient();

  const [postsRes, jobsRes, appsRes] = await Promise.all([
    client.from('hr_job_posts').select('id, job_id, kenh, trang_thai').is('deleted_at', null),
    client.from('hr_jobs').select('id, title'),
    client.from('hr_applications').select('id, job_id'),
  ]);

  const posts = (postsRes.data || []) as Post[];
  const jobs = (jobsRes.data || []) as Job[];
  const apps = (appsRes.data || []) as App[];
  // Tất cả kênh (built-in trong code + kênh người dùng tự thêm) kèm trạng thái bật/tắt.
  const channelViews = await getAllChannels(client);

  const jobTitle = new Map(jobs.map((j) => [j.id, j.title]));
  // Số ứng viên theo từng vị trí — dùng để ước tính "kênh này ra bao nhiêu ứng viên".
  const appsByJob = new Map<string, number>();
  for (const a of apps) {
    if (!a.job_id) continue;
    appsByJob.set(a.job_id, (appsByJob.get(a.job_id) || 0) + 1);
  }

  const byChannel = new Map<string, ChannelStat>();
  for (const p of posts) {
    const key = p.kenh || 'other';
    if (!byChannel.has(key)) byChannel.set(key, { kenh: key, totalPosts: 0, postedCount: 0, jobs: [], applicantCount: 0 });
    const stat = byChannel.get(key)!;
    stat.totalPosts += 1;
    if (p.trang_thai === 'posted') stat.postedCount += 1;
    if (p.job_id && !stat.jobs.some((j) => j.id === p.job_id)) {
      stat.jobs.push({ id: p.job_id, title: jobTitle.get(p.job_id) || 'Vị trí đã xóa' });
    }
  }
  for (const stat of byChannel.values()) {
    stat.applicantCount = stat.jobs.reduce((sum, j) => sum + (appsByJob.get(j.id) || 0), 0);
  }

  const channels = [...byChannel.values()].sort((a, b) => b.postedCount - a.postedCount);
  const totalPostedAllChannels = channels.reduce((s, c) => s + c.postedCount, 0);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kênh đăng tin</h1>
          <p className="sub">Tổng hợp số bài đã đăng và vị trí đã đăng theo từng kênh.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <KenhTabs />

      {/* Danh sách kênh & cấu hình: phương thức (API/thủ công), trạng thái bật/tắt, trang đăng.
          Nguồn: registry code + kênh người dùng thêm (hr_platforms). Bật kênh để hiện ở trang Vị trí. */}
      <section style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: '1.05em', margin: '0 0 8px' }}>Kênh đăng tuyển & cấu hình</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {channelViews.map((c) => {
            const on = c.enabled;
            return (
              <div key={c.kenh} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{c.ten}</b>
                  <span className={`stage tone-${on ? 'ok' : 'default'}`} style={{ fontSize: 11 }}>{on ? 'Đang bật' : 'Đang tắt'}</span>
                </div>
                <p className="muted" style={{ margin: '6px 0', fontSize: '0.85em' }}>
                  {methodLabel(c.kenh)}
                  {c.method === 'manual' ? (c.manual_default === 'track_only' ? ' · ưu tiên gắn link' : ' · có hỗ trợ soạn') : ' · tự đăng sau duyệt'}
                  {c.builtin ? '' : ' · tự thêm'}
                </p>
                {c.post_url ? (
                  <p style={{ margin: '0 0 8px', fontSize: '0.82em' }}>
                    <a href={c.post_url} target="_blank" rel="noreferrer">Mở trang đăng ↗</a>
                  </p>
                ) : null}
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <form action={toggleChannel}>
                    <input type="hidden" name="kenh" value={c.kenh} />
                    <input type="hidden" name="bat" value={on ? 'false' : 'true'} />
                    <SubmitButton label={on ? 'Tắt kênh' : 'Bật kênh'} className="btn ghost" style={{ fontSize: '0.85em' }} />
                  </form>
                  {/* Chỉ xóa được kênh người dùng tự thêm; kênh built-in chỉ tắt được. */}
                  {!c.builtin ? (
                    <form action={removeChannel}>
                      <input type="hidden" name="kenh" value={c.kenh} />
                      <SubmitButton label="Xóa" className="btn no" style={{ fontSize: '0.85em' }} />
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Thêm sàn tuyển dụng mới do người dùng nhập. Luôn là kênh đăng thủ công. */}
        <form action={addChannel} className="settings-box" style={{ marginTop: 12 }}>
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
      </section>

      <div className="err" role="alert" style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line)', marginTop: 16 }}>
        <b>Giới hạn số liệu:</b> số ứng viên bên dưới là ước tính theo vị trí (job), không phải theo
        từng bài đăng cụ thể — vì ứng viên gửi CV qua một hộp thư chung, không qua đường dẫn riêng
        từng bài. Một vị trí đăng ở nhiều kênh sẽ bị tính ứng viên ở cả các kênh đó, nên tổng cộng
        dồn qua các kênh sẽ lớn hơn số ứng viên thực tế toàn hệ thống.
      </div>

      {channels.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📡</div>
          <p>Chưa có bài đăng nào.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 16 }}>
          {channels.map((c) => (
            <div key={c.kenh} className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{kenhLabel(c.kenh)}</b>
                <span className="stage tone-ok">{c.postedCount} đã đăng</span>
              </div>
              <p className="muted" style={{ margin: '6px 0' }}>
                {c.totalPosts} bài (kể cả nháp/đặt lịch) · ~{c.applicantCount} ứng viên (ước tính)
              </p>
              {c.jobs.length === 0 ? (
                <p className="sub">Chưa gắn vị trí nào.</p>
              ) : (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.88em' }}>
                  {c.jobs.map((j) => (
                    <li key={j.id}>{j.title} <span className="muted">· {appsByJob.get(j.id) || 0} ứng viên</span></li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {channels.length > 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>Tổng {totalPostedAllChannels} bài đã đăng trên {channels.length} kênh.</p>
      ) : null}
    </main>
  );
}
