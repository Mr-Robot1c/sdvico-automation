import Link from 'next/link';
import { getServerClient } from '../lib/supabase-server';
import AutoRefresh from './auto-refresh';
import DecideActions from './decide-actions';
import { SubmitButton } from './submit-button';
import { editJobPostDraft } from './actions';
import { kindMeta, formatRelative, splitPayload } from './labels';
import { linkedinConfigured } from '../lib/linkedin';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
export const dynamic = 'force-dynamic';

type Item = {
  id: string;
  kind: string;
  title: string;
  payload: unknown;
  created_at: string;
  ref_id: string | null;
  note: string | null;
};

type HrPost = {
  id: string;
  tieu_de: string;
  noi_dung: string | null;
  image_url: string | null;
  scheduled_at: string | null;
  needs_gov_review?: boolean | null;
  gov_reviewed_by?: string | null;
  gov_reviewed_at?: string | null;
};

// Lấy đoạn hook (đoạn đầu) từ nội dung để xem trước mà không cuộn.
function hookPreview(text: string): { hook: string; hasMore: boolean } {
  const para = text.trim().split(/\n{2,}/)[0] || '';
  const rest = text.trim().slice(para.length).trim();
  return { hook: para, hasMore: rest.length > 0 };
}

const platformLabel = (k: string) => (k === 'linkedin' ? 'LinkedIn' : k === 'facebook' ? 'Facebook' : k);

// Build URL của trang duyệt, giữ filter, đặt/xoá id được chọn.
function buildUrl(base: { kind?: string | null; platform?: string | null; id?: string | null }): string {
  const qs = new URLSearchParams();
  if (base.kind) qs.set('kind', base.kind);
  if (base.platform) qs.set('platform', base.platform);
  if (base.id) qs.set('id', base.id);
  const s = qs.toString();
  return s ? `/?${s}` : '/';
}

export default async function Page({ searchParams }: { searchParams: { kind?: string; platform?: string; id?: string } }) {
  const client = getServerClient();
  // Ẩn kind='alert' (dead-letter từ cron heartbeat/publish) khỏi trang duyệt.
  // Chúng có trang giám sát riêng /giam-sat, đưa vào đây chỉ tạo nhiễu.
  const { data, error } = await client
    .from('approval_queue')
    .select('id, kind, title, payload, created_at, ref_id, note')
    .eq('status', 'pending')
    .neq('kind', 'alert')
    .order('created_at', { ascending: true });

  const raw = (data || []) as Item[];

  // Lưới chắn: giấu thư mời phỏng vấn của hồ sơ đã rời bước phỏng vấn (đã nhận, đã từ
  // chối, hoặc hồ sơ đã bị xóa) — decideCandidate đã tự dọn, đây là lớp phòng dữ liệu cũ.
  const inviteRefs = raw
    .filter((it) => it.kind === 'hr_interview' && it.ref_id)
    .map((it) => it.ref_id as string);
  let staleInvites = new Set<string>();
  if (inviteRefs.length) {
    const { data: apps } = await client
      .from('hr_applications')
      .select('id, stage')
      .in('id', inviteRefs);
    const stageById = new Map(
      ((apps || []) as Array<{ id: string; stage: string }>).map((a) => [a.id, a.stage])
    );
    staleInvites = new Set(inviteRefs.filter((id) => stageById.get(id) !== 'interview'));
  }
  const all = raw.filter(
    (it) => !(it.kind === 'hr_interview' && it.ref_id && staleInvites.has(it.ref_id))
  );

  // Đếm theo loại và theo nền tảng để dựng thanh lọc.
  const counts = new Map<string, number>();
  for (const it of all) counts.set(it.kind, (counts.get(it.kind) || 0) + 1);
  const platformCounts = new Map<string, number>();
  for (const it of all) {
    if (it.kind !== 'hr_job_post') continue;
    const k = ((it.payload as Record<string, unknown>)?.kenh as string) || 'facebook';
    platformCounts.set(k, (platformCounts.get(k) || 0) + 1);
  }

  const linkedinReady = linkedinConfigured();
  const selectedKind = searchParams?.kind || null;
  const selectedPlatform = searchParams?.platform || null;
  let items = selectedKind ? all.filter((it) => it.kind === selectedKind) : all;
  if (selectedPlatform) {
    items = items.filter(
      (it) => it.kind === 'hr_job_post' && (((it.payload as Record<string, unknown>)?.kenh as string) || 'facebook') === selectedPlatform
    );
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
      .select('id, tieu_de, noi_dung, image_url, scheduled_at, needs_gov_review, gov_reviewed_by, gov_reviewed_at')
      .in('id', jobPostIds);
    for (const p of hrPosts || []) hrPostMap[p.id] = p as HrPost;
  }

  // Item đang chọn để mở ở cột phải. Nếu id trong URL không khớp mục nào còn hiển thị
  // (bị filter, hoặc vừa duyệt xong), lùi về mục đầu tiên. Cờ explicit dành cho CSS
  // mobile — khi bấm một item cụ thể mới ẩn danh sách và full-screen preview.
  const requestedId = searchParams?.id || null;
  const explicitSelection = !!requestedId && items.some((it) => it.id === requestedId);
  const selected = items.find((it) => it.id === requestedId) || items[0] || null;

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
          <Link className={`chip ${selectedKind ? '' : 'on'}`} href={buildUrl({ platform: selectedPlatform })}>
            Tất cả <span className="n">{all.length}</span>
          </Link>
          {[...counts.entries()].map(([kind, n]) => {
            const meta = kindMeta(kind);
            return (
              <Link
                key={kind}
                className={`chip ${selectedKind === kind ? 'on' : ''}`}
                href={buildUrl({ kind, platform: selectedPlatform })}
              >
                <span aria-hidden="true">{meta.icon}</span> {meta.label} <span className="n">{n}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!error && platformCounts.size > 0 ? (
        <nav className="filters" aria-label="Lọc theo nền tảng">
          <Link className={`chip ${selectedPlatform ? '' : 'on'}`} href={buildUrl({ kind: selectedKind })}>
            Mọi nền tảng
          </Link>
          {[...platformCounts.entries()].map(([plat, n]) => (
            <Link
              key={plat}
              className={`chip ${selectedPlatform === plat ? 'on' : ''}`}
              href={buildUrl({ kind: selectedKind, platform: plat })}
            >
              {platformLabel(plat)} <span className="n">{n}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!error && all.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">✓</div>
          <p>Không có mục nào chờ duyệt.</p>
          <p className="sub">Khi máy soạn nội dung mới, mục sẽ hiện ở đây.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className={`inbox-layout${explicitSelection ? ' has-selection' : ''}`}>
          <aside className="inbox-list" aria-label="Danh sách chờ duyệt">
            {items.map((it) => {
              const meta = kindMeta(it.kind);
              const active = selected?.id === it.id;
              return (
                <Link
                  key={it.id}
                  href={buildUrl({ kind: selectedKind, platform: selectedPlatform, id: it.id })}
                  className={`inbox-item${active ? ' on' : ''}`}
                  scroll={false}
                >
                  <span className={`inbox-item-tone tone-${meta.tone}`} aria-hidden="true" />
                  <div className="inbox-item-body">
                    <div className="inbox-item-head">
                      <span className="inbox-item-kind">
                        <span aria-hidden="true">{meta.icon}</span> {meta.label}
                      </span>
                      <time className="inbox-item-time" dateTime={it.created_at}>{formatRelative(it.created_at)}</time>
                    </div>
                    <div className="inbox-item-title" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {((it.payload as Record<string, unknown>)?.loai as string) === 'tuong_tac' ? (
                        <span
                          className="stage tone-mkt"
                          style={{ fontSize: '0.7em', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}
                          title="Bài tương tác hâm nóng trang"
                        >
                          Tương tác
                        </span>
                      ) : null}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </aside>

          <section className="inbox-preview" aria-label="Chi tiết mục đang chọn">
            {selected ? (
              <ItemPreview
                item={selected}
                hrPostMap={hrPostMap}
                linkedinReady={linkedinReady}
                backHref={buildUrl({ kind: selectedKind, platform: selectedPlatform })}
              />
            ) : (
              <div className="inbox-preview-empty">
                <p className="muted">Chọn một mục ở danh sách để xem chi tiết.</p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

// Chi tiết mục chờ duyệt: giữ 2 nhánh render như cũ (hr_job_post có nội dung + form sửa
// nội dung; các loại khác dùng splitPayload). Tách ra file này để layout 2 cột sạch hơn.
function ItemPreview({
  item, hrPostMap, linkedinReady, backHref,
}: {
  item: Item;
  hrPostMap: Record<string, HrPost>;
  linkedinReady: boolean;
  backHref: string;
}) {
  const meta = kindMeta(item.kind);
  const { primary, secondary } = splitPayload(item.payload);
  const payload = item.payload as Record<string, unknown>;
  const postId = item.kind === 'hr_job_post' ? (payload?.post_id as string) : null;
  const hrPost = postId ? hrPostMap[postId] : null;

  return (
    <article className={`inbox-detail tone-${meta.tone}`}>
      {/* Header preview: về danh sách (mobile) + kind badge + time */}
      <div className="inbox-detail-head">
        <Link href={backHref} className="inbox-back" aria-label="Về danh sách">
          <span aria-hidden="true">‹</span> Danh sách
        </Link>
        <span className="kind">
          <span aria-hidden="true">{meta.icon}</span> {meta.label}
          {item.kind === 'hr_job_post' ? (
            <span className="src" style={{ marginLeft: 8, fontSize: '0.78em' }}>
              {platformLabel((payload?.kenh as string) || 'facebook')}
            </span>
          ) : null}
        </span>
        <time className="time" dateTime={item.created_at}>{formatRelative(item.created_at)}</time>
      </div>

      <h2 className="inbox-detail-title">{item.title}</h2>

      {/* Cảnh báo gửi mail lỗi cần đập vào mắt */}
      {item.note && item.note.startsWith('GỬI MAIL LỖI') ? (
        <p className="send-failed" role="alert">
          Chưa gửi được thư. {item.note.replace(/^GỬI MAIL LỖI:\s*/, '')}
          <span> Sửa lại rồi bấm Duyệt lần nữa.</span>
        </p>
      ) : null}

      {/* Bài Facebook: preview nội dung + panel sửa */}
      {hrPost ? (
        <>
          {hrPost.noi_dung ? (() => {
            const { hook, hasMore } = hookPreview(hrPost.noi_dung);
            return (
              <div className="fields" style={{ margin: '8px 0 4px' }}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.95em' }}>{hook}</p>
                {hasMore ? (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.85em', color: 'var(--ink-2)' }}>
                      Xem toàn bộ nội dung...
                    </summary>
                    <pre style={{ marginTop: 6, fontSize: '0.9em' }}>{hrPost.noi_dung}</pre>
                  </details>
                ) : null}
              </div>
            );
          })() : <p className="muted" style={{ margin: '6px 0' }}>Chưa có nội dung.</p>}

          {hrPost.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hrPost.image_url}
              alt="Ảnh đính kèm"
              style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, margin: '6px 0 8px', objectFit: 'cover' }}
            />
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
                <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>
                  Ảnh đính kèm: dán URL hoặc chọn file từ máy (file ưu tiên hơn URL)
                </label>
                <input
                  className="note"
                  type="url"
                  name="image_url"
                  defaultValue={hrPost.image_url || ''}
                  placeholder="https://... (để trống nếu không cần)"
                  aria-label="URL hình ảnh"
                />
                <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <span style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>Hoặc chọn từ máy:</span>
                  <input type="file" name="image_file" accept="image/*" style={{ fontSize: '0.85em' }} />
                </label>
              </div>
              <SubmitButton label="Lưu chỉnh sửa" pendingLabel="Đang lưu..." />
            </form>
          </details>
        </>
      ) : (
        // Các loại khác: nội dung chính lên đầu, metadata gập
        <>
          {primary.length > 0 ? (
            <div className="content-preview">
              {primary.map((r) => (
                <div className="content-block" key={r.key}>
                  {primary.length > 1 ? <div className="content-label">{r.label}</div> : null}
                  <pre className="content-body">{r.value}</pre>
                </div>
              ))}
            </div>
          ) : null}
          {secondary.length > 0 ? (
            <details className="raw meta-details">
              <summary>Chi tiết kỹ thuật ({secondary.length} trường)</summary>
              <dl className="fields" style={{ marginTop: 8 }}>
                {secondary.map((r) => (
                  <div className={`field ${r.long ? 'field-long' : ''}`} key={r.key}>
                    <dt>{r.label}</dt>
                    <dd>{r.long ? <pre>{r.value}</pre> : r.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
        </>
      )}

      <DecideActions
        id={item.id}
        title={item.title}
        kind={item.kind}
        postId={postId}
        platform={item.kind === 'hr_job_post' ? ((payload?.kenh as string) || 'facebook') : null}
        linkedinReady={linkedinReady}
        oldPostId={(payload?.old_post_id as string) || null}
        oldFbPostId={(payload?.old_fb_post_id as string) || null}
        oldPostTitle={(payload?.old_post_title as string) || null}
        oldPostedAt={(payload?.old_posted_at as string) || null}
        needsGovReview={postId ? Boolean(hrPostMap[postId]?.needs_gov_review) : false}
        govReviewedBy={postId ? (hrPostMap[postId]?.gov_reviewed_by ?? null) : null}
        govKeywords={(payload?.gov_keywords as string[]) || null}
      />
    </article>
  );
}
