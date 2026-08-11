import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';
import { addPlatform, removePlatform, addJobPost, updateJobPost } from '../actions';
import DangTinSections from '../dang-tin-sections';

// Quản lý vị trí, nền tảng đăng tuyển và theo dõi tin đăng.
// Tin đăng là tự động, không qua hàng đợi duyệt: chỉ mở xem và huỷ đăng nếu cần.
export const dynamic = 'force-dynamic';

type Job = {
  id: string; title: string; department: string | null; location: string | null;
  short_desc: string | null; requirements: string | null; jd_versions: Record<string, string> | null;
  status: string; created_at: string;
};
type Platform = { id: string; ten: string; loai: string; bat: boolean; ghi_chu: string | null };
type Post = {
  id: string; tieu_de: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; platform_id: string | null; created_at: string;
};

const JD_LABELS: Record<string, string> = { website: 'Website công ty', job_board: 'Trang tuyển dụng', facebook: 'Facebook', zalo_sms: 'Zalo / SMS' };
const JD_ORDER = ['website', 'job_board', 'facebook', 'zalo_sms'];
const JOB_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' }, open: { label: 'Đang tuyển', tone: 'ok' }, closed: { label: 'Đã đóng', tone: 'no' }
};
const LOAI_LABEL: Record<string, string> = { job_board: 'Sàn tuyển dụng', social: 'Mạng xã hội', other: 'Khác' };
const TT_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'default' }, scheduled: { label: 'Đặt lịch', tone: 'mkt' },
  posted: { label: 'Đã đăng', tone: 'ok' }, cancelled: { label: 'Đã huỷ', tone: 'no' }
};

export default async function Page() {
  const client = getServerClient();
  const jobsRes = await client
    .from('hr_jobs')
    .select('id, title, department, location, short_desc, requirements, jd_versions, status, created_at')
    .order('created_at', { ascending: false }).limit(100);
  const pRes = await client.from('hr_platforms').select('id, ten, loai, bat, ghi_chu').order('created_at', { ascending: true });
  const jRes = await client
    .from('hr_job_posts')
    .select('id, tieu_de, trang_thai, scheduled_at, posted_at, platform_id, created_at')
    .order('created_at', { ascending: false }).limit(100);

  const jobs = (jobsRes.data || []) as Job[];
  const missing = (code?: string) => code === 'PGRST205' || code === '42P01';
  const needMigration = missing(pRes.error?.code) || missing(jRes.error?.code);
  const platforms = (pRes.data || []) as Platform[];
  const posts = (jRes.data || []) as Post[];
  const platformName = new Map(platforms.map((p) => [p.id, p.ten]));

  const migrationNote = (
    <div className="err" role="alert">
      Chưa bật tính năng này. Chạy đoạn SQL trong <code>supabase/migrations/20260811100000_management.sql</code> ở Supabase SQL editor, rồi tải lại trang.
    </div>
  );

  const viTri = (
    <ul className="list">
      {jobs.map((j) => {
        const st = JOB_STATUS[j.status] || { label: j.status, tone: 'default' };
        const meta = [j.department, j.location].filter(Boolean).join(' · ');
        const versions = j.jd_versions || {};
        const keys = JD_ORDER.filter((k) => versions[k]).concat(Object.keys(versions).filter((k) => !JD_ORDER.includes(k)));
        return (
          <li key={j.id} className="card tone-mkt">
            <div className="head">
              <span className="cand-name">{j.title}</span>
              <time className="time" dateTime={j.created_at}>{formatRelative(j.created_at)}</time>
            </div>
            <div className="stages">
              <span className={`stage tone-${st.tone}`}>{st.label}</span>
              {meta ? <span className="src">{meta}</span> : null}
            </div>
            {j.short_desc ? <p className="job-desc">{j.short_desc}</p> : null}
            {keys.length ? (
              <div className="jd-versions">
                {keys.map((k) => (
                  <details className="raw" key={k}>
                    <summary>{JD_LABELS[k] || k} ({String(versions[k]).trim().split(/\s+/).length} từ)</summary>
                    <pre>{versions[k]}</pre>
                  </details>
                ))}
              </div>
            ) : <p className="muted">Chưa có phiên bản JD nào.</p>}
          </li>
        );
      })}
      {jobs.length === 0 ? <p className="muted">Chưa có vị trí nào. Dùng lệnh /hr-jd để sinh mô tả công việc.</p> : null}
    </ul>
  );

  const nenTang = needMigration ? migrationNote : (
    <>
      <ul className="list">
        {platforms.map((p) => (
          <li key={p.id} className="card tone-web">
            <div className="head">
              <span className="cand-name">{p.ten}</span>
              <form action={removePlatform}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn no" type="submit">Xoá</button>
              </form>
            </div>
            <div className="stages">
              <span className="stage tone-web">{LOAI_LABEL[p.loai] || p.loai}</span>
              {p.ghi_chu ? <span className="src">{p.ghi_chu}</span> : null}
            </div>
          </li>
        ))}
        {platforms.length === 0 ? <p className="muted">Chưa có nền tảng nào. Thêm bên dưới.</p> : null}
      </ul>
      <form action={addPlatform} className="settings-box">
        <b>Thêm nền tảng</b>
        <p className="muted" style={{ margin: '2px 0 8px' }}>Danh mục quản lý. Đăng thật vẫn cần tài khoản chính danh của nền tảng đó.</p>
        <div className="row">
          <input className="note" name="ten" placeholder="Tên (TopCV, Facebook, Việc Làm 24h...)" />
          <select className="note" name="loai" defaultValue="job_board" aria-label="Loại nền tảng">
            <option value="job_board">Sàn tuyển dụng</option>
            <option value="social">Mạng xã hội</option>
            <option value="other">Khác</option>
          </select>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="note" name="ghi_chu" placeholder="Ghi chú (không bắt buộc)" />
          <button className="btn ok" type="submit">Thêm nền tảng</button>
        </div>
      </form>
    </>
  );

  const tinDang = needMigration ? migrationNote : (
    <>
      <p className="muted" style={{ margin: '0 0 10px' }}>Tin đăng chạy tự động, không qua duyệt. Bạn mở xem hoặc huỷ đăng khi cần.</p>
      <ul className="list">
        {posts.map((j) => {
          const tt = TT_LABEL[j.trang_thai] || { label: j.trang_thai, tone: 'default' };
          return (
            <li key={j.id} className="card tone-hr">
              <div className="head">
                <span className="cand-name">{j.tieu_de}</span>
                <span className="row-right">
                  <span className={`stage tone-${tt.tone}`}>{tt.label}</span>
                  <time className="time" dateTime={j.created_at}>{formatRelative(j.created_at)}</time>
                </span>
              </div>
              <dl className="fields">
                <div className="field"><dt>Nền tảng</dt><dd>{(j.platform_id && platformName.get(j.platform_id)) || '—'}</dd></div>
                <div className="field"><dt>Giờ đặt đăng</dt><dd>{j.scheduled_at ? new Date(j.scheduled_at).toLocaleString('vi-VN') : '—'}</dd></div>
                {j.posted_at ? <div className="field"><dt>Đã đăng lúc</dt><dd>{new Date(j.posted_at).toLocaleString('vi-VN')}</dd></div> : null}
              </dl>
              <div className="row">
                {j.trang_thai !== 'posted' && j.trang_thai !== 'cancelled' ? (
                  <form action={updateJobPost}>
                    <input type="hidden" name="id" value={j.id} />
                    <input type="hidden" name="action" value="posted" />
                    <button className="btn ok" type="submit">Đánh dấu đã đăng</button>
                  </form>
                ) : null}
                {j.trang_thai !== 'cancelled' ? (
                  <form action={updateJobPost}>
                    <input type="hidden" name="id" value={j.id} />
                    <input type="hidden" name="action" value="cancel" />
                    <button className="btn ghost" type="submit">Huỷ đăng</button>
                  </form>
                ) : null}
                <form action={updateJobPost}>
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="action" value="delete" />
                  <button className="btn no" type="submit">Xoá</button>
                </form>
              </div>
            </li>
          );
        })}
        {posts.length === 0 ? <p className="muted">Chưa có tin đăng nào.</p> : null}
      </ul>
      <form action={addJobPost} className="settings-box">
        <b>Thêm tin đăng</b>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="note" name="tieu_de" placeholder="Tiêu đề tin" />
          <select className="note" name="platform_id" defaultValue="" aria-label="Nền tảng">
            <option value="">Chọn nền tảng</option>
            {platforms.map((p) => <option key={p.id} value={p.id}>{p.ten}</option>)}
          </select>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="note" type="datetime-local" name="scheduled_at" aria-label="Giờ đặt đăng" />
          <button className="btn ok" type="submit">Thêm</button>
        </div>
      </form>
    </>
  );

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Vị trí &amp; Đăng tin</h1>
          <p className="sub">Chọn mục để xem. Tin đăng chạy tự động, không qua duyệt, mở xem và huỷ được.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <DangTinSections
        viTri={viTri}
        nenTang={nenTang}
        tinDang={tinDang}
        counts={{ vitri: jobs.length, nentang: platforms.length, tindang: posts.length }}
      />
    </main>
  );
}
