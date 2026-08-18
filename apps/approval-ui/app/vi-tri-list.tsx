'use client';

import { useState } from 'react';
import { queueFacebookPost, publishJobPost } from './actions';
import { SubmitButton } from './submit-button';
import { formatRelative } from './labels';

type Job = {
  id: string; title: string; department: string | null; location: string | null;
  short_desc: string | null; jd_versions: Record<string, string> | null;
  status: string; created_at: string;
};
type Post = {
  id: string; job_id: string | null; trang_thai: string; kenh: string | null;
  scheduled_at: string | null; url: string | null; fb_post_id: string | null;
};

type FilterKey = 'pending' | 'posted' | 'all';

const ACTIVE = new Set(['draft', 'scheduled', 'failed']);

const TT: Record<string, { label: string; tone: string }> = {
  draft:     { label: 'Nháp',      tone: 'default' },
  scheduled: { label: 'Đặt lịch', tone: 'mkt' },
  posted:    { label: 'Đã đăng',  tone: 'ok' },
  failed:    { label: 'Lỗi',      tone: 'no' },
  cancelled: { label: 'Đã huỷ',   tone: 'no' },
};

const KENH: Record<string, string> = {
  facebook: 'Facebook', zalo: 'Zalo',
  job_board: 'Job board', website: 'Website', other: 'Khác',
};

const JD_LABELS: Record<string, string> = {
  website: 'Website', job_board: 'Trang tuyển dụng', facebook: 'Facebook', zalo_sms: 'Zalo / SMS',
};
const JD_ORDER = ['website', 'job_board', 'facebook', 'zalo_sms'];

const JOB_ST: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'default' },
  open:  { label: 'Đang tuyển', tone: 'ok' },
  closed:{ label: 'Đã đóng', tone: 'no' },
};

const POST_ORDER = ['posted', 'scheduled', 'draft', 'failed', 'cancelled'];

export default function ViTriList({
  jobs, posts, approvedPostIds,
}: {
  jobs: Job[]; posts: Post[]; approvedPostIds: string[];
}) {
  const [filter, setFilter] = useState<FilterKey>('pending');
  const [query,  setQuery]  = useState('');
  const approved = new Set(approvedPostIds);

  // Gom bài đăng còn hoạt động theo job_id và kênh
  const byJob = new Map<string, Post[]>();
  for (const p of posts) {
    if (!p.job_id || p.trang_thai === 'cancelled') continue;
    if (!byJob.has(p.job_id)) byJob.set(p.job_id, []);
    byJob.get(p.job_id)!.push(p);
  }

  // Đếm cho filter chip
  const cnt = { pending: 0, posted: 0, all: jobs.length };
  for (const j of jobs) {
    const ps = byJob.get(j.id) || [];
    if (ps.length === 0 || ps.some(p => ACTIVE.has(p.trang_thai))) cnt.pending++;
    if (ps.some(p => p.trang_thai === 'posted')) cnt.posted++;
  }

  const q = query.trim().toLowerCase();
  const filtered = jobs.filter(j => {
    if (q && ![j.title, j.department || '', j.location || ''].some(s => s.toLowerCase().includes(q))) return false;
    const ps = byJob.get(j.id) || [];
    if (filter === 'all')    return true;
    if (filter === 'posted') return ps.some(p => p.trang_thai === 'posted');
    return ps.length === 0 || ps.some(p => ACTIVE.has(p.trang_thai));
  });

  const CHIPS: { key: FilterKey; label: string }[] = [
    { key: 'pending', label: `Cần xử lý · ${cnt.pending}` },
    { key: 'posted',  label: `Đã đăng · ${cnt.posted}` },
    { key: 'all',     label: `Tất cả · ${cnt.all}` },
  ];

  return (
    <>
      <div className="toolbar">
        <input
          className="search" type="search"
          placeholder="Tìm theo tên vị trí, phòng ban, địa điểm..."
          value={query} onChange={e => setQuery(e.target.value)}
          aria-label="Tìm kiếm vị trí"
        />
      </div>

      <div className="filters" style={{ margin: '10px 0 14px' }}>
        {CHIPS.map(c => (
          <button key={c.key} className={`chip${filter === c.key ? ' on' : ''}`} onClick={() => setFilter(c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="muted">
          {q ? 'Không tìm thấy vị trí phù hợp.' :
           filter === 'pending' ? 'Không có vị trí nào cần xử lý. Bấm "Tất cả" để xem toàn bộ.' :
           'Không có vị trí nào.'}
        </p>
      ) : (
        <ul className="list">
          {filtered.map(j => {
            const st = JOB_ST[j.status] || { label: j.status, tone: 'default' };
            const meta = [j.department, j.location].filter(Boolean).join(' · ');
            const jdVersions = j.jd_versions || {};
            const jdKeys = JD_ORDER.filter(k => jdVersions[k]).concat(
              Object.keys(jdVersions).filter(k => !JD_ORDER.includes(k)));
            const jobPosts = byJob.get(j.id) || [];

            // Tổng hợp trạng thái theo kênh (bài tốt nhất mỗi kênh)
            const kenhMap: Record<string, Post> = {};
            for (const p of jobPosts) {
              const k = p.kenh || 'other';
              const cur = kenhMap[k];
              if (!cur || POST_ORDER.indexOf(p.trang_thai) < POST_ORDER.indexOf(cur.trang_thai)) {
                kenhMap[k] = p;
              }
            }
            const kenhEntries = Object.entries(kenhMap);

            // Bài Facebook tốt nhất để hiện nút hành động
            const fbPost = kenhMap['facebook'];
            const canPost = fbPost &&
              (approved.has(fbPost.id) || fbPost.trang_thai === 'failed') &&
              fbPost.trang_thai !== 'posted';

            return (
              <li key={j.id} className="card tone-mkt">
                <div className="head">
                  <span className="cand-name">{j.title}</span>
                  <time className="time" dateTime={j.created_at} suppressHydrationWarning>{formatRelative(j.created_at)}</time>
                </div>
                <div className="stages">
                  <span className={`stage tone-${st.tone}`}>{st.label}</span>
                  {meta ? <span className="src">{meta}</span> : null}
                </div>

                {/* Hàng badge trạng thái theo kênh */}
                {kenhEntries.length > 0 ? (
                  <div className="vt-platforms">
                    {kenhEntries.map(([kenh, p]) => {
                      const tt = TT[p.trang_thai] || { label: p.trang_thai, tone: 'default' };
                      const cnt2 = jobPosts.filter(x => x.kenh === kenh).length;
                      return (
                        <span key={kenh} className={`vt-badge tone-${tt.tone}`}>
                          {KENH[kenh] || kenh}
                          {cnt2 > 1 ? ` ×${cnt2}` : ''}
                          <span className="vt-badge-sep">·</span>
                          {tt.label}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: '4px 0 8px', fontSize: '12px' }}>
                    Chưa có bài đăng nào.
                  </p>
                )}

                {j.short_desc ? <p className="job-desc" style={{ marginTop: 6 }}>{j.short_desc}</p> : null}

                {jdKeys.length > 0 ? (
                  <div className="jd-versions" style={{ marginTop: 6 }}>
                    {jdKeys.map(k => (
                      <details className="raw" key={k}>
                        <summary>
                          {JD_LABELS[k] || k} ({String(jdVersions[k]).trim().split(/\s+/).length} từ)
                        </summary>
                        <pre>{jdVersions[k]}</pre>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="muted" style={{ marginTop: 6, fontSize: '12px' }}>Chưa có phiên bản JD.</p>
                )}

                {/* Hành động chính */}
                <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {!fbPost ? (
                    <form action={queueFacebookPost}>
                      <input type="hidden" name="job_id" value={j.id} />
                      <SubmitButton label="Soạn bài Facebook" pendingLabel="Đang soạn..." />
                    </form>
                  ) : (
                    <>
                      {fbPost.url ? (
                        <a href={fbPost.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85em' }}>
                          Xem bài Facebook
                        </a>
                      ) : null}
                      {canPost ? (
                        <form action={publishJobPost}>
                          <input type="hidden" name="post_id" value={fbPost.id} />
                          <SubmitButton
                            label={fbPost.trang_thai === 'failed' ? 'Thử đăng lại' : 'Đăng ngay'}
                            pendingLabel="Đang đăng..."
                            className="btn ok"
                            style={{ fontSize: '0.85em', padding: '4px 12px' }}
                          />
                        </form>
                      ) : null}
                      {fbPost.trang_thai !== 'posted' ? (
                        <span className="muted" style={{ fontSize: '0.82em' }}>
                          {approved.has(fbPost.id) ? 'Đã duyệt · chờ đăng' : 'Vào trang Duyệt để duyệt'}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
