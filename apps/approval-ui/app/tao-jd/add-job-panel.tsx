'use client';

import { useRef } from 'react';
import { useFormState } from 'react-dom';
import { createJdDraftForPanel, openAndQueueFbPost } from '../actions';
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
                <p className="panel-step">Bước 1 — Nhập thông tin vị trí</p>
                <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="row">
                    <select className="note" name="nhom" defaultValue="">
                      <option value="">Chọn nhóm ngành</option>
                      {JOB_GROUPS.map((g) => (
                        <option key={g.key} value={g.key}>{g.key}. {g.ten}</option>
                      ))}
                    </select>
                    <input className="note" name="title" placeholder="Tên vị trí" list="panel-positions" required />
                  </div>
                  <datalist id="panel-positions">
                    {allPositions.map((p) => <option key={p} value={p} />)}
                  </datalist>
                  <div className="row">
                    <input className="note" name="department" placeholder="Phòng ban" />
                    <input className="note" name="location" placeholder="Nơi làm việc, ví dụ Vũng Tàu" />
                    <input
                      className="note" name="headcount" type="number" min="1" max="99"
                      defaultValue="1" placeholder="Số lượng" style={{ width: 80 }}
                      aria-label="Số lượng cần tuyển"
                    />
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
                <p className="panel-step">Bước 2 — Xem bản nháp và đưa vào Duyệt</p>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                  <form action={openAndQueueFbPost}>
                    <input type="hidden" name="job_id" value={result.jobId} />
                    <SubmitButton
                      label="Soạn bài Facebook và đưa vào Duyệt"
                      pendingLabel="AI đang soạn bài, chờ 10-20 giây..."
                    />
                  </form>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn ghost" style={{ fontSize: '0.85em' }}
                    onClick={() => { window.location.href = '/tao-jd'; }}>
                    Tạo vị trí khác
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 6, fontSize: '0.85em' }}>
                  Vị trí đã được lưu. Bạn có thể đóng panel và soạn bài sau từ danh sách.
                </p>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
