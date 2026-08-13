import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';
import { addJobPost, queueFacebookPost, publishJobPost } from '../actions';
import DangTinSections from '../dang-tin-sections';
import { SubmitButton } from '../submit-button';
import PostListClient from '../post-list-client';

export const dynamic = 'force-dynamic';

type Job = {
  id: string; title: string; department: string | null; location: string | null;
  short_desc: string | null; requirements: string | null; jd_versions: Record<string, string> | null;
  status: string; created_at: string;
};
type Post = {
  id: string; tieu_de: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; noi_dung: string | null; job_id: string | null;
  kenh: string | null; url: string | null; image_url: string | null; ghi_chu: string | null;
  created_at: string; deleted_at: string | null;
};
type TrashPost = {
  id: string; tieu_de: string; kenh: string | null;
  trang_thai: string; deleted_at: string; created_at: string;
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
    .select('id, tieu_de, trang_thai, scheduled_at, posted_at, noi_dung, job_id, kenh, url, image_url, ghi_chu, created_at, deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(100);
  const trashRes = await client
    .from('hr_job_posts')
    .select('id, tieu_de, kenh, trang_thai, deleted_at, created_at')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('deleted_at', { ascending: false });
  const aqRes = await client
    .from('approval_queue')
    .select('ref_id')
    .eq('kind', 'hr_job_post')
    .eq('status', 'approved');

  const jobs = (jobsRes.data || []) as Job[];
  const missing = (code?: string) => code === 'PGRST205' || code === '42P01' || code === '42703';
  const needMigration = missing(jRes.error?.code);
  const posts = (jRes.data || []) as Post[];
  const trash = (trashRes.data || []) as TrashPost[];
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
      <PostListClient
        posts={posts}
        approvedPostIds={[...approvedPostIds]}
        trash={trash}
      />
      <form action={addJobPost} className="settings-box" style={{ marginTop: 16 }}>
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
