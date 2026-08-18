import { getServerClient } from '../../lib/supabase-server';
import { formatRelative, formatDateTime } from '../labels';
import { JOB_GROUPS, JD_CHANNELS, GROUP_BY_KEY } from '../../lib/jd-groups';
import { editJdVersion, regenerateJd, deleteJd, openAndQueueFbPost, openAndQueueLinkedInPost, openAndQueueChannelPost, finalizeJd } from '../actions';
import { SubmitButton } from '../submit-button';
import AutoPostToggle from './auto-post-toggle';
import AddJobPanel from './add-job-panel';
import RemoveJobButton from './remove-job-button';
import { enabledChannels } from '../../lib/channels';

export const dynamic = 'force-dynamic';

// Nút "Soạn [Kênh]" cho các sàn đang bật ngoài Facebook/LinkedIn (đã có nút riêng).
// Kênh thủ công (TopCV, VietnamWorks, ...): soạn nháp -> đưa vào Duyệt như FB/LinkedIn.
function ChannelComposeButtons({ jobId, channels }: { jobId: string; channels: { kenh: string; ten: string }[] }) {
  if (channels.length === 0) return null;
  return (
    <>
      {channels.map((c) => (
        <form key={c.kenh} action={openAndQueueChannelPost}>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="kenh" value={c.kenh} />
          <SubmitButton label={`Soạn ${c.ten}`} pendingLabel="Đang soạn..." className="btn ghost" style={{ fontSize: '0.85em' }} />
        </form>
      ))}
    </>
  );
}

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
    text: 'Chưa có bài đăng', tone: 'muted',
    composeLabel: 'Soạn bài Facebook', composeDisabled: false, needsRefresh: false,
  };
  if (post.trang_thai === 'posted') {
    const daysAgo = post.posted_at
      ? Math.floor((Date.now() - new Date(post.posted_at).getTime()) / 86400000)
      : null;
    const stale = daysAgo !== null && daysAgo >= refreshAfterDays;
    const daysStr = daysAgo !== null ? ` (${daysAgo} ngày trước)` : '';
    return {
      text: `Đã đăng Facebook${daysStr}`,
      tone: stale ? 'mkt' : 'ok',
      composeLabel: stale ? 'Soạn bài mới (refresh)' : 'Soạn thêm bài',
      composeDisabled: false,
      needsRefresh: stale,
    };
  }
  if (post.trang_thai === 'scheduled') {
    const t = post.scheduled_at ? formatDateTime(post.scheduled_at) : 'chưa rõ';
    return {
      text: `Hẹn đăng lúc ${t}`, tone: 'mkt',
      composeLabel: 'Đã lên lịch', composeDisabled: true, needsRefresh: false,
    };
  }
  if (post.trang_thai === 'draft' && pendingPostIds.has(post.id)) {
    return {
      text: 'Bài đang chờ duyệt', tone: 'mkt',
      composeLabel: 'Đang chờ duyệt', composeDisabled: true, needsRefresh: false,
    };
  }
  return {
    text: 'Có bản nháp (chưa đưa duyệt)', tone: 'muted',
    composeLabel: 'Soạn bài Facebook', composeDisabled: false, needsRefresh: false,
  };
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default async function Page() {
  const client = getServerClient();

  const [jobsRes, postsRes] = await Promise.all([
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
  ]);

  const allJobs = (jobsRes.data || []) as Job[];
  const allPosts = (postsRes.data || []) as PostRow[];
  const colMissing = jobsRes.error?.code === '42703';

  // Kênh đang bật ngoài Facebook/LinkedIn (đã có nút riêng) — hiện nút "Soạn [Kênh]" theo vị trí.
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

  const autoQueue = allJobs.filter((j) => j.status === 'open' && j.auto_post);
  const openOther = allJobs.filter((j) => j.status === 'open' && !j.auto_post);
  const drafts = allJobs.filter((j) => j.status === 'draft');

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Vị trí tuyển dụng</h1>
          <p className="sub">
            Danh sách tự động đăng bài theo lịch. Máy soạn, người bấm Duyệt mới gửi (điều cấm 1).
          </p>
        </div>
        <AddJobPanel />
      </header>

      {jobsRes.error && !colMissing ? <p className="err" role="alert">Lỗi tải: {jobsRes.error.message}</p> : null}

      {/* === Danh sách tự động đăng bài === */}
      <h2 style={{ marginTop: 20 }}>
        Tự động đăng bài ({autoQueue.length})
        {autoQueue.length === 0 ? (
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-2)', marginLeft: 10 }}>
            — Bật toggle trên vị trí bất kỳ để thêm vào đây
          </span>
        ) : null}
      </h2>

      {autoQueue.length > 0 ? (
        <ul className="list">
          {autoQueue.map((j) => {
            const post = latestPostByJob[j.id];
            const refreshDays = j.refresh_after_days ?? 4;
            const { text: statusText, tone: statusTone, composeLabel, composeDisabled, needsRefresh } = postStatusLabel(post, pendingPostIds, refreshDays);
            const g = j.nhom ? GROUP_BY_KEY[j.nhom] : null;
            return (
              <li key={j.id} className="queue-card">
                <div className="queue-card-head">
                  <span className="queue-card-title">{j.title}</span>
                  <AutoPostToggle jobId={j.id} isOn={true} />
                </div>
                <div className="queue-card-meta">
                  {j.headcount ? <span className="queue-tag def">Tuyển {j.headcount} người</span> : null}
                  {j.location ? <span className="queue-tag def">{j.location}</span> : null}
                  {g ? <span className="queue-tag def">Nhóm {g.key}</span> : null}
                  <span className={`queue-tag ${statusTone === 'ok' ? 'ok' : statusTone === 'mkt' ? 'mkt' : 'def'}`}>
                    {statusText}
                  </span>
                  {needsRefresh ? (
                    <span className="queue-tag mkt">Cần refresh — cron sẽ soạn bài mới</span>
                  ) : null}
                </div>
                <div className="queue-card-actions">
                  {composeDisabled ? (
                    <span className="btn ghost" style={{ opacity: 0.45, cursor: 'default', fontSize: '0.85em' }}>
                      {composeLabel}
                    </span>
                  ) : (
                    <form action={openAndQueueFbPost}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label={composeLabel} pendingLabel="AI đang soạn..." className="btn ok" />
                    </form>
                  )}
                  <form action={openAndQueueLinkedInPost}>
                    <input type="hidden" name="job_id" value={j.id} />
                    <SubmitButton label="Soạn LinkedIn" pendingLabel="Đang soạn..." className="btn ghost" />
                  </form>
                  <ChannelComposeButtons jobId={j.id} channels={extraChannels} />
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', alignSelf: 'center' }}>
                    Refresh mỗi {refreshDays} ngày
                  </span>
                </div>
                <div className="card-danger-row">
                  <RemoveJobButton jobId={j.id} jobTitle={j.title} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* === Tất cả vị trí đang tuyển (không tự động) === */}
      {openOther.length > 0 ? (
        <>
          <h2 style={{ marginTop: 28 }}>Đang tuyển — chưa tự động ({openOther.length})</h2>
          <ul className="list">
            {openOther.map((j) => {
              const post = latestPostByJob[j.id];
              const { text: statusText, tone: statusTone, composeLabel, composeDisabled } = postStatusLabel(post, pendingPostIds, 4);
              const g = j.nhom ? GROUP_BY_KEY[j.nhom] : null;
              return (
                <li key={j.id} className="card tone-hr">
                  <div className="head">
                    <span className="cand-name">{j.title}</span>
                    <time className="time" dateTime={j.created_at}>{formatRelative(j.created_at)}</time>
                  </div>
                  <div className="stages">
                    {j.headcount ? <span className="src">Tuyển {j.headcount} người</span> : null}
                    {j.location ? <span className="src">{j.location}</span> : null}
                    {g ? <span className="src">Nhóm {g.key}</span> : null}
                    <span className={`src ${statusTone === 'ok' ? 'ok' : statusTone === 'mkt' ? 'mkt' : ''}`}>
                      {statusText}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <AutoPostToggle jobId={j.id} isOn={false} />
                    {composeDisabled ? (
                      <span className="btn ghost" style={{ opacity: 0.45, cursor: 'default', fontSize: '0.85em' }}>
                        {composeLabel}
                      </span>
                    ) : (
                      <form action={openAndQueueFbPost}>
                        <input type="hidden" name="job_id" value={j.id} />
                        <SubmitButton label={composeLabel} pendingLabel="AI đang soạn, chờ 10-20 giây..." />
                      </form>
                    )}
                    <form action={openAndQueueLinkedInPost}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label="Soạn LinkedIn" pendingLabel="Đang soạn..." className="btn ghost" />
                    </form>
                    <ChannelComposeButtons jobId={j.id} channels={extraChannels} />
                  </div>
                  <div className="card-danger-row">
                    <RemoveJobButton jobId={j.id} jobTitle={j.title} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {/* === Bản nháp === */}
      {drafts.length > 0 ? (
        <>
          <h2 style={{ marginTop: 28 }}>Bản nháp ({drafts.length})</h2>
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
                    {j.headcount ? <span className="src">Tuyển {j.headcount} người</span> : null}
                    {j.location ? <span className="src">{j.location}</span> : null}
                    {g ? <span className="src">Kênh gợi ý: {g.kenh.join(', ')}</span> : null}
                    <span className="src" style={{ color: 'var(--ink-2)' }}>Bản nháp — chưa mở tuyển</span>
                  </div>

                  {JD_CHANNELS.map((c) => (
                    <details className="raw" key={c.key}>
                      <summary>{c.ten} ({wordCount(String(versions[c.key] || ''))} từ, mục tiêu {c.tu[0]}–{c.tu[1]})</summary>
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

                  <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    <form action={regenerateJd}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label="Viết lại bằng AI" pendingLabel="AI đang viết lại..." className="btn ghost" />
                    </form>
                    <form action={finalizeJd}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label="Mở tuyển (không soạn bài ngay)" pendingLabel="Đang cập nhật..." className="btn ghost" />
                    </form>
                    <form action={openAndQueueFbPost}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label="Soạn bài Facebook và đưa vào Duyệt" pendingLabel="AI đang soạn bài, chờ 10-20 giây..." />
                    </form>
                    <form action={openAndQueueLinkedInPost}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label="Soạn bài LinkedIn và đưa vào Duyệt" pendingLabel="AI đang soạn bài, chờ 10-20 giây..." className="btn ghost" />
                    </form>
                    <ChannelComposeButtons jobId={j.id} channels={extraChannels} />
                    <form action={deleteJd}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label="Xóa nháp" pendingLabel="Đang xoá..." className="btn no" />
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {autoQueue.length === 0 && openOther.length === 0 && drafts.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📋</div>
          <p>Chưa có vị trí nào. Bấm "+ Thêm vị trí" để bắt đầu.</p>
        </div>
      ) : null}

      <details className="raw" style={{ marginTop: 20 }}>
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
