'use client';

import { Fragment, useEffect, useState } from 'react';
import { updateJobPost, editJobPostDraft, publishJobPost, recomposeDraft, markPostedManually } from './actions';
import { SubmitButton } from './submit-button';
import { formatDate, formatDateTime } from './labels';
import { Countdown } from './countdown';
import { channelLabel, isManual } from '../lib/channels';

function isPast(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

type Post = {
  id: string; tieu_de: string; trang_thai: string;
  scheduled_at: string | null; posted_at: string | null;
  noi_dung: string | null; job_id: string | null; kenh: string | null;
  url: string | null; image_url: string | null; ghi_chu: string | null;
  fb_post_id: string | null; proof_path: string | null; created_at: string;
  // Bài tương tác dùng chung bảng nhưng loai='tuong_tac' và có thể có video_url.
  // Các trường tùy chọn — nếu component nhận post cũ (không có 2 field này), vẫn chạy bình thường.
  loai?: string | null;
  video_url?: string | null;
  // Tên vị trí tuyển dụng của bài (từ hr_jobs.title). Dùng để gom bài theo vị trí.
  jobTitle?: string | null;
  // Số tương tác kéo về từ Facebook Graph (cron /api/cron/fb-metrics). Optional để các
  // trang chưa join bảng hr_fb_post_metrics vẫn render được. Undefined = chưa có snapshot.
  metrics?: PostMetrics | null;
};

export type PostMetrics = {
  reactions: number;
  comments: number;
  shares: number;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  insights_available: boolean;
  fetched_at: string;
};

const TT: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'default' },
  scheduled: { label: 'Đặt lịch', tone: 'mkt' },
  posted: { label: 'Đã đăng', tone: 'ok' },
  failed: { label: 'Lỗi', tone: 'no' },
  cancelled: { label: 'Đã huỷ', tone: 'no' },
};

type PostGroup = { key: string; title: string; posts: Post[] };

// Gom bài theo vị trí tuyển dụng (job_id). Bài không gắn vị trí gom vào nhóm cuối.
// Sắp xếp: vị trí theo tên (tiếng Việt), nhóm "chưa gắn" luôn xuống cuối.
function groupByJob(posts: Post[]): PostGroup[] {
  const map = new Map<string, PostGroup>();
  for (const p of posts) {
    const key = p.job_id || '__none__';
    const title = p.jobTitle || (p.job_id ? 'Vị trí đã xoá' : 'Chưa gắn vị trí');
    if (!map.has(key)) map.set(key, { key, title, posts: [] });
    map.get(key)!.posts.push(p);
  }
  const groups = [...map.values()];
  groups.sort((a, b) => {
    if (a.key === '__none__') return 1;
    if (b.key === '__none__') return -1;
    return a.title.localeCompare(b.title, 'vi');
  });
  return groups;
}

// Tóm tắt trạng thái các bài trong một vị trí: "2 Đã đăng · 1 Nháp".
function statusSummary(list: Post[]): React.ReactNode {
  const c: Record<string, number> = {};
  for (const p of list) c[p.trang_thai] = (c[p.trang_thai] || 0) + 1;
  const order = ['posted', 'scheduled', 'draft', 'failed'];
  const parts = order.filter((k) => c[k]).map((k) => `${c[k]} ${TT[k]?.label ?? k}`);
  return parts.length ? <span className="pos-num">{parts.join(' · ')}</span> : null;
}

// Định dạng số kiểu Việt Nam: 1.234, dấu chấm ngăn cách hàng nghìn (CLAUDE.md giọng văn).
function fmtNum(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

// Ô số tương tác trong bảng: like/bình luận/chia sẻ. Chỉ hiện cho bài đã đăng lên Facebook,
// và có snapshot metrics. Bài chưa đăng hoặc chưa kịp kéo về hiện gạch nối muted.
function MetricsCell({ metrics, isPosted, kenh }: {
  metrics: PostMetrics | null | undefined;
  isPosted: boolean;
  kenh: string | null;
}) {
  const isFb = !kenh || kenh === 'facebook';
  if (!isPosted || !isFb) {
    return <span className="muted" style={{ fontSize: '0.85em' }}>—</span>;
  }
  if (!metrics) {
    return <span className="muted" style={{ fontSize: '0.85em' }} title="Cron chưa kéo về, thử lại sau">Chưa có số</span>;
  }
  const title = metrics.insights_available && metrics.reach !== null
    ? `Cập nhật lúc ${new Date(metrics.fetched_at).toLocaleString('vi-VN')}\nTiếp cận: ${fmtNum(metrics.reach)} người\nLượt xem: ${metrics.impressions !== null ? fmtNum(metrics.impressions) : '—'}\nLượt click: ${metrics.clicks !== null ? fmtNum(metrics.clicks) : '—'}`
    : `Cập nhật lúc ${new Date(metrics.fetched_at).toLocaleString('vi-VN')}\n(Chưa có số tiếp cận/xem — token thiếu quyền Page Insights)`;
  return (
    <span title={title} style={{ fontSize: '13px', color: 'var(--ink)' }}>
      <b>{fmtNum(metrics.reactions)}</b> like · <b>{fmtNum(metrics.comments)}</b> bl · <b>{fmtNum(metrics.shares)}</b> chia sẻ
    </span>
  );
}

// Nút copy nội dung bài để dán tay vào Nhóm Facebook (FB đã chặn API đăng Nhóm).
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost"
      style={{ fontSize: '0.85em' }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // clipboard bị chặn thì im lặng, user bôi đen copy tay
        }
      }}
    >
      {done ? '✓ Đã copy' : 'Copy nội dung (dán vào Nhóm)'}
    </button>
  );
}

type Mode = 'view' | 'edit';
type DeleteTarget = { id: string; tieu_de: string; trang_thai: string; fbLinked: boolean };

type ChannelMeta = Record<string, { ten: string; post_url: string | null; field_hints: string[] }>;

export default function PostListClient({
  posts,
  approvedPostIds,
  channelMeta = {},
}: {
  posts: Post[];
  approvedPostIds: string[];
  channelMeta?: ChannelMeta;
}) {
  const chLabel = (k?: string | null) => (k && channelMeta[k]?.ten) || channelLabel(k);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const approved = new Set(approvedPostIds);

  const toggleRow = (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setMode('view');
  };

  if (posts.length === 0) {
    return (
      <p className="muted">
        Chưa có tin đăng nào. Sang <a href="/tao-jd">Vị trí tuyển dụng</a> rồi bấm &quot;Soạn bài Facebook&quot; ở vị trí muốn đăng.
      </p>
    );
  }

  // Mỗi vị trí một khối gập/mở. Thân khối là đúng bảng bài cũ, chỉ chứa bài của vị trí đó.
  const groups = groupByJob(posts);

  const renderRows = (list: Post[]) =>
    list.map((p) => {
              const tt = TT[p.trang_thai] || { label: p.trang_thai, tone: 'default' };
              const isApproved = approved.has(p.id);
              const canEdit = p.trang_thai !== 'posted' && p.trang_thai !== 'cancelled';
              const canPost = (isApproved || p.trang_thai === 'failed') && canEdit;
              const manual = isManual(p.kenh);
              const chMeta = channelMeta[p.kenh || ''];
              const canManualPost = manual && isApproved && canEdit;
              const isOpen = openId === p.id;
              const schedDate = p.scheduled_at ? new Date(p.scheduled_at) : null;
              const scheduledDefault = schedDate && !isNaN(schedDate.getTime())
                ? schedDate.toISOString().slice(0, 16) : '';

              // Cột Lịch / Đăng: chọn 1 hiển thị theo trạng thái.
              let timeCell: React.ReactNode = <span className="muted">Chưa đặt</span>;
              if (p.trang_thai === 'posted' && p.posted_at) {
                timeCell = <span>{formatDate(p.posted_at)}</span>;
              } else if (p.trang_thai === 'scheduled' && p.scheduled_at) {
                timeCell = mounted ? (
                  <span style={{ color: 'var(--ok)', fontWeight: 600 }}>
                    <Countdown target={p.scheduled_at} prefix="còn " pastLabel="Đến giờ" />
                  </span>
                ) : (
                  <span>{formatDateTime(p.scheduled_at)}</span>
                );
              } else if (p.trang_thai === 'failed') {
                timeCell = <span className="muted">Lỗi khi đăng</span>;
              }

              return (
                <Fragment key={p.id}>
                  <tr
                    className={`post-row${isOpen ? ' is-open' : ''}`}
                    onClick={() => toggleRow(p.id)}
                  >
                    <td className="post-td-title">
                      <div className="post-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {p.loai === 'tuong_tac' ? (
                          <span
                            className="stage tone-mkt"
                            style={{ fontSize: '0.7em', padding: '1px 6px', borderRadius: 4 }}
                            title="Bài tương tác hâm nóng trang, không gắn vị trí"
                          >
                            Tương tác
                          </span>
                        ) : null}
                        <span>{p.tieu_de}</span>
                      </div>
                    </td>
                    <td className="post-td-kenh">{chLabel(p.kenh)}</td>
                    <td className="post-td-status">
                      <span className={`stage tone-${tt.tone}`}>{tt.label}</span>
                    </td>
                    <td className="post-td-metrics">
                      <MetricsCell metrics={p.metrics} isPosted={p.trang_thai === 'posted'} kenh={p.kenh} />
                    </td>
                    <td className="post-td-time" suppressHydrationWarning>{timeCell}</td>
                    <td className="post-td-caret">
                      <span className={`caret${isOpen ? ' open' : ''}`} aria-hidden="true">›</span>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="post-expand-row">
                      <td colSpan={6}>
                        <div className="post-detail">
                          {/* Thanh chuyển view/edit */}
                          {canEdit ? (
                            <div className="cand-tabs" role="tablist" style={{ marginBottom: 12 }}>
                              <button
                                type="button"
                                className={`cand-tab${mode === 'view' ? ' on' : ''}`}
                                onClick={() => setMode('view')}
                              >Xem nội dung</button>
                              <button
                                type="button"
                                className={`cand-tab${mode === 'edit' ? ' on' : ''}`}
                                onClick={() => setMode('edit')}
                              >Sửa nội dung</button>
                            </div>
                          ) : null}

                          {mode === 'view' || !canEdit ? (
                            <>
                              {p.trang_thai === 'failed' && p.ghi_chu ? (
                                <div className="err" role="alert" style={{ marginBottom: 10, fontSize: '0.9em' }}>
                                  Lỗi khi đăng: {p.ghi_chu}
                                </div>
                              ) : null}

                              <dl className="fields" style={{ marginBottom: 10 }}>
                                <div className="field"><dt>Kênh</dt><dd>{chLabel(p.kenh)}</dd></div>
                                <div className="field">
                                  <dt>Giờ đặt đăng</dt>
                                  <dd>
                                    {p.scheduled_at
                                      ? (mounted
                                          ? <><Countdown target={p.scheduled_at} /> ({formatDateTime(p.scheduled_at)})</>
                                          : formatDateTime(p.scheduled_at))
                                      : 'Chưa đặt'}
                                  </dd>
                                </div>
                                {p.posted_at ? (
                                  <div className="field"><dt>Đã đăng lúc</dt><dd>{formatDateTime(p.posted_at)}</dd></div>
                                ) : null}
                                {p.trang_thai === 'posted' && (!p.kenh || p.kenh === 'facebook') ? (
                                  <div className="field">
                                    <dt>Tương tác</dt>
                                    <dd>
                                      {p.metrics ? (
                                        <>
                                          {fmtNum(p.metrics.reactions)} like · {fmtNum(p.metrics.comments)} bình luận · {fmtNum(p.metrics.shares)} chia sẻ
                                          {p.metrics.insights_available ? (
                                            <>
                                              {' · '}
                                              {p.metrics.reach !== null ? `${fmtNum(p.metrics.reach)} người tiếp cận` : ''}
                                              {p.metrics.impressions !== null ? ` · ${fmtNum(p.metrics.impressions)} lượt xem` : ''}
                                              {p.metrics.clicks !== null ? ` · ${fmtNum(p.metrics.clicks)} click` : ''}
                                            </>
                                          ) : null}
                                          <span className="muted" style={{ fontSize: '0.82em', marginLeft: 6 }}>
                                            (cập nhật {formatDateTime(p.metrics.fetched_at)})
                                          </span>
                                        </>
                                      ) : (
                                        <span className="muted">Chưa có số — cron sẽ kéo về trong lượt tới</span>
                                      )}
                                    </dd>
                                  </div>
                                ) : null}
                                {p.url ? (
                                  <div className="field">
                                    <dt>Đường dẫn</dt>
                                    <dd><a href={p.url} target="_blank" rel="noreferrer">{chLabel(p.kenh) || 'Xem bài đã đăng'}</a></dd>
                                  </div>
                                ) : null}
                                {p.proof_path ? (
                                  <div className="field">
                                    <dt>Ảnh bằng chứng</dt>
                                    <dd><a href={p.proof_path} target="_blank" rel="noreferrer">Xem ảnh đã đăng</a></dd>
                                  </div>
                                ) : null}
                              </dl>

                              {p.video_url ? (
                                <video
                                  src={p.video_url}
                                  controls
                                  preload="metadata"
                                  style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, marginBottom: 10, display: 'block', background: '#000' }}
                                />
                              ) : null}

                              {p.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.image_url}
                                  alt="Ảnh đính kèm"
                                  style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, marginBottom: 10, objectFit: 'cover', display: 'block' }}
                                />
                              ) : null}

                              {p.noi_dung ? (
                                <pre className="content-body" style={{ margin: '0 0 12px' }}>
                                  {p.noi_dung}
                                </pre>
                              ) : null}

                              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                                {canPost && !manual ? (
                                  <form action={publishJobPost}>
                                    <input type="hidden" name="post_id" value={p.id} />
                                    <SubmitButton
                                      label={p.trang_thai === 'failed' ? 'Thử đăng lại' : (mounted && isPast(p.scheduled_at) ? 'Đăng ngay (đã đến giờ)' : 'Đăng ngay')}
                                      pendingLabel="Đang đăng..."
                                    />
                                  </form>
                                ) : null}
                                {!isApproved && canEdit ? (
                                  <span className="muted" style={{ fontSize: '0.85em', alignSelf: 'center' }}>
                                    Duyệt trên trang Duyệt để mở khoá {manual ? 'Đăng thủ công' : 'Đăng'}
                                  </span>
                                ) : null}
                                {p.noi_dung ? <CopyButton text={p.noi_dung} /> : null}
                                {p.image_url ? (
                                  <a
                                    className="btn ghost"
                                    href={p.image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: '0.85em', textDecoration: 'none', alignSelf: 'center' }}
                                  >
                                    Mở ảnh để lưu
                                  </a>
                                ) : null}
                              </div>

                              {canManualPost ? (
                                <div style={{ marginTop: 12, padding: 12, border: '1px dashed var(--line)', borderRadius: 8, background: 'var(--surface)' }}>
                                  <b style={{ fontSize: '0.9em' }}>Đăng thủ công lên {chLabel(p.kenh)}</b>
                                  <ol style={{ margin: '6px 0 10px', paddingLeft: 18, fontSize: '0.85em', color: 'var(--ink-2)', lineHeight: 1.7 }}>
                                    <li>Bấm <b>Copy nội dung</b> ở trên (mở ảnh để lưu nếu cần đính kèm).</li>
                                    <li>
                                      {chMeta?.post_url
                                        ? <>Mở <a href={chMeta.post_url} target="_blank" rel="noreferrer">trang đăng {chLabel(p.kenh)} ↗</a>, dán nội dung và đăng.</>
                                        : <>Đăng trên {chLabel(p.kenh)}.</>}
                                    </li>
                                    <li>Dán link bài vừa đăng vào ô dưới rồi bấm <b>Đánh dấu đã đăng</b>.</li>
                                  </ol>
                                  {chMeta?.field_hints?.length ? (
                                    <p className="muted" style={{ fontSize: '0.82em', margin: '0 0 8px' }}>Gợi ý điền: {chMeta.field_hints.join(' · ')}</p>
                                  ) : null}
                                  <form action={markPostedManually} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <input type="hidden" name="post_id" value={p.id} />
                                    <input className="note" type="url" name="url" placeholder={`Link bài đã đăng trên ${chLabel(p.kenh)} (khuyến nghị)`} aria-label="Link bài đã đăng" />
                                    <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <span style={{ color: 'var(--ink-2)' }}>Ảnh bằng chứng (tùy chọn):</span>
                                      <input type="file" name="proof_file" accept="image/*" style={{ fontSize: '0.85em' }} />
                                    </label>
                                    <SubmitButton label="Đánh dấu đã đăng" pendingLabel="Đang lưu..." className="btn ok" />
                                  </form>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            /* Chế độ Sửa: form giữ nguyên logic gốc */
                            <form action={editJobPostDraft} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <input type="hidden" name="post_id" value={p.id} />
                              {p.trang_thai === 'posted' ? (
                                <p style={{ margin: 0, fontSize: '0.82em', padding: '6px 10px', background: 'var(--accent-bg)', borderRadius: 6, color: 'var(--accent)' }}>
                                  Bài đã đăng. Lưu sẽ cập nhật nội dung trực tiếp lên Facebook{p.fb_post_id ? ` (ID: ...${p.fb_post_id.slice(-8)})` : '. Paste link bài Facebook bên dưới để bật xoá và sửa tự động.'}.
                                </p>
                              ) : null}
                              <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>Nội dung bài đăng</label>
                              <textarea
                                name="noi_dung"
                                defaultValue={p.noi_dung || ''}
                                rows={12}
                                aria-label="Nội dung bài đăng"
                                style={{ width: '100%', boxSizing: 'border-box' }}
                              />
                              <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>Ảnh đính kèm</label>
                              <input
                                className="note"
                                type="url"
                                name="image_url"
                                defaultValue={p.image_url || ''}
                                placeholder="https://... (dán URL từ Thư viện media, hoặc để trống)"
                                aria-label="URL hình ảnh"
                              />
                              <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: 'var(--ink-2)', flexShrink: 0 }}>Hoặc chọn từ máy:</span>
                                <input type="file" name="image_file" accept="image/*" style={{ fontSize: '0.85em' }} />
                              </label>

                              <label style={{ fontSize: '0.82em', color: 'var(--ink-2)', marginTop: 4 }}>
                                Video đính kèm (ưu tiên hơn ảnh khi đăng)
                              </label>
                              <input
                                className="note"
                                type="url"
                                name="video_url"
                                defaultValue={p.video_url || ''}
                                placeholder="https://... (dán URL từ Thư viện media, hoặc để trống)"
                                aria-label="URL video"
                              />
                              <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: 'var(--ink-2)', flexShrink: 0 }}>Hoặc chọn từ máy:</span>
                                <input type="file" name="video_file" accept="video/*" style={{ fontSize: '0.85em' }} />
                              </label>
                              {p.trang_thai === 'posted' ? (
                                <>
                                  <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>
                                    Link bài Facebook{p.fb_post_id ? ' (để trống = giữ nguyên ID đã lưu)' : ' · paste để bật xoá/sửa tự động'}
                                  </label>
                                  <input
                                    className="note"
                                    type="text"
                                    name="fb_post_link"
                                    defaultValue=""
                                    placeholder="https://www.facebook.com/sdvico/posts/... hoặc ID dạng 123_456"
                                    aria-label="Link hoặc ID bài Facebook"
                                  />
                                </>
                              ) : (
                                <>
                                  <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>Giờ đặt đăng (bỏ trống = lưu nháp)</label>
                                  <input className="note" type="datetime-local" name="scheduled_at" defaultValue={scheduledDefault} aria-label="Giờ đặt đăng" />
                                </>
                              )}
                              <SubmitButton
                                label={p.trang_thai === 'posted' ? 'Lưu và cập nhật Facebook' : 'Lưu chỉnh sửa'}
                                pendingLabel={p.trang_thai === 'posted' ? 'Đang cập nhật...' : 'Đang lưu...'}
                              />

                              {p.trang_thai !== 'posted' ? (
                                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
                                  <p style={{ margin: '0 0 6px', fontSize: '0.82em', color: 'var(--ink-2)' }}>Viết lại bằng AI:</p>
                                  <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
                                    {[
                                      { style: 'professional', label: 'Chuyên nghiệp' },
                                      { style: 'friendly', label: 'Thân thiện' },
                                      { style: 'concise', label: 'Ngắn gọn' },
                                      { style: 'formal', label: 'Trang trọng' },
                                    ].map((s) => (
                                      <form key={s.style} action={recomposeDraft}>
                                        <input type="hidden" name="post_id" value={p.id} />
                                        <input type="hidden" name="style" value={s.style} />
                                        <SubmitButton label={s.label} pendingLabel="Đang viết..." className="btn ghost" style={{ fontSize: '0.82em', padding: '3px 10px' }} />
                                      </form>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </form>
                          )}

                          {/* Hàng phụ: nút Xoá tách khỏi hàng chính, canh phải, style mờ. */}
                          <div className="card-danger-row">
                            <button
                              type="button"
                              className="btn-danger-link"
                              onClick={() => setDeleteTarget({
                                id: p.id, tieu_de: p.tieu_de, trang_thai: p.trang_thai,
                                fbLinked: !!(p.fb_post_id && p.trang_thai === 'posted'),
                              })}
                            >
                              Xoá bài
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            });

  return (
    <>
      {groups.map((g) => (
        <details key={g.key} className="pos-group" open>
          <summary>
            <span className="pos-group-title">{g.title}</span>
            <span className="pos-group-meta">
              <span className="pos-num"><b>{g.posts.length}</b> bài</span>
              {statusSummary(g.posts)}
            </span>
          </summary>
          <div className="pos-group-body">
            <div className="table-scroll">
              <table className="post-table-v2">
                <thead>
                  <tr>
                    <th className="post-th-title">Tiêu đề</th>
                    <th className="post-th-kenh">Kênh</th>
                    <th className="post-th-status">Trạng thái</th>
                    <th className="post-th-metrics" title="Số tương tác cập nhật mỗi giờ từ Facebook">Tương tác</th>
                    <th className="post-th-time">Lịch / Đăng</th>
                    <th className="post-th-caret" aria-hidden="true"></th>
                  </tr>
                </thead>
                <tbody>{renderRows(g.posts)}</tbody>
              </table>
            </div>
          </div>
        </details>
      ))}

      {deleteTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Xoá bài đăng?</p>
            <div className="modal-body">
              <strong style={{ display: 'block', marginBottom: 8 }}>{deleteTarget.tieu_de}</strong>
              {deleteTarget.fbLinked ? (
                <span className="modal-warn">Bài đang trên Facebook. Xoá ở đây sẽ gỡ bài khỏi Facebook và xoá vĩnh viễn khỏi hệ thống.</span>
              ) : deleteTarget.trang_thai === 'posted' ? (
                <span className="modal-info">Bài đã đăng trên Facebook nhưng chưa lưu link. Hệ thống không thể tự gỡ khỏi Facebook, bạn cần vào Facebook xoá thủ công. Bài sẽ xoá vĩnh viễn khỏi hệ thống quản lý.</span>
              ) : (
                <span className="modal-info">Xoá vĩnh viễn. Không thể khôi phục.</span>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={() => setDeleteTarget(null)}>Giữ lại</button>
              <form action={updateJobPost} onSubmit={() => setDeleteTarget(null)}>
                <input type="hidden" name="id" value={deleteTarget.id} />
                <input type="hidden" name="action" value="delete" />
                <SubmitButton
                  label={deleteTarget.fbLinked ? 'Xoá và gỡ Facebook' : 'Xoá vĩnh viễn'}
                  pendingLabel="Đang xoá..."
                  className="btn del"
                />
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
