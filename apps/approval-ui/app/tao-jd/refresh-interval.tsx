'use client';

import { useState } from 'react';
import { setJobRefreshInterval } from '../actions';

const PRESETS = [
  { days: 7, label: '1 tuần' },
  { days: 14, label: '2 tuần' },
  { days: 30, label: '1 tháng' },
  { days: 60, label: '2 tháng' },
  { days: 90, label: '3 tháng' },
];

export default function RefreshInterval({ jobId, current }: { jobId: string; current: number }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(String(current));

  const currentLabel = PRESETS.find((p) => p.days === current)?.label || `${current} ngày`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn ghost"
        style={{ fontSize: '0.85em', padding: '2px 8px' }}
        title="Đổi chu kỳ tự soạn bài mới. Bấm để chọn."
      >
        Refresh mỗi <b>{currentLabel}</b> · Đổi
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel, transparent)' }}>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <form key={p.days} action={setJobRefreshInterval} onSubmit={() => setOpen(false)} style={{ display: 'inline' }}>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="days" value={p.days} />
            <button
              type="submit"
              className={`btn ${current === p.days ? 'ok' : 'ghost'}`}
              style={{ fontSize: '0.8em', padding: '3px 8px' }}
            >
              {p.label}
            </button>
          </form>
        ))}
      </div>
      <form action={setJobRefreshInterval} onSubmit={() => setOpen(false)} className="row" style={{ gap: 6, alignItems: 'center' }}>
        <input type="hidden" name="job_id" value={jobId} />
        <span className="muted" style={{ fontSize: '0.8em' }}>Tuỳ chỉnh:</span>
        <input
          type="number"
          name="days"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          min={1}
          max={365}
          style={{ width: 70, padding: '3px 6px', border: '1px solid var(--line)', borderRadius: 4, fontSize: '0.85em' }}
        />
        <span className="muted" style={{ fontSize: '0.8em' }}>ngày (1-365)</span>
        <button type="submit" className="btn ghost" style={{ fontSize: '0.8em', padding: '3px 8px' }}>Lưu</button>
        <button type="button" onClick={() => setOpen(false)} className="btn ghost" style={{ fontSize: '0.8em', padding: '3px 8px' }}>Hủy</button>
      </form>
    </div>
  );
}
