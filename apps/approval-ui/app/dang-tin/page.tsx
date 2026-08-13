import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { addJobPost } from '../actions';
import DangTinSections from '../dang-tin-sections';
import { SubmitButton } from '../submit-button';
import PostListClient from '../post-list-client';
import ViTriList from '../vi-tri-list';

export const dynamic = 'force-dynamic';

type Post = {
  id: string; tieu_de: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; noi_dung: string | null; job_id: string | null;
  kenh: string | null; url: string | null; image_url: string | null; ghi_chu: string | null;
  fb_post_id: string | null; created_at: string;
};

export default async function Page() {
  const client = getServerClient();
  const jobsRes = await client
    .from('hr_jobs')
    .select('id, title, department, location, short_desc, requirements, jd_versions, status, created_at')
    .order('created_at', { ascending: false }).limit(100);
  const jRes = await client
    .from('hr_job_posts')
    .select('id, tieu_de, trang_thai, scheduled_at, posted_at, noi_dung, job_id, kenh, url, image_url, ghi_chu, fb_post_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(100);
  const aqRes = await client
    .from('approval_queue')
    .select('ref_id')
    .eq('kind', 'hr_job_post')
    .eq('status', 'approved');

  const jobs = (jobsRes.data || []) as {
    id: string; title: string; department: string | null; location: string | null;
    short_desc: string | null; jd_versions: Record<string, string> | null;
    status: string; created_at: string;
  }[];
  const missing = (code?: string) => code === 'PGRST205' || code === '42P01' || code === '42703';
  const needMigration = missing(jRes.error?.code);
  const posts = (jRes.data || []) as Post[];
  const approvedPostIds = new Set((aqRes.data || []).map((r) => r.ref_id as string));

  const migrationNote = (
    <div className="err" role="alert">
      Chưa bật đủ tính năng này. Chạy các migration còn thiếu trong <code>supabase/migrations/</code> (mới nhất: <code>20260812090000_hr_social_posts.sql</code>) ở Supabase SQL editor, rồi tải lại trang.
    </div>
  );

  const viTri = (
    <ViTriList
      jobs={jobs}
      posts={posts}
      approvedPostIds={[...approvedPostIds]}
    />
  );

  const tinDang = needMigration ? migrationNote : (
    <>
      <PostListClient
        posts={posts}
        approvedPostIds={[...approvedPostIds]}
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
