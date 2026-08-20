'use client';

import { useRef } from 'react';
import { useFormState } from 'react-dom';
import { createJdDraftForPanel, openAndQueueFbPost, openAndQueueLinkedInPost, addToAutoQueue, finalizeJd } from '../actions';
import { SubmitButton } from '../submit-button';
import { JOB_GROUPS, JD_CHANNELS } from '../../lib/jd-groups';

const allPositions = JOB_GROUPS.flatMap((g) => g.vi_tri);
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// Panel slide-in để thêm vị trí tuyển dụng mới.
// Bước 1: nhập thông tin. Bước 2: xem 4 phiên bản JD ngay trong panel và soạn bài vào Duyệt.
export default function AddJobPanel() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, action] = useFormState(createJdDraftForPanel, null);

  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button type="button" className="btn-add-job" onClick={open}>
        + Thêm vị trí
      </button>

      <dialog
        ref={dialogRef}
        className="panel-drawer"
        onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      >
        <div className="panel-inner">
          <div className="panel-head">
            <h2 className="panel-title">
              {result ? `Xem nháp: ${result.title}` : 'Thêm vị trí tuyển dụng'}
            </h2>
            <button type="button" className="panel-close" onClick={close} aria-label="Đóng">✕</button>
          </div>

          <div className="panel-body">
            {!result ? (
              <>
                <p className="panel-step">Bước 1 · Nhập thông tin vị trí</p>
                <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className="note" name="title" placeholder="Tên vị trí" list="panel-positions" required />
                  <datalist id="panel-positions">
                    {allPositions.map((p) => <option key={p} value={p} />)}
                  </datalist>
                  <input className="note" name="location" placeholder="Nơi làm việc, ví dụ Vũng Tàu" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      className="note"
                      name="salary_display"
                      placeholder="Mức lương, ví dụ 10-15 triệu/tháng"
                      aria-label="Mức lương hiển thị"
                    />
                    <select
                      className="note"
                      name="employment_type"
                      defaultValue="full-time"
                      aria-label="Loại hợp đồng"
                    >
                      <option value="full-time">Toàn thời gian</option>
                      <option value="part-time">Bán thời gian</option>
                      <option value="contract">Hợp đồng thời vụ</option>
                      <option value="internship">Thực tập</option>
                      <option value="temporary">Ngắn hạn</option>
                    </select>
                  </div>
                  <textarea name="short_desc" rows={3} placeholder="Mô tả công việc"
                    style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Mô tả công việc" />
                  <textarea name="requirements" rows={3} placeholder="Yêu cầu ứng viên"
                    style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Yêu cầu ứng viên" />
                  <textarea name="benefits" rows={2} placeholder="Quyền lợi (để trống nếu chưa rõ)"
                    style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Quyền lợi" />
                  <SubmitButton label="AI viết bốn phiên bản JD" pendingLabel="AI đang viết, chờ vài giây..." />
                </form>
              </>
            ) : (
              <>
                <p className="panel-step">Bước 2 · Xem bản nháp và đưa vào Duyệt</p>
                <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>{result.title}</p>
                {JD_CHANNELS.map((c) => (
                  <details key={c.key} className="raw">
                    <summary>
                      {c.ten} ({wordCount(String(result.versions[c.key] || ''))} từ, mục tiêu {c.tu[0]}–{c.tu[1]})
                    </summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88em', marginTop: 6 }}>
                      {result.versions[c.key] || '(chưa có nội dung)'}
                    </pre>
                  </details>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                  <form action={finalizeJd}>
                    <input type="hidden" name="job_id" value={result.jobId} />
                    <SubmitButton
                      label="Thêm vào danh sách đang tuyển"
                      pendingLabel="Đang lưu..."
                    />
                  </form>
                  <p style={{ fontSize: '0.8em', color: 'var(--ink-2)', margin: 0 }}>
                    Vị trí xuất hiện trong danh sách. Bật toggle Tự động bất kỳ lúc nào để cron tự soạn bài.
                  </p>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '4px 0' }} />
                  <form action={addToAutoQueue}>
                    <input type="hidden" name="job_id" value={result.jobId} />
                    <SubmitButton
                      label="Thêm vào danh sách + bật tự động luôn"
                      pendingLabel="Đang lưu..."
                      className="btn ghost"
                    />
                  </form>
                  <form action={openAndQueueFbPost}>
                    <input type="hidden" name="job_id" value={result.jobId} />
                    <SubmitButton
                      label="Soạn bài Facebook ngay và đưa vào Duyệt"
                      pendingLabel="AI đang soạn bài, chờ 10-20 giây..."
                      className="btn ghost"
                    />
                  </form>
                  <form action={openAndQueueLinkedInPost}>
                    <input type="hidden" name="job_id" value={result.jobId} />
                    <SubmitButton
                      label="Soạn bài LinkedIn ngay và đưa vào Duyệt"
                      pendingLabel="AI đang soạn bài, chờ 10-20 giây..."
                      className="btn ghost"
                    />
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
