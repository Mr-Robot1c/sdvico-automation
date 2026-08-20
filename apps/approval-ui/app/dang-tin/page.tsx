import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { addJobPost, trackPostedPost } from '../actions';
import { SubmitButton } from '../submit-button';
import PostListClient, { type PostMetrics } from '../post-list-client';
import { getAllChannels, isManual } from '../../lib/channels';
import { refreshStaleMetrics } from '../../lib/fb-metrics';

export const dynamic = 'force-dynamic';

type Post = {
  id: string; tieu_de: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; noi_dung: string | null; job_id: string | null;
  kenh: string | null; url: string | null; image_url: string | null;
  video_url: string | null;
  ghi_chu: string | null;
  fb_post_id: string | null; proof_path: string | null;
  loai: string | null;
  created_at: string;
  metrics?: PostMetrics | null;
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
    // Chỉ hiển thị bài tuyển dụng ở trang này. Bài tương tác có tab riêng /tuong-tac.
    // Dùng or() với loai is null để bài cũ trước khi migration đã áp (chưa có cột loai
    // hoặc loai=null) vẫn được coi là tuyển dụng và hiện đúng chỗ.
    client
      .from('hr_job_posts')
      .select('id, tieu_de, trang_thai, scheduled_at, posted_at, noi_dung, job_id, kenh, url, image_url, video_url, ghi_chu, fb_post_id, proof_path, loai, created_at')
      .is('deleted_at', null)
      .or('loai.eq.tuyen_dung,loai.is.null')
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

  const rawPosts = (jRes.data || []) as Post[];
  // Kéo số tương tác Facebook cho các bài đã đăng: nếu snapshot mới thì dùng cache,
  // cũ hơn TTL (mặc định 15 phút) thì tự gọi Graph API rồi upsert. Không cần cron.
  const jobPostMap = new Map<string, string>();
  for (const p of rawPosts) {
    if (p.fb_post_id && p.trang_thai === 'posted') jobPostMap.set(p.fb_post_id, p.id);
  }
  const metricsMap = await refreshStaleMetrics(client, jobPostMap);
  const posts: Post[] = rawPosts.map((p) => ({
    ...p,
    metrics: p.fb_post_id ? metricsMap.get(p.fb_post_id) || null : null,
  }));
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

  // Worklist "Đăng thủ công": bài kênh thủ công đã duyệt nhưng chưa đăng — việc người vận hành cần làm.
  const manualToPost = posts.filter(
    (p) => isManual(p.kenh) && approvedPostIds.has(p.id) && p.trang_thai !== 'posted' && p.trang_thai !== 'cancelled'
  ).length;
  // Tất cả kênh (built-in + tự thêm). Dùng cho: form track-only + nhãn/panel trong danh sách bài.
  const allChannels = await getAllChannels(client);
  const manualChannels = allChannels.filter((c) => c.enabled && c.method === 'manual');
  const channelMeta = Object.fromEntries(
    allChannels.map((c) => [c.kenh, { ten: c.ten, post_url: c.post_url, field_hints: c.field_hints }])
  );

  const missing = (code?: string) => code === 'PGRST205' || code === '42P01' || code === '42703';
  const needMigration = missing(jRes.error?.code);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Tin đăng</h1>
          <p className="sub">Danh sách bài tuyển dụng đã soạn: nháp, đặt lịch, đã đăng và bài đăng thủ công chờ ghi nhận.</p>
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

      {/* Worklist đăng thủ công: bài đã duyệt trên kênh không có API, chờ người vận hành đăng lên. */}
      {manualToPost > 0 ? (
        <div className="sys-status" style={{ marginTop: 8 }}>
          <span className="sys-label">Đăng thủ công:</span>
          <span className="sys-chip tone-mkt">
            <span className="sys-dot" />
            {manualToPost} bài đã duyệt, chờ bạn đăng lên kênh (mở bài để lấy nội dung và dán link về)
          </span>
        </div>
      ) : null}

      {needMigration ? (
        <div className="err" role="alert">
          Chưa bật đủ tính năng. Chạy migration <code>20260812090000_hr_social_posts.sql</code> trong Supabase rồi tải lại.
        </div>
      ) : (
        <PostListClient posts={posts} approvedPostIds={[...approvedPostIds]} channelMeta={channelMeta} />
      )}

      {/* Ghi nhận đã đăng (track-only): người tự đăng thẳng trên sàn có form riêng, chỉ ghi link để theo dõi.
          Không soạn, không qua Duyệt — vì không có nội dung máy sinh để gửi (điều cấm 1 không áp dụng). */}
      {manualChannels.length > 0 ? (
        <form action={trackPostedPost} className="settings-box" style={{ marginTop: 16 }}>
          <b>Ghi nhận đã đăng (đăng thẳng trên nền tảng)</b>
          <p className="muted" style={{ margin: '4px 0 8px', fontSize: '0.85em' }}>
            Dùng khi bạn tự đăng trực tiếp trên sàn (TopCV, VietnamWorks, ...) theo form riêng của sàn,
            không cần máy soạn. Chỉ ghi nhận link + ảnh để theo dõi — không qua bước Duyệt.
          </p>
          <div className="row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
            <select className="note" name="kenh" required aria-label="Kênh">
              {manualChannels.map((c) => <option key={c.kenh} value={c.kenh}>{c.ten}</option>)}
            </select>
            <select className="note" name="job_id" aria-label="Vị trí (tùy chọn)" defaultValue="">
              <option value="">Gắn vị trí (tùy chọn)</option>
              {allJobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input className="note" type="url" name="url" placeholder="Link bài đã đăng trên sàn" aria-label="Link bài đã đăng" />
            <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--ink-2)' }}>Ảnh bằng chứng:</span>
              <input type="file" name="proof_file" accept="image/*" style={{ fontSize: '0.85em' }} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <SubmitButton label="Ghi nhận đã đăng" />
          </div>
        </form>
      ) : null}

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
