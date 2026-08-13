import { getServerClient } from '../../lib/supabase-server';
import { formatRelative } from '../labels';
import { JOB_GROUPS, JD_CHANNELS, GROUP_BY_KEY } from '../../lib/jd-groups';
import { createJdDraft, editJdVersion, regenerateJd, deleteJd, openAndQueueFbPost } from '../actions';
import { SubmitButton } from '../submit-button';

export const dynamic = 'force-dynamic';

type Job = {
  id: string; title: string; department: string | null; location: string | null;
  short_desc: string | null; requirements: string | null; jd_versions: Record<string, string> | null;
  nhom: string | null; status: string; headcount: number | null; created_at: string;
};

type PostRow = {
  id: string; job_id: string; trang_thai: string; scheduled_at: string | null; created_at: string;
};

function postStatusLabel(post: PostRow | undefined, pendingPostIds: Set<string>): { text: string; tone: string; canCompose: boolean } {
  if (!post) return { text: 'Chưa có bài đăng', tone: 'muted', canCompose: true };
  if (post.trang_thai === 'posted') return { text: 'Đã đăng Facebook', tone: 'ok', canCompose: false };
  if (post.trang_thai === 'scheduled') {
    const t = post.scheduled_at ? new Date(post.scheduled_at).toLocaleString('vi-VN') : '?';
    return { text: `Hẹn đăng lúc ${t}`, tone: 'mkt', canCompose: false };
  }
  if (post.trang_thai === 'draft' && pendingPostIds.has(post.id)) {
    return { text: 'Bài đang chờ duyệt', tone: 'mkt', canCompose: false };
  }
  return { text: 'Có bản nháp (chưa đưa duyệt)', tone: 'muted', canCompose: true };
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default async function Page() {
  const client = getServerClient();

  const [jobsRes, postsRes] = await Promise.all([
    client
      .from('hr_jobs')
      .select('id, title, department, location, short_desc, requirements, jd_versions, nhom, status, headcount, created_at')
      .in('status', ['draft', 'open'])
      .order('created_at', { ascending: false })
      .limit(50),
    client
      .from('hr_job_posts')
      .select('id, job_id, trang_thai, scheduled_at, created_at')
      .in('trang_thai', ['draft', 'scheduled', 'posted'])
      .order('created_at', { ascending: false }),
  ]);

  const allJobs = (jobsRes.data || []) as Job[];
  const allPosts = (postsRes.data || []) as PostRow[];
  const colMissing = jobsRes.error?.code === '42703';

  // Bản mới nhất mỗi job (theo created_at giảm dần nên phần tử đầu là mới nhất).
  const latestPostByJob: Record<string, PostRow> = {};
  for (const p of allPosts) {
    if (!latestPostByJob[p.job_id]) latestPostByJob[p.job_id] = p;
  }

  // Kiểm tra bài nào đang chờ duyệt.
  const postIds = allPosts.map((p) => p.id).filter(Boolean);
  const pendingPostIds = new Set<string>();
  if (postIds.length > 0) {
    const { data: qItems } = await client
      .from('approval_queue')
      .select('ref_id')
      .in('ref_id', postIds)
      .eq('kind', 'hr_job_post')
      .eq('status', 'pending');
    for (const q of qItems || []) { if (q.ref_id) pendingPostIds.add(q.ref_id); }
  }

  const drafts = allJobs.filter((j) => j.status === 'draft');
  const openJobs = allJobs.filter((j) => j.status === 'open');
  const allPositions = JOB_GROUPS.flatMap((g) => g.vi_tri);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Vị trí tuyển dụng</h1>
          <p className="sub">Tạo mô tả công việc, xem xét rồi soạn bài đăng để đưa vào Duyệt. Máy soạn, người bấm Duyệt mới gửi (điều cấm 1).</p>
        </div>
      </header>

      {colMissing ? (
        <div className="err" role="alert">
          Chưa áp migration. Chạy các file trong <code>supabase/migrations/</code> trong Supabase SQL editor, rồi tải lại trang.
        </div>
      ) : null}
      {jobsRes.error && !colMissing ? <p className="err" role="alert">Lỗi tải dữ liệu: {jobsRes.error.message}</p> : null}

      {/* Form tạo vị trí mới */}
      <form action={createJdDraft} className="settings-box">
        <b>Tạo vị trí mới</b>
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
          <input
            className="note"
            name="headcount"
            type="number"
            min="1"
            max="99"
            defaultValue="1"
            placeholder="Số lượng cần tuyển"
            style={{ width: 80 }}
            aria-label="Số lượng cần tuyển"
          />
        </div>
        <textarea name="short_desc" rows={3} placeholder="Mô tả công việc" style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} aria-label="Mô tả công việc" />
        <textarea name="requirements" rows={3} placeholder="Yêu cầu ứng viên" style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} aria-label="Yêu cầu ứng viên" />
        <textarea name="benefits" rows={2} placeholder="Quyền lợi, phúc lợi. Để trống thì AI ghi chung là thỏa thuận, không bịa số." style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} aria-label="Quyền lợi" />
        <input
          className="note"
          name="image_hint"
          placeholder="Từ khóa ảnh (không bắt buộc) — giúp Unsplash tìm ảnh đúng ngành hơn, ví dụ: tàu cá biển định vị GPS"
          style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }}
          aria-label="Từ khóa ảnh Unsplash"
        />
        <div className="row" style={{ marginTop: 8 }}>
          <SubmitButton label="AI viết bốn phiên bản JD" pendingLabel="AI đang viết, chờ vài giây..." />
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Cần khóa GROQ_API_KEY trong môi trường máy chủ để AI viết. Chưa có khóa thì hệ thống vẫn tạo bản ghép cơ bản để bạn sửa.</p>
      </form>

      {/* Danh sách vị trí đang tuyển */}
      {openJobs.length > 0 ? (
        <>
          <h2 style={{ marginTop: 20 }}>Đang tuyển ({openJobs.length})</h2>
          <ul className="list">
            {openJobs.map((j) => {
              const post = latestPostByJob[j.id];
              const { text: statusText, tone: statusTone, canCompose } = postStatusLabel(post, pendingPostIds);
              const g = j.nhom ? GROUP_BY_KEY[j.nhom] : null;
              return (
                <li key={j.id} className="card tone-hr">
                  <div className="head">
                    <span className="cand-name">{j.title}</span>
                    <time className="time" dateTime={j.created_at}>{formatRelative(j.created_at)}</time>
                  </div>
                  <div className="stages">
                    {j.headcount ? <span className="src">Cần tuyển {j.headcount} người</span> : null}
                    {j.location ? <span className="src">{j.location}</span> : null}
                    {g ? <span className="src">Nhóm {g.key}</span> : null}
                    <span className={`src ${statusTone === 'ok' ? 'ok' : statusTone === 'mkt' ? 'mkt' : ''}`}
                      style={{ fontWeight: 500 }}>{statusText}</span>
                  </div>
                  {canCompose ? (
                    <div style={{ marginTop: 8 }}>
                      <form action={openAndQueueFbPost}>
                        <input type="hidden" name="job_id" value={j.id} />
                        <SubmitButton label="Soạn bài Facebook và đưa vào Duyệt" pendingLabel="AI đang soạn bài, chờ 10-20 giây..." />
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {/* Bản nháp chưa hoàn thiện */}
      <h2 style={{ marginTop: 20 }}>Bản nháp ({drafts.length})</h2>
      {drafts.length === 0 ? (
        <p className="muted">Chưa có bản nháp nào. Nhập thông tin phía trên để tạo.</p>
      ) : null}
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
                {j.headcount ? <span className="src">Cần tuyển {j.headcount} người</span> : null}
                {j.location ? <span className="src">{j.location}</span> : null}
                {g ? <span className="src">Kênh gợi ý: {g.kenh.join(', ')}</span> : null}
              </div>

              {/* Xem và sửa 4 phiên bản JD trước khi soạn bài */}
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

              <div className="row" style={{ marginTop: 10 }}>
                <form action={regenerateJd}>
                  <input type="hidden" name="job_id" value={j.id} />
                  <SubmitButton label="Viết lại bằng AI" pendingLabel="AI đang viết lại..." className="btn ghost" />
                </form>
                {/* Nút chính: soạn bài Facebook, mở tuyển và đưa vào Duyệt cùng lúc */}
                <form action={openAndQueueFbPost}>
                  <input type="hidden" name="job_id" value={j.id} />
                  <SubmitButton label="Soạn bài Facebook và đưa vào Duyệt" pendingLabel="AI đang soạn bài, chờ 10-20 giây..." />
                </form>
                <form action={deleteJd}>
                  <input type="hidden" name="job_id" value={j.id} />
                  <SubmitButton label="Xóa nháp" pendingLabel="Đang xoá..." className="btn no" />
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      <details className="raw" style={{ marginTop: 16 }}>
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
    </main>
  );
}
