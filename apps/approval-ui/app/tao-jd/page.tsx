import { getServerClient } from '../../lib/supabase-server';
import { JOB_GROUPS } from '../../lib/jd-groups';
import AddJobPanel from './add-job-panel';
import JobTable, { JobFilters, type JobRow } from './job-table';
import { enabledChannels } from '../../lib/channels';

export const dynamic = 'force-dynamic';

type Job = {
  id: string; title: string; department: string | null; location: string | null;
  short_desc: string | null; requirements: string | null; jd_versions: Record<string, string> | null;
  nhom: string | null; status: string; headcount: number | null; created_at: string;
  auto_post: boolean | null; refresh_after_days: number | null;
};

type PostRow = {
  id: string; job_id: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; created_at: string; fb_post_id: string | null;
};

type PostStatus = {
  text: string;
  tone: string;
  composeLabel: string;
  composeDisabled: boolean;
  needsRefresh: boolean;
};

function postStatusLabel(
  post: PostRow | undefined,
  pendingPostIds: Set<string>,
  refreshAfterDays: number
): PostStatus {
  if (!post) return {
    text: 'Chưa có bài', tone: 'default',
    composeLabel: 'Soạn bài Facebook', composeDisabled: false, needsRefresh: false,
  };
  if (post.trang_thai === 'posted') {
    const daysAgo = post.posted_at
      ? Math.floor((Date.now() - new Date(post.posted_at).getTime()) / 86400000)
      : null;
    const stale = daysAgo !== null && daysAgo >= refreshAfterDays;
    const daysStr = daysAgo !== null ? ` ${daysAgo} ngày trước` : '';
    return {
      text: `Đã đăng${daysStr}`,
      tone: stale ? 'mkt' : 'ok',
      composeLabel: stale ? 'Soạn bài mới (refresh)' : 'Soạn thêm bài',
      composeDisabled: false,
      needsRefresh: stale,
    };
  }
  if (post.trang_thai === 'scheduled') {
    return {
      text: 'Đã lên lịch', tone: 'mkt',
      composeLabel: 'Đã lên lịch', composeDisabled: true, needsRefresh: false,
    };
  }
  if (post.trang_thai === 'draft' && pendingPostIds.has(post.id)) {
    return {
      text: 'Chờ duyệt', tone: 'mkt',
      composeLabel: 'Đang chờ duyệt', composeDisabled: true, needsRefresh: false,
    };
  }
  return {
    text: 'Có bản nháp', tone: 'default',
    composeLabel: 'Soạn bài Facebook', composeDisabled: false, needsRefresh: false,
  };
}

export default async function Page({ searchParams }: { searchParams?: { filter?: string } }) {
  const filter = searchParams?.filter || 'all';
  const client = getServerClient();

  const [jobsRes, postsRes, appsRes] = await Promise.all([
    client
      .from('hr_jobs')
      .select('id, title, department, location, short_desc, requirements, jd_versions, nhom, status, headcount, created_at, auto_post, refresh_after_days')
      .in('status', ['draft', 'open'])
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('hr_job_posts')
      .select('id, job_id, trang_thai, scheduled_at, posted_at, created_at, fb_post_id')
      .in('trang_thai', ['draft', 'scheduled', 'posted'])
      .order('created_at', { ascending: false }),
    // Đếm ứng viên theo vị trí: tổng hồ sơ và số đang chờ xem — để hiện ngay trên bảng vị trí.
    client.from('hr_applications').select('job_id, stage').limit(2000),
  ]);

  const allJobs = (jobsRes.data || []) as Job[];
  const allPosts = (postsRes.data || []) as PostRow[];
  const colMissing = jobsRes.error?.code === '42703';

  // Bản đồ job_id → số ứng viên (tổng và chờ xem).
  const candCountByJob = new Map<string, number>();
  const reviewCountByJob = new Map<string, number>();
  for (const a of ((appsRes.data || []) as Array<{ job_id: string | null; stage: string }>)) {
    if (!a.job_id) continue;
    candCountByJob.set(a.job_id, (candCountByJob.get(a.job_id) || 0) + 1);
    if (a.stage === 'review') reviewCountByJob.set(a.job_id, (reviewCountByJob.get(a.job_id) || 0) + 1);
  }

  // Kênh đang bật ngoài Facebook/LinkedIn (đã có nút riêng) — nút "Soạn [Kênh]" theo vị trí.
  const extraChannels = (await enabledChannels(client))
    .filter((c) => c.kenh !== 'facebook' && c.kenh !== 'linkedin')
    .map((c) => ({ kenh: c.kenh, ten: c.ten }));

  const latestPostByJob: Record<string, PostRow> = {};
  for (const p of allPosts) {
    if (!latestPostByJob[p.job_id]) latestPostByJob[p.job_id] = p;
  }

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

  // Đếm theo filter tab.
  const counts = {
    all: allJobs.length,
    auto: allJobs.filter((j) => j.status === 'open' && j.auto_post).length,
    open: allJobs.filter((j) => j.status === 'open' && !j.auto_post).length,
    draft: allJobs.filter((j) => j.status === 'draft').length,
  };

  // Lọc và chuẩn hóa thành JobRow cho JobTable.
  const filtered = allJobs.filter((j) => {
    if (filter === 'auto') return j.status === 'open' && !!j.auto_post;
    if (filter === 'open') return j.status === 'open' && !j.auto_post;
    if (filter === 'draft') return j.status === 'draft';
    return true;
  });

  const rows: JobRow[] = filtered.map((j) => {
    const post = latestPostByJob[j.id];
    const refresh = j.refresh_after_days ?? 30;
    const ps = postStatusLabel(post, pendingPostIds, refresh);
    return {
      id: j.id,
      title: j.title,
      department: j.department,
      location: j.location,
      headcount: j.headcount,
      status: j.status,
      autoPost: !!j.auto_post,
      refreshAfterDays: refresh,
      nhom: j.nhom,
      jdVersions: j.jd_versions || {},
      createdAt: j.created_at,
      candCount: candCountByJob.get(j.id) || 0,
      reviewCount: reviewCountByJob.get(j.id) || 0,
      postStatusText: ps.text,
      postStatusTone: ps.tone,
      composeLabel: ps.composeLabel,
      composeDisabled: ps.composeDisabled,
      needsRefresh: ps.needsRefresh,
    };
  });

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Vị trí tuyển dụng</h1>
          <p className="sub">
            Danh sách vị trí đang tuyển. Máy soạn, người bấm Duyệt mới gửi (điều cấm 1).
          </p>
        </div>
        <AddJobPanel />
      </header>

      {jobsRes.error && !colMissing ? (
        <p className="err" role="alert">Lỗi tải: {jobsRes.error.message}</p>
      ) : null}

      <JobFilters counts={counts} current={filter} />

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📋</div>
          <p>
            {counts.all === 0
              ? 'Chưa có vị trí nào. Bấm "+ Thêm vị trí" để bắt đầu.'
              : 'Không có vị trí nào khớp bộ lọc.'}
          </p>
        </div>
      ) : (
        <JobTable jobs={rows} extraChannels={extraChannels} />
      )}

      <details className="raw" style={{ marginTop: 24 }}>
        <summary>Danh mục nhóm ngành và kênh đăng gợi ý</summary>
        <ul className="list" style={{ marginTop: 8 }}>
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
