import { getServerClient } from '../lib/supabase-server';
import AutoRefresh from './auto-refresh';
import DecideActions from './decide-actions';
import { SubmitButton } from './submit-button';
import { editJobPostDraft } from './actions';
import { kindMeta, formatRelative, payloadRows } from './labels';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

type Item = {
  id: string;
  kind: string;
  title: string;
  payload: unknown;
  created_at: string;
};

type HrPost = {
  id: string;
  tieu_de: string;
  noi_dung: string | null;
  image_url: string | null;
  scheduled_at: string | null;
};

// Lấy đoạn hook (đoạn đầu) từ nội dung để xem trước mà không cuộn.
function hookPreview(text: string): { hook: string; hasMore: boolean } {
  const para = text.trim().split(/\n{2,}/)[0] || '';
  const rest = text.trim().slice(para.length).trim();
  return { hook: para, hasMore: rest.length > 0 };
}

const platformLabel = (k: string) => (k === 'linkedin' ? 'LinkedIn' : k === 'facebook' ? 'Facebook' : k);

export default async function Page({ searchParams }: { searchParams: { kind?: string; platform?: string } }) {
  const client = getServerClient();
  const { data, error } = await client
    .from('approval_queue')
    .select('id, kind, title, payload, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const all = (data || []) as Item[];

  // Đếm theo loại để dựng thanh lọc.
  const counts = new Map<string, number>();
  for (const it of all) counts.set(it.kind, (counts.get(it.kind) || 0) + 1);

  // Đếm theo nền tảng (chỉ tin tuyển dụng) để lọc Facebook/LinkedIn.
  const platformCounts = new Map<string, number>();
  for (const it of all) {
    if (it.kind !== 'hr_job_post') continue;
    const k = ((it.payload as Record<string, unknown>)?.kenh as string) || 'facebook';
    platformCounts.set(k, (platformCounts.get(k) || 0) + 1);
  }

  const selected = searchParams?.kind || null;
  const selectedPlatform = searchParams?.platform || null;
  let items = selected ? all.filter((it) => it.kind === selected) : all;
  if (selectedPlatform) {
    items = items.filter((it) => it.kind === 'hr_job_post' && (((it.payload as Record<string, unknown>)?.kenh as string) || 'facebook') === selectedPlatform);
  }

  // Lấy nội dung thực tế của các bài đăng Facebook để hiển thị và sửa ngay tại đây.
  const jobPostIds = all
    .filter((it) => it.kind === 'hr_job_post')
    .map((it) => ((it.payload as Record<string, unknown>)?.post_id as string) || '')
    .filter(Boolean);

  const hrPostMap: Record<string, HrPost> = {};
  if (jobPostIds.length > 0) {
    const { data: hrPosts } = await client
      .from('hr_job_posts')
      .select('id, tieu_de, noi_dung, image_url, scheduled_at')
      .in('id', jobPostIds);
    for (const p of hrPosts || []) hrPostMap[p.id] = p as HrPost;
  }

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Duyệt &amp; gửi</h1>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? (
        <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p>
      ) : null}

      {!error && all.length > 0 ? (
        <nav className="filters" aria-label="Lọc theo loại">
          <a className={`chip ${selected ? '' : 'on'}`} href="/">
            Tất cả <span className="n">{all.length}</span>
          </a>
          {[...counts.entries()].map(([kind, n]) => {
            const meta = kindMeta(kind);
            return (
              <a
                key={kind}
                className={`chip ${selected === kind ? 'on' : ''}`}
                href={`/?kind=${encodeURIComponent(kind)}`}
              >
                <span aria-hidden="true">{meta.icon}</span> {meta.label} <span className="n">{n}</span>
              </a>
            );
          })}
        </nav>
      ) : null}

      {!error && platformCounts.size > 0 ? (
        <nav className="filters" aria-label="Lọc theo nền tảng">
          <a className={`chip ${selectedPlatform ? '' : 'on'}`} href={selected ? `/?kind=${encodeURIComponent(selected)}` : '/'}>
            Mọi nền tảng
          </a>
          {[...platformCounts.entries()].map(([plat, n]) => {
            const href = `/?platform=${encodeURIComponent(plat)}` + (selected ? `&kind=${encodeURIComponent(selected)}` : '');
            return (
              <a key={plat} className={`chip ${selectedPlatform === plat ? 'on' : ''}`} href={href}>
                {platformLabel(plat)} <span className="n">{n}</span>
              </a>
            );
          })}
        </nav>
      ) : null}

      {!error && all.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">✓</div>
          <p>Không có mục nào chờ duyệt.</p>
          <p className="sub">Khi máy soạn nội dung mới, mục sẽ hiện ở đây.</p>
        </div>
      ) : null}

      <ul className="list">
        {items.map((item) => {
          const meta = kindMeta(item.kind);
          const rows = payloadRows(item.payload);
          const payload = item.payload as Record<string, unknown>;
          const postId = item.kind === 'hr_job_post' ? (payload?.post_id as string) : null;
          const hrPost = postId ? hrPostMap[postId] : null;

          return (
            <li key={item.id} className={`card tone-${meta.tone}`}>
              <div className="head">
                <span className="kind">
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                  {item.kind === 'hr_job_post' ? (
                    <span className="src" style={{ marginLeft: 8, fontSize: '0.78em' }}>{platformLabel((payload?.kenh as string) || 'facebook')}</span>
                  ) : null}
                </span>
                <time className="time" dateTime={item.created_at}>{formatRelative(item.created_at)}</time>
              </div>

              <div className="title">{item.title}</div>

              {/* Bài đăng Facebook: hiển thị nội dung có thể sửa ngay tại đây */}
              {hrPost ? (
                <>
                  {hrPost.noi_dung ? (() => {
                    const { hook, hasMore } = hookPreview(hrPost.noi_dung);
                    return (
                      <div className="fields" style={{ margin: '8px 0 4px' }}>
                        <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.9em' }}>{hook}</p>
                        {hasMore ? (
                          <details style={{ marginTop: 4 }}>
                            <summary style={{ cursor: 'pointer', fontSize: '0.85em', color: 'var(--muted)' }}>Xem toàn bộ nội dung...</summary>
                            <pre style={{ marginTop: 6, fontSize: '0.85em' }}>{hrPost.noi_dung}</pre>
                          </details>
                        ) : null}
                      </div>
                    );
                  })() : <p className="muted" style={{ margin: '6px 0' }}>Chưa có nội dung.</p>}

                  {hrPost.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hrPost.image_url} alt="Ảnh đính kèm" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 6, margin: '4px 0 6px', objectFit: 'cover' }} />
                  ) : null}

                  <details className="raw" style={{ marginTop: 6 }}>
                    <summary>Sửa nội dung trước khi duyệt</summary>
                    <form action={editJobPostDraft} style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input type="hidden" name="post_id" value={hrPost.id} />
                      <textarea
                        name="noi_dung"
                        defaultValue={hrPost.noi_dung || ''}
                        rows={7}
                        aria-label="Nội dung bài đăng"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <label style={{ fontSize: '0.82em', color: 'var(--muted)' }}>Ảnh đính kèm — dán URL hoặc chọn file từ máy (file ưu tiên hơn URL)</label>
                        <input className="note" type="url" name="image_url" defaultValue={hrPost.image_url || ''} placeholder="https://... (để trống nếu không cần)" aria-label="URL hình ảnh" />
                        <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>Hoặc chọn từ máy:</span>
                          <input type="file" name="image_file" accept="image/*" style={{ fontSize: '0.85em' }} />
                        </label>
                      </div>
                      <SubmitButton label="Lưu chỉnh sửa" pendingLabel="Đang lưu..." />
                    </form>
                  </details>
                </>
              ) : (
                /* Các loại khác: hiển thị trường payload dạng danh sách */
                rows.length > 0 ? (
                  <dl className="fields">
                    {rows.map((r) => (
                      <div className={`field ${r.long ? 'field-long' : ''}`} key={r.key}>
                        <dt>{r.label}</dt>
                        <dd>{r.long ? <pre>{r.value}</pre> : r.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null
              )}

              <DecideActions
                id={item.id}
                title={item.title}
                kind={item.kind}
                postId={postId}
                oldPostId={(payload?.old_post_id as string) || null}
                oldFbPostId={(payload?.old_fb_post_id as string) || null}
                oldPostTitle={(payload?.old_post_title as string) || null}
                oldPostedAt={(payload?.old_posted_at as string) || null}
              />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
