import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

// Nhãn bốn kênh JD, khớp packages/hr/src/jd/channels.js.
const JD_LABELS: Record<string, string> = {
  website: 'Website công ty',
  job_board: 'Trang tuyển dụng',
  facebook: 'Facebook',
  zalo_sms: 'Zalo / SMS'
};
const JD_ORDER = ['website', 'job_board', 'facebook', 'zalo_sms'];

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' },
  open: { label: 'Đang tuyển', tone: 'ok' },
  closed: { label: 'Đã đóng', tone: 'no' }
};

type Job = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  short_desc: string | null;
  requirements: string | null;
  jd_versions: Record<string, string> | null;
  status: string;
  created_at: string;
};

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('hr_jobs')
    .select('id, title, department, location, short_desc, requirements, jd_versions, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const jobs = (data || []) as Job[];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Vị trí tuyển dụng</h1>
          <p className="sub">Vị trí và bốn phiên bản mô tả công việc theo kênh. Sinh bằng lệnh /hr-jd.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {!error && jobs.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📋</div>
          <p>Chưa có vị trí nào.</p>
          <p className="sub">Dùng lệnh /hr-jd để sinh mô tả công việc bốn kênh và lưu vào đây.</p>
        </div>
      ) : null}

      <ul className="list">
        {jobs.map((j) => {
          const st = STATUS[j.status] || { label: j.status, tone: 'default' };
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
              {j.requirements ? (
                <dl className="fields"><div className="field"><dt>Yêu cầu</dt><dd>{j.requirements}</dd></div></dl>
              ) : null}

              {keys.length ? (
                <div className="jd-versions">
                  {keys.map((k) => (
                    <details className="raw" key={k}>
                      <summary>{JD_LABELS[k] || k} ({String(versions[k]).trim().split(/\s+/).length} từ)</summary>
                      <pre>{versions[k]}</pre>
                    </details>
                  ))}
                </div>
              ) : (
                <p className="muted">Chưa có phiên bản JD nào.</p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
