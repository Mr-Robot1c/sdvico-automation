import { getServerClient } from '../../lib/supabase-server';
import { formatRelative } from '../labels';
import { JOB_GROUPS, JD_CHANNELS, GROUP_BY_KEY } from '../../lib/jd-groups';
import { createJdDraft, editJdVersion, regenerateJd, finalizeJd, deleteJd } from '../actions';
import { SubmitButton } from '../submit-button';

// Luôn lấy dữ liệu mới.
export const dynamic = 'force-dynamic';

type Job = {
  id: string; title: string; department: string | null; location: string | null;
  short_desc: string | null; requirements: string | null; jd_versions: Record<string, string> | null;
  nhom: string | null; status: string; created_at: string;
};

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('hr_jobs')
    .select('id, title, department, location, short_desc, requirements, jd_versions, nhom, status, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(50);

  const drafts = (data || []) as Job[];
  const colMissing = error?.code === '42703';
  const allPositions = JOB_GROUPS.flatMap((g) => g.vi_tri);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tạo mô tả công việc</h1>
          <p className="sub">Nhập thông tin vị trí, AI viết bốn phiên bản cho bốn kênh. Bạn sửa rồi bấm Hoàn thành. Máy soạn, người xác nhận.</p>
        </div>
      </header>

      {colMissing ? (
        <div className="err" role="alert">
          Chưa áp migration. Chạy <code>supabase/migrations/20260812100000_hr_jobs_group.sql</code> trong Supabase SQL editor, rồi tải lại trang.
        </div>
      ) : null}
      {error && !colMissing ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <form action={createJdDraft} className="settings-box">
        <b>Thông tin vị trí</b>
        <div className="row" style={{ marginTop: 8 }}>
          <select className="note" name="nhom" defaultValue="" aria-label="Nhóm ngành">
            <option value="">Chọn nhóm ngành</option>
            {JOB_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.key}. {g.ten}</option>)}
          </select>
          <input className="note" name="title" placeholder="Tên vị trí" list="positions" required />
        </div>
        <datalist id="positions">
          {allPositions.map((p) => <option key={p} value={p} />)}
        </datalist>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="note" name="department" placeholder="Phòng ban (không bắt buộc)" />
          <input className="note" name="location" placeholder="Nơi làm việc, ví dụ Vũng Tàu" />
        </div>
        <textarea name="short_desc" rows={3} placeholder="Mô tả công việc" style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} aria-label="Mô tả công việc" />
        <textarea name="requirements" rows={3} placeholder="Yêu cầu ứng viên" style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} aria-label="Yêu cầu ứng viên" />
        <textarea name="benefits" rows={2} placeholder="Quyền lợi, phúc lợi. Để trống thì AI ghi chung là thỏa thuận, không bịa số." style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} aria-label="Quyền lợi" />
        <div className="row" style={{ marginTop: 8 }}>
          <SubmitButton label="Tạo bốn bản JD bằng AI" pendingLabel="AI đang viết, chờ vài giây..." />
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Cần khóa GROQ_API_KEY trong môi trường máy chủ để AI viết. Chưa có khóa thì hệ thống vẫn tạo bản ghép cơ bản để bạn sửa.</p>
      </form>

      <details className="raw" style={{ marginTop: 12 }}>
        <summary>Danh mục nhóm ngành và kênh đăng gợi ý</summary>
        <ul className="list">
          {JOB_GROUPS.map((g) => (
            <li key={g.key} className="card tone-mkt">
              <div className="head"><span className="cand-name">{g.key}. {g.ten}</span></div>
              <p className="job-desc">{g.chan_dung}</p>
              <dl className="fields">
                <div className="field"><dt>Vị trí</dt><dd>{g.vi_tri.join(', ')}</dd></div>
                <div className="field"><dt>Kênh đăng</dt><dd>{g.kenh.join(', ')}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </details>

      <h2 style={{ marginTop: 16 }}>Bản nháp chờ hoàn thiện ({drafts.length})</h2>
      <ul className="list">
        {drafts.map((j) => {
          const versions = j.jd_versions || {};
          const g = j.nhom ? GROUP_BY_KEY[j.nhom] : null;
          return (
            <li key={j.id} className="card tone-hr">
              <div className="head">
                <span className="cand-name">{j.title}</span>
                <time className="time" dateTime={j.created_at}>{formatRelative(j.created_at)}</time>
              </div>
              <div className="stages">
                {g ? <span className="src">Nhóm {g.key}</span> : null}
                {j.location ? <span className="src">{j.location}</span> : null}
                {g ? <span className="src">Kênh gợi ý: {g.kenh.join(', ')}</span> : null}
              </div>

              {JD_CHANNELS.map((c) => (
                <details className="raw" key={c.key}>
                  <summary>{c.ten} ({wordCount(String(versions[c.key] || ''))} từ, mục tiêu {c.tu[0]} tới {c.tu[1]})</summary>
                  <form action={editJdVersion} style={{ marginTop: 6 }}>
                    <input type="hidden" name="job_id" value={j.id} />
                    <input type="hidden" name="key" value={c.key} />
                    <textarea
                      name="value"
                      defaultValue={versions[c.key] || ''}
                      rows={c.key === 'website' ? 12 : c.key === 'job_board' ? 8 : 4}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      aria-label={`Bản ${c.ten}`}
                    />
                    <SubmitButton label={`Lưu bản ${c.ten}`} pendingLabel="Đang lưu..." className="btn ok" style={{ marginTop: 6 }} />
                  </form>
                </details>
              ))}

              <div className="row" style={{ marginTop: 8 }}>
                <form action={regenerateJd}>
                  <input type="hidden" name="job_id" value={j.id} />
                  <SubmitButton label="Viết lại bằng AI" pendingLabel="AI đang viết lại..." className="btn ghost" />
                </form>
                <form action={finalizeJd}>
                  <input type="hidden" name="job_id" value={j.id} />
                  <SubmitButton label="Hoàn thành, đưa vào danh sách tuyển" pendingLabel="Đang xử lý..." />
                </form>
                <form action={deleteJd}>
                  <input type="hidden" name="job_id" value={j.id} />
                  <SubmitButton label="Xóa nháp" pendingLabel="Đang xoá..." className="btn no" />
                </form>
              </div>
            </li>
          );
        })}
        {drafts.length === 0 ? <p className="muted">Chưa có bản nháp nào. Nhập thông tin phía trên để tạo.</p> : null}
      </ul>
    </main>
  );
}
