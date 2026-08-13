'use client';

import { useState } from 'react';
import { updateJobPost, editJobPostDraft, publishJobPost } from './actions';
import { SubmitButton } from './submit-button';
import { formatRelative } from './labels';

type Post = {
  id: string; tieu_de: string; trang_thai: string;
  scheduled_at: string | null; posted_at: string | null;
  noi_dung: string | null; job_id: string | null; kenh: string | null;
  url: string | null; image_url: string | null; ghi_chu: string | null;
  fb_post_id: string | null; created_at: string;
};

const TT: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'default' },
  scheduled: { label: 'Đặt lịch', tone: 'mkt' },
  posted: { label: 'Đã đăng', tone: 'ok' },
  failed: { label: 'Lỗi', tone: 'no' },
  cancelled: { label: 'Đã huỷ', tone: 'no' },
};

const KENH: Record<string, string> = {
  facebook: 'Facebook', zalo: 'Zalo',
  job_board: 'Trang tuyển dụng', website: 'Website', other: 'Khác',
};

type Mode = 'view' | 'edit';
type DeleteTarget = { id: string; tieu_de: string; trang_thai: string; fbLinked: boolean };

export default function PostListClient({
  posts,
  approvedPostIds,
}: {
  posts: Post[];
  approvedPostIds: string[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<Mode>('view');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const approved = new Set(approvedPostIds);

  const toggle = (id: string, m: Mode) => {
    if (openId === id && openMode === m) { setOpenId(null); } else { setOpenId(id); setOpenMode(m); }
  };

  if (posts.length === 0 && trash.length === 0) {
    return <p className="muted">Chưa có tin đăng nào. Vào tab Vị trí, bấm &quot;Soạn bài Facebook&quot; để tạo bài.</p>;
  }

  return (
    <>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: '13px' }}>
        Máy soạn bài, đẩy vào hàng đợi. Xem và sửa ở đây, bấm Duyệt ở trang Duyệt, rồi worker mới đăng lên. Máy soạn, người bấm (điều cấm 1).
      </p>

      <ul className="post-table">
        {posts.map((p) => {
          const tt = TT[p.trang_thai] || { label: p.trang_thai, tone: 'default' };
          const isApproved = approved.has(p.id);
          const canEdit = p.trang_thai !== 'posted' && p.trang_thai !== 'cancelled';
          const canPost = (isApproved || p.trang_thai === 'failed') && canEdit;
          const isView = openId === p.id && openMode === 'view';
          const isEdit = openId === p.id && openMode === 'edit';
          const scheduledDefault = p.scheduled_at ? new Date(p.scheduled_at).toISOString().slice(0, 16) : '';

          return (
            <li key={p.id} className={`pt-row${isView || isEdit ? ' is-open' : ''}`}>
              <div className="pt-head" onClick={() => toggle(p.id, 'view')}>
                <span className={`stage tone-${tt.tone}`} style={{ fontSize: '11px', flexShrink: 0 }}>{tt.label}</span>
                <span className="pt-title">{p.tieu_de}</span>
                <span className="pt-kenh">{KENH[p.kenh || ''] || p.kenh || '—'}</span>
                <time className="pt-time">{formatRelative(p.created_at)}</time>
                <div className="pt-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="pt-btn" onClick={() => toggle(p.id, 'view')}>
                    {isView ? 'Đóng' : 'Xem'}
                  </button>
                  {p.trang_thai !== 'cancelled' ? (
                    <button className="pt-btn" onClick={() => toggle(p.id, 'edit')}>
                      {isEdit ? 'Đóng' : 'Sửa'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="pt-btn del"
                    onClick={() => setDeleteTarget({ id: p.id, tieu_de: p.tieu_de, trang_thai: p.trang_thai, fbLinked: !!(p.fb_post_id && p.trang_thai === 'posted') })}
                  >
                    Xoá
                  </button>
                </div>
              </div>

              {isView && (
                <div className="pt-detail">
                  {p.trang_thai === 'failed' && p.ghi_chu ? (
                    <div className="err" role="alert" style={{ marginBottom: 10, fontSize: '0.9em' }}>
                      Lỗi khi đăng: {p.ghi_chu}
                    </div>
                  ) : null}
                  <div className="fields" style={{ marginBottom: 10 }}>
                    <div className="field">
                      <dt>Kênh</dt>
                      <dd>{KENH[p.kenh || ''] || p.kenh || '—'}</dd>
                    </div>
                    <div className="field">
                      <dt>Giờ đặt đăng</dt>
                      <dd>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('vi-VN') : '—'}</dd>
                    </div>
                    {p.posted_at ? (
                      <div className="field">
                        <dt>Đã đăng lúc</dt>
                        <dd>{new Date(p.posted_at).toLocaleString('vi-VN')}</dd>
                      </div>
                    ) : null}
                    {p.url ? (
                      <div className="field">
                        <dt>Đường dẫn</dt>
                        <dd><a href={p.url} target="_blank" rel="noreferrer">{KENH[p.kenh || ''] || 'Xem bài đã đăng'}</a></dd>
                      </div>
                    ) : null}
                  </div>
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="Ảnh đính kèm" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: 10, objectFit: 'cover', display: 'block' }} />
                  ) : null}
                  {p.noi_dung ? (
                    <pre style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontSize: '13px', whiteSpace: 'pre-wrap', margin: '0 0 10px', overflowX: 'auto', lineHeight: 1.6 }}>
                      {p.noi_dung}
                    </pre>
                  ) : null}
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {canPost ? (
                      <form action={publishJobPost}>
                        <input type="hidden" name="post_id" value={p.id} />
                        <SubmitButton label={p.trang_thai === 'failed' ? 'Thử đăng lại' : 'Đăng ngay'} pendingLabel="Đang đăng..." />
                      </form>
                    ) : null}
                    {!isApproved && canEdit ? (
                      <span className="muted" style={{ fontSize: '0.85em', alignSelf: 'center' }}>Duyệt trên trang Duyệt để mở khoá Đăng</span>
                    ) : null}
                    {p.trang_thai !== 'posted' && p.trang_thai !== 'cancelled' ? (
                      <form action={updateJobPost}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="action" value="posted" />
                        <SubmitButton label="Đánh dấu đã đăng" className="btn ghost" />
                      </form>
                    ) : null}
                  </div>
                </div>
              )}

              {isEdit && p.trang_thai !== 'cancelled' ? (
                <div className="pt-edit">
                  <form action={editJobPostDraft} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="hidden" name="post_id" value={p.id} />
                    {p.trang_thai === 'posted' ? (
                      <p style={{ margin: 0, fontSize: '0.82em', padding: '6px 10px', background: 'rgba(25,118,210,0.08)', borderRadius: 6, color: 'var(--ink-1, #333)' }}>
                        Bài đã đăng — Lưu sẽ cập nhật nội dung trực tiếp lên Facebook{p.fb_post_id ? ` (ID: ...${p.fb_post_id.slice(-8)})` : '. Paste link bài Facebook bên dưới để bật xoá và sửa tự động.'}.
                      </p>
                    ) : null}
                    <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>Nội dung bài đăng</label>
                    <textarea name="noi_dung" defaultValue={p.noi_dung || ''} rows={12} aria-label="Nội dung bài đăng" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '13.5px', lineHeight: 1.6 }} />
                    <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>Ảnh đính kèm</label>
                    <input className="note" type="url" name="image_url" defaultValue={p.image_url || ''} placeholder="https://... (để trống nếu không cần)" aria-label="URL hình ảnh" />
                    <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--ink-2)', flexShrink: 0 }}>Hoặc chọn từ máy:</span>
                      <input type="file" name="image_file" accept="image/*" style={{ fontSize: '0.85em' }} />
                    </label>
                    {p.trang_thai === 'posted' ? (
                      <>
                        <label style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>
                          Link bài Facebook{p.fb_post_id ? ' (để trống = giữ nguyên ID đã lưu)' : ' — paste để bật xoá/sửa tự động'}
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
                  </form>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {deleteTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Xoá bài đăng?</p>
            <div className="modal-body">
              <strong style={{ display: 'block', marginBottom: 8 }}>{deleteTarget.tieu_de}</strong>
              {deleteTarget.fbLinked ? (
                <span className="modal-warn">Bài đang trên Facebook. Xoá ở đây sẽ gỡ bài khỏi Facebook và xoá vĩnh viễn khỏi hệ thống.</span>
              ) : deleteTarget.trang_thai === 'posted' ? (
                <span className="modal-info">Bài đã đăng trên Facebook nhưng chưa lưu link. Hệ thống không thể tự gỡ khỏi Facebook — bạn cần vào Facebook xoá thủ công. Bài sẽ xoá vĩnh viễn khỏi hệ thống quản lý.</span>
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
