import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';
import { addJobPost, updateJobPost, queueFacebookPost, editJobPostDraft, publishJobPost } from '../actions';
import DangTinSections from '../dang-tin-sections';
import { SubmitButton } from '../submit-button';

export const dynamic = 'force-dynamic';

type Job = {
  id: string; title: string; department: string | null; location: string | null;
  short_desc: string | null; requirements: string | null; jd_versions: Record<string, string> | null;
  status: string; created_at: string;
};
type Post = {
  id: string; tieu_de: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; noi_dung: string | null; job_id: string | null;
  kenh: string | null; url: string | null; image_url: string | null; ghi_chu: string | null; created_at: string;
};

const JD_LABELS: Record<string, string> = { website: 'Website công ty', job_board: 'Trang tuyển dụng', facebook: 'Facebook', zalo_sms: 'Zalo / SMS' };
const JD_ORDER = ['website', 'job_board', 'facebook', 'zalo_sms'];
const JOB_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' }, open: { label: 'Đang tuyển', tone: 'ok' }, closed: { label: 'Đã đóng', tone: 'no' }
};
const TT_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp, chờ duyệt', tone: 'default' }, scheduled: { label: 'Đặt lịch', tone: 'mkt' },
  posted: { label: 'Đã đăng', tone: 'ok' }, failed: { label: 'Đăng lỗi', tone: 'no' }, cancelled: { label: 'Đã huỷ', tone: 'no' }
};

export default async function Page() {
  const client = getServerClient();
  const jobsRes = await client
    .from('hr_jobs')
    .select('id, title, department, location, short_desc, requirements, jd_versions, status, created_at')
    .order('created_at', { ascending: false }).limit(100);
  const jRes = await client
    .from('hr_job_posts')
    .select('id, tieu_de, trang_thai, scheduled_at, posted_at, noi_dung, job_id, kenh, url, image_url, ghi_chu, created_at')
    .order('created_at', { ascending: false }).limit(100);
  const aqRes = await client
    .from('approval_queue')
    .select('ref_id')
    .eq('kind', 'hr_job_post')
    .eq('status', 'approved');

  const jobs = (jobsRes.data || []) as Job[];
  const missing = (code?: string) => code === 'PGRST205' || code === '42P01' || code === '42703';
  const needMigration = missing(jRes.error?.code);
  const posts = (jRes.data || []) as Post[];
  const approvedPostIds = new Set((aqRes.data || []).map((r) => r.ref_id as string));

  // Ánh xạ job_id → bài đăng Facebook gần nhất (ưu tiên: posted > scheduled > draft > failed).
  const ORDER = ['posted', 'scheduled', 'draft', 'failed', 'cancelled'];
  const postByJobId = new Map<string, Post>();
  for (const p of [...posts].sort((a, b) => ORDER.indexOf(a.trang_thai) - ORDER.indexOf(b.trang_thai))) {
    if (p.job_id && !postByJobId.has(p.job_id)) postByJobId.set(p.job_id, p);
  }

  const migrationNote = (
    <div className="err" role="alert">
      Chưa bật đủ tính năng này. Chạy các migration còn thiếu trong <code>supabase/migrations/</code> (mới nhất: <code>20260812090000_hr_social_posts.sql</code>) ở Supabase SQL editor, rồi tải lại trang.
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

            {/* Trạng thái bài Facebook liên kết — hiển thị ngay tại đây, không cần chuyển tab */}
            {(() => {
              const p = postByJobId.get(j.id);
              if (!p) {
                return (
                  <form action={queueFacebookPost} style={{ marginTop: 8 }}>
                    <input type="hidden" name="job_id" value={j.id} />
                    <SubmitButton label="Soạn bài Facebook và đưa vào hàng đợi duyệt" pendingLabel="Đang soạn bài..." />
                  </form>
                );
              }
              const tt = TT_LABEL[p.trang_thai] || { label: p.trang_thai, tone: 'default' };
              const isApproved = approvedPostIds.has(p.id);
              const canPost = (isApproved || p.trang_thai === 'failed') && p.trang_thai !== 'posted';
              return (
                <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span className={`stage tone-${tt.tone}`} style={{ fontSize: '0.85em' }}>Facebook: {tt.label}</span>
                  {p.trang_thai === 'scheduled' && p.scheduled_at
                    ? <span className="muted" style={{ fontSize: '0.82em' }}>Đặt lúc {new Date(p.scheduled_at).toLocaleString('vi-VN')}</span>
                    : null}
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85em' }}>Xem bài</a> : null}
                  {canPost ? (
                    <form action={publishJobPost}>
                      <input type="hidden" name="post_id" value={p.id} />
                      <SubmitButton label={p.trang_thai === 'failed' ? 'Thử lại' : 'Đăng ngay'} pendingLabel="Đang đăng..." className="btn ok" style={{ fontSize: '0.85em', padding: '4px 10px' }} />
                    </form>
                  ) : null}
                  {p.trang_thai !== 'posted' ? (
                    <a href="/" style={{ fontSize: '0.82em', color: 'var(--muted)' }}>
                      {isApproved ? 'Đã duyệt' : 'Vào trang Duyệt để duyệt'}
                    </a>
                  ) : null}
                </div>
              );
            })()}
          </li>
        );
      })}
      {jobs.length === 0 ? <p className="muted">Chưa có vị trí nào. Dùng trang Tạo JD để tạo mô tả công việc.</p> : null}
    </ul>
  );

  const tinDang = needMigration ? migrationNote : (
    <>
      <p className="muted" style={{ margin: '0 0 10px' }}>Máy soạn bài, đẩy vào hàng đợi. Bạn xem và sửa ở đây, bấm Duyệt ở trang Duyệt, rồi worker mới đăng lên Facebook. Máy soạn, người bấm (điều cấm 1).</p>
      <ul className="list">
        {posts.map((j) => {
          const tt = TT_LABEL[j.trang_thai] || { label: j.trang_thai, tone: 'default' };
          const isApproved = approvedPostIds.has(j.id);
          const canEdit = j.trang_thai !== 'posted' && j.trang_thai !== 'cancelled';
          const canRetry = j.trang_thai === 'failed';
          const scheduledDefault = j.scheduled_at
            ? new Date(j.scheduled_at).toISOString().slice(0, 16)
            : '';
          return (
            <li key={j.id} className="card tone-hr">
              <div className="head">
                <span className="cand-name">{j.tieu_de}</span>
                <span className="row-right">
                  {isApproved && canEdit ? <span className="stage tone-ok">Đã duyệt</span> : null}
                  <span className={`stage tone-${tt.tone}`}>{tt.label}</span>
                  <time className="time" dateTime={j.created_at}>{formatRelative(j.created_at)}</time>
                </span>
              </div>
              <dl className="fields">
                <div className="field"><dt>Kênh</dt><dd>{j.kenh === 'facebook' ? 'Facebook' : (j.kenh || '—')}</dd></div>
                <div className="field"><dt>Giờ đặt đăng</dt><dd>{j.scheduled_at ? new Date(j.scheduled_at).toLocaleString('vi-VN') : '—'}</dd></div>
                {j.posted_at ? <div className="field"><dt>Đã đăng lúc</dt><dd>{new Date(j.posted_at).toLocaleString('vi-VN')}</dd></div> : null}
              </dl>
              {j.trang_thai === 'failed' && j.ghi_chu ? (
                <div className="err" role="alert" style={{ margin: '6px 0', fontSize: '0.9em' }}>
                  Lỗi khi đăng: {j.ghi_chu}
                </div>
              ) : null}
              {j.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={j.image_url} alt="Ảnh đính kèm" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, margin: '4px 0 6px', objectFit: 'cover' }} />
              ) : null}
              {j.url ? <p className="muted" style={{ margin: '2px 0 6px' }}><a href={j.url} target="_blank" rel="noreferrer">Xem bài đã đăng</a></p> : null}
              {j.noi_dung ? (
                <details className="raw">
                  <summary>Xem nội dung ({j.noi_dung.trim().split(/\s+/).length} từ)</summary>
                  <pre>{j.noi_dung}</pre>
                </details>
              ) : null}
              {canEdit ? (
                <details className="raw">
                  <summary>Chỉnh sửa nội dung, ảnh và giờ đặt đăng</summary>
                  <form action={editJobPostDraft} style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input type="hidden" name="post_id" value={j.id} />
                    <textarea name="noi_dung" defaultValue={j.noi_dung || ''} rows={8} aria-label="Nội dung bài đăng" style={{ width: '100%', boxSizing: 'border-box' }} />
                    <input className="note" type="url" name="image_url" defaultValue={j.image_url || ''} placeholder="URL hình ảnh (để trống nếu không cần ảnh)" aria-label="URL hình ảnh" />
                    <input className="note" type="datetime-local" name="scheduled_at" defaultValue={scheduledDefault} aria-label="Giờ đặt đăng" />
                    <SubmitButton label="Lưu chỉnh sửa" pendingLabel="Đang lưu..." />
                  </form>
                </details>
              ) : null}
              <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                {(isApproved || canRetry) && canEdit ? (
                  <form action={publishJobPost}>
                    <input type="hidden" name="post_id" value={j.id} />
                    <SubmitButton
                      label={canRetry ? 'Thử đăng lại' : 'Đăng ngay lên Facebook'}
                      pendingLabel="Đang đăng lên Facebook..."
                    />
                  </form>
                ) : null}
                {!isApproved && !canRetry && canEdit ? (
                  <span className="muted" style={{ fontSize: '0.85em', alignSelf: 'center' }}>Duyệt trên trang Duyệt để mở khoá Đăng ngay</span>
                ) : null}
                {j.trang_thai !== 'posted' && j.trang_thai !== 'cancelled' ? (
                  <form action={updateJobPost}>
                    <input type="hidden" name="id" value={j.id} />
                    <input type="hidden" name="action" value="posted" />
                    <SubmitButton label="Đánh dấu đã đăng (thủ công)" className="btn ghost" />
                  </form>
                ) : null}
                {j.trang_thai !== 'cancelled' ? (
                  <form action={updateJobPost}>
                    <input type="hidden" name="id" value={j.id} />
                    <input type="hidden" name="action" value="cancel" />
                    <SubmitButton label="Huỷ" className="btn ghost" />
                  </form>
                ) : null}
                <form action={updateJobPost}>
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="action" value="delete" />
                  <SubmitButton label="Xoá" className="btn no" />
                </form>
              </div>
            </li>
          );
        })}
        {posts.length === 0 ? <p className="muted">Chưa có tin đăng nào. Vào tab Vị trí, bấm "Soạn bài Facebook" để tạo bài.</p> : null}
      </ul>
      <form action={addJobPost} className="settings-box">
        <b>Thêm tin đăng thủ công</b>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="note" name="tieu_de" placeholder="Tiêu đề tin" required />
          <input className="note" type="datetime-local" name="scheduled_at" aria-label="Giờ đặt đăng" />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <SubmitButton label="Thêm" />
        </div>
      </form>
    </>
  );

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Vị trí &amp; Đăng tin</h1>
          <p className="sub">Soạn bài từ vị trí tuyển dụng, duyệt rồi đăng Facebook.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      <DangTinSections
        viTri={viTri}
        tinDang={tinDang}
        counts={{ vitri: jobs.length, tindang: posts.length }}
      />
    </main>
  );
}
