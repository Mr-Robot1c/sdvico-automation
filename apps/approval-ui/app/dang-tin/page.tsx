import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { addJobPost } from '../actions';
import { SubmitButton } from '../submit-button';
import PostListClient from '../post-list-client';

export const dynamic = 'force-dynamic';

type Post = {
  id: string; tieu_de: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; noi_dung: string | null; job_id: string | null;
  kenh: string | null; url: string | null; image_url: string | null; ghi_chu: string | null;
  fb_post_id: string | null; created_at: string;
};

type RunEntry = { task: string; status: string; created_at: string };

function runAge(entry: RunEntry | undefined): { label: string; tone: string } {
  if (!entry) return { label: 'Chưa có dữ liệu', tone: 'default' };
  const mins = Math.round((Date.now() - new Date(entry.created_at).getTime()) / 60000);
  const label = mins < 1 ? 'Vừa xong' : mins < 60 ? `${mins} phút trước` : `${Math.round(mins / 60)}g trước`;
  const tone = entry.status === 'error' ? 'no' : mins > 20 ? 'default' : mins > 8 ? 'mkt' : 'ok';
  return { label: entry.status === 'error' ? `Lỗi · ${label}` : label, tone };
}

export default async function Page() {
  const client = getServerClient();

  const [jRes, aqRes, logRes, jobsRes] = await Promise.all([
    client
      .from('hr_job_posts')
      .select('id, tieu_de, trang_thai, scheduled_at, posted_at, noi_dung, job_id, kenh, url, image_url, ghi_chu, fb_post_id, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(100),
    client
      .from('approval_queue')
      .select('ref_id')
      .eq('kind', 'hr_job_post')
      .eq('status', 'approved'),
    client
      .from('run_log')
      .select('task, status, created_at')
      .in('task', ['hr.queue_facebook', 'hr.publish_facebook'])
      .order('created_at', { ascending: false })
      .limit(20),
    client
      .from('hr_jobs')
      .select('id, title, status')
      .in('status', ['open', 'draft']),
  ]);

  const posts = (jRes.data || []) as Post[];
  const approvedPostIds = new Set((aqRes.data || []).map((r) => r.ref_id as string));
  const logs = (logRes.data || []) as RunEntry[];

  const lastCompose  = logs.find((l) => l.task === 'hr.queue_facebook');
  const lastPublish  = logs.find((l) => l.task === 'hr.publish_facebook');
  const compose  = runAge(lastCompose);
  const publish  = runAge(lastPublish);

  const allJobs = (jobsRes.data || []) as { id: string; title: string; status: string }[];
  const openJobs = allJobs.filter((j) => j.status === 'open');
  const draftJobs = allJobs.filter((j) => j.status === 'draft');
  const activePostJobIds = new Set(
    posts.filter((p) => p.job_id && ['draft', 'scheduled', 'posted'].includes(p.trang_thai)).map((p) => p.job_id as string)
  );
  const openNeedingPost = openJobs.filter((j) => !activePostJobIds.has(j.id));

  const missing = (code?: string) => code === 'PGRST205' || code === '42P01' || code === '42703';
  const needMigration = missing(jRes.error?.code);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tin đăng tuyển dụng</h1>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {/* Trạng thái hệ thống tự động */}
      <div className="sys-status">
        <span className="sys-label">Hệ thống tự động:</span>
        <span className={`sys-chip tone-${compose.tone}`}>
          <span className="sys-dot" />
          Soạn bài: {compose.label}
        </span>
        <span className={`sys-chip tone-${publish.tone}`}>
          <span className="sys-dot" />
          Đăng bài: {publish.label}
        </span>
      </div>

      {needMigration ? (
        <div className="err" role="alert">
          Chưa bật đủ tính năng. Chạy migration <code>20260812090000_hr_social_posts.sql</code> trong Supabase rồi tải lại.
        </div>
      ) : (
        <PostListClient posts={posts} approvedPostIds={[...approvedPostIds]} />
      )}

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
    </main>
  );
}
