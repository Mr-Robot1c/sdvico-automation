'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { formatRelative } from '../labels';
import { JD_CHANNELS, GROUP_BY_KEY } from '../../lib/jd-groups';
import {
  editJdVersion, regenerateJd, deleteJd,
  openAndQueueFbPost, openAndQueueLinkedInPost, openAndQueueChannelPost, finalizeJd,
} from '../actions';
import { SubmitButton } from '../submit-button';
import AutoPostToggle from './auto-post-toggle';
import RefreshInterval from './refresh-interval';
import RemoveJobButton from './remove-job-button';

export type JobRow = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  headcount: number | null;
  status: string;
  autoPost: boolean;
  refreshAfterDays: number;
  nhom: string | null;
  jdVersions: Record<string, string>;
  createdAt: string;
  candCount: number;
  reviewCount: number;
  postStatusText: string;
  postStatusTone: string;
  composeLabel: string;
  composeDisabled: boolean;
  needsRefresh: boolean;
};

type Props = {
  jobs: JobRow[];
  extraChannels: { kenh: string; ten: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bản nháp', open: 'Đang tuyển', closed: 'Đã đóng',
};

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// Nút "Soạn [Kênh]" cho các sàn thủ công ngoài Facebook/LinkedIn.
function ChannelComposeButtons({ jobId, channels }: { jobId: string; channels: { kenh: string; ten: string }[] }) {
  if (channels.length === 0) return null;
  return (
    <>
      {channels.map((c) => (
        <form key={c.kenh} action={openAndQueueChannelPost}>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="kenh" value={c.kenh} />
          <SubmitButton
            label={`Soạn ${c.ten}`}
            pendingLabel="Đang soạn..."
            className="btn ghost"
            style={{ fontSize: '0.85em' }}
          />
        </form>
      ))}
    </>
  );
}

function JobDetail({ j, extraChannels }: { j: JobRow; extraChannels: { kenh: string; ten: string }[] }) {
  const g = j.nhom ? GROUP_BY_KEY[j.nhom] : null;
  const isDraft = j.status === 'draft';

  return (
    <div className="job-detail">
      <dl className="fields" style={{ marginBottom: 12 }}>
        {j.headcount ? (
          <div className="field"><dt>Cần tuyển</dt><dd>{j.headcount} người</dd></div>
        ) : null}
        {j.department ? (
          <div className="field"><dt>Phòng ban</dt><dd>{j.department}</dd></div>
        ) : null}
        {j.location ? (
          <div className="field"><dt>Địa điểm</dt><dd>{j.location}</dd></div>
        ) : null}
        {g ? (
          <div className="field"><dt>Nhóm ngành</dt><dd>{g.key} · {g.ten}</dd></div>
        ) : null}
        <div className="field">
          <dt>Trạng thái bài</dt>
          <dd>
            <span className={`stage tone-${j.postStatusTone === 'ok' ? 'ok' : j.postStatusTone === 'mkt' ? 'mkt' : 'default'}`}>
              {j.postStatusText}
            </span>
            {j.needsRefresh ? <span className="muted" style={{ marginLeft: 8, fontSize: '0.85em' }}>Cron sẽ soạn bài mới</span> : null}
          </dd>
        </div>
        {j.status === 'open' ? (
          <div className="field">
            <dt>Tự động đăng</dt>
            <dd style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <AutoPostToggle jobId={j.id} isOn={j.autoPost} />
              <RefreshInterval jobId={j.id} current={j.refreshAfterDays} />
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Bản nháp: JD editor 4 kênh */}
      {isDraft ? (
        <div style={{ marginBottom: 12 }}>
          <p className="muted" style={{ fontSize: '0.85em', margin: '0 0 6px' }}>
            Nội dung JD theo từng kênh (bấm để sửa):
          </p>
          {JD_CHANNELS.map((c) => (
            <details className="raw" key={c.key}>
              <summary>
                {c.ten} ({wordCount(String(j.jdVersions[c.key] || ''))} từ, mục tiêu {c.tu[0]}–{c.tu[1]})
              </summary>
              <form action={editJdVersion} style={{ marginTop: 6 }}>
                <input type="hidden" name="job_id" value={j.id} />
                <input type="hidden" name="key" value={c.key} />
                <textarea
                  name="value"
                  defaultValue={j.jdVersions[c.key] || ''}
                  rows={c.key === 'website' ? 12 : c.key === 'job_board' ? 8 : 4}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  aria-label={`Bản ${c.ten}`}
                />
                <SubmitButton label={`Lưu bản ${c.ten}`} pendingLabel="Đang lưu..." className="btn ok" style={{ marginTop: 6 }} />
              </form>
            </details>
          ))}
        </div>
      ) : null}

      {/* Hàng hành động chính */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {isDraft ? (
          <>
            <form action={regenerateJd}>
              <input type="hidden" name="job_id" value={j.id} />
              <SubmitButton label="Viết lại bằng AI" pendingLabel="AI đang viết lại..." className="btn ghost" />
            </form>
            <form action={finalizeJd}>
              <input type="hidden" name="job_id" value={j.id} />
              <SubmitButton label="Mở tuyển (chưa soạn bài)" pendingLabel="Đang cập nhật..." className="btn ghost" />
            </form>
          </>
        ) : null}
        {j.composeDisabled ? (
          <span className="btn ghost" style={{ opacity: 0.45, cursor: 'default', fontSize: '0.85em' }}>
            {j.composeLabel}
          </span>
        ) : (
          <form action={openAndQueueFbPost}>
            <input type="hidden" name="job_id" value={j.id} />
            <SubmitButton label={j.composeLabel} pendingLabel="AI đang soạn..." className="btn ok" />
          </form>
        )}
        <form action={openAndQueueLinkedInPost}>
          <input type="hidden" name="job_id" value={j.id} />
          <SubmitButton label="Soạn LinkedIn" pendingLabel="Đang soạn..." className="btn ghost" />
        </form>
        <ChannelComposeButtons jobId={j.id} channels={extraChannels} />
      </div>

      {/* Xoá vị trí / xoá nháp ở hàng phụ */}
      <div className="card-danger-row">
        {isDraft ? (
          <form action={deleteJd} style={{ display: 'inline' }}>
            <input type="hidden" name="job_id" value={j.id} />
            <SubmitButton label="Xoá nháp" pendingLabel="Đang xoá..." className="btn-danger-link" />
          </form>
        ) : (
          <RemoveJobButton jobId={j.id} jobTitle={j.title} />
        )}
      </div>
    </div>
  );
}

export default function JobTable({ jobs, extraChannels }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="table-scroll">
      <table className="job-table">
        <thead>
          <tr>
            <th className="job-th-title">Vị trí</th>
            <th className="job-th-cand">Ứng viên</th>
            <th className="job-th-loc">Địa điểm</th>
            <th className="job-th-status">Trạng thái</th>
            <th className="job-th-post">Bài đăng</th>
            <th className="job-th-auto">Tự động</th>
            <th className="job-th-caret" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const isOpen = openId === j.id;
            return (
              <Fragment key={j.id}>
                <tr
                  className={`job-row${isOpen ? ' is-open' : ''}`}
                  onClick={() => setOpenId((cur) => (cur === j.id ? null : j.id))}
                >
                  <td className="job-td-title">
                    <div className="job-row-title">{j.title}</div>
                    <div className="muted job-row-sub">
                      {j.headcount ? `${j.headcount} người` : ''}
                      {j.headcount && j.nhom ? ' · ' : ''}
                      {j.nhom ? `Nhóm ${j.nhom}` : ''}
                    </div>
                  </td>
                  <td className="job-td-cand" onClick={(e) => e.stopPropagation()}>
                    {j.candCount > 0 ? (
                      <Link href="/ho-so" className="job-cand-link">
                        <b>{j.candCount}</b> hồ sơ
                        {j.reviewCount > 0 ? <span className="muted"> · {j.reviewCount} chờ xem</span> : null}
                      </Link>
                    ) : (
                      <span className="muted">Chưa có</span>
                    )}
                  </td>
                  <td className="job-td-loc">{j.location || <span className="muted">Chưa gắn</span>}</td>
                  <td className="job-td-status">
                    <span className={`stage tone-${j.status === 'draft' ? 'default' : j.status === 'open' ? 'ok' : 'default'}`}>
                      {STATUS_LABEL[j.status] || j.status}
                    </span>
                  </td>
                  <td className="job-td-post">
                    <span className={`stage tone-${j.postStatusTone === 'ok' ? 'ok' : j.postStatusTone === 'mkt' ? 'mkt' : 'default'}`}>
                      {j.postStatusText}
                    </span>
                  </td>
                  <td className="job-td-auto">
                    {j.status === 'open' ? (
                      j.autoPost ? <span className="stage tone-ok">Bật</span> : <span className="muted">Tắt</span>
                    ) : (
                      <span className="muted">Chưa áp dụng</span>
                    )}
                  </td>
                  <td className="job-td-caret">
                    <span className={`caret${isOpen ? ' open' : ''}`} aria-hidden="true">›</span>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="job-expand-row">
                    <td colSpan={7}>
                      <JobDetail j={j} extraChannels={extraChannels} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Filter chip đơn giản, dùng URL param ?filter=all|auto|open|draft.
export function JobFilters({
  counts, current,
}: {
  counts: { all: number; auto: number; open: number; draft: number };
  current: string;
}) {
  const chips = [
    { key: 'all', label: 'Tất cả', n: counts.all },
    { key: 'auto', label: 'Tự động đăng', n: counts.auto },
    { key: 'open', label: 'Đang tuyển', n: counts.open },
    { key: 'draft', label: 'Bản nháp', n: counts.draft },
  ];
  return (
    <nav className="filters" aria-label="Lọc vị trí">
      {chips.map((c) => (
        <Link
          key={c.key}
          className={`chip ${current === c.key ? 'on' : ''}`}
          href={c.key === 'all' ? '/tao-jd' : `/tao-jd?filter=${c.key}`}
        >
          {c.label} <span className="n">{c.n}</span>
        </Link>
      ))}
    </nav>
  );
}
