'use client';

import { useMemo, useState } from 'react';
import { formatRelative, stageMeta, sourceLabel } from './labels';
import { advanceToInterview } from './actions';

export type CandView = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string | null;
  dedupKey: string;
  subject: string;
  attachments: string;
  consent: string;
  createdAt: string;
  stages: string[];
  appId: string | null;
  appStage: string | null;
  score: number | null;
  rawLen: number;
  raw: string;
  cvUrl: string | null;
};

// Danh sách hồ sơ có ô tìm kiếm và lọc theo trạng thái, lọc ngay trên trình duyệt.
export default function CandidateList({ candidates }: { candidates: CandView[] }) {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string | null>(null);

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) for (const s of c.stages) m.set(s, (m.get(s) || 0) + 1);
    return [...m.entries()];
  }, [candidates]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return candidates.filter((c) => {
      const okStage = !stage || c.stages.includes(stage);
      const okText = !t || [c.name, c.email, c.phone, c.dedupKey, c.subject].some((v) => (v || '').toLowerCase().includes(t));
      return okStage && okText;
    });
  }, [candidates, q, stage]);

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Tìm theo tên, email, số điện thoại..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm hồ sơ"
        />
      </div>

      <nav className="filters" aria-label="Lọc theo trạng thái">
        <button className={`chip ${!stage ? 'on' : ''}`} onClick={() => setStage(null)}>
          Tất cả <span className="n">{candidates.length}</span>
        </button>
        {stageCounts.map(([s, n]) => {
          const m = stageMeta(s);
          return (
            <button key={s} className={`chip ${stage === s ? 'on' : ''}`} onClick={() => setStage(s)}>
              {m.label} <span className="n">{n}</span>
            </button>
          );
        })}
      </nav>

      <p className="sub">Hiện {filtered.length} trên {candidates.length} hồ sơ.</p>

      <ul className="list">
        {filtered.map((c) => (
          <li key={c.id} className="card tone-hr">
            <div className="head">
              <span className="cand-name">{c.name}</span>
              <span className="row-right">
                {c.score !== null ? <span className="score" title="Điểm chấm tự động">{c.score}/100</span> : null}
                <time className="time" dateTime={c.createdAt}>{formatRelative(c.createdAt)}</time>
              </span>
            </div>

            <div className="stages">
              {c.stages.length === 0 ? (
                <span className="stage tone-default">Chưa có hồ sơ ứng tuyển</span>
              ) : (
                c.stages.map((s, i) => {
                  const m = stageMeta(s);
                  return <span key={i} className={`stage tone-${m.tone}`}>{m.label}</span>;
                })
              )}
              <span className="src">Nguồn: {sourceLabel(c.source)}</span>
            </div>

            <dl className="fields">
              <div className="field"><dt>Email</dt><dd>{c.email || '—'}</dd></div>
              <div className="field"><dt>Điện thoại</dt><dd>{c.phone || '—'}</dd></div>
              <div className="field"><dt>Khóa khử trùng</dt><dd>{c.dedupKey || '—'}</dd></div>
              {c.subject ? <div className="field"><dt>Thư nguồn</dt><dd>{c.subject}</dd></div> : null}
              <div className="field"><dt>Đính kèm</dt><dd>{c.attachments || '—'}</dd></div>
              <div className="field"><dt>Đồng ý / lưu tới</dt><dd>{c.consent}</dd></div>
            </dl>

            {c.raw ? (
              <details className="raw">
                <summary>Xem nội dung CV đã trích ({c.rawLen} ký tự)</summary>
                <pre>{c.raw}</pre>
              </details>
            ) : null}

            <div className="row">
              {c.cvUrl ? (
                <a className="btn ghost" href={c.cvUrl} target="_blank" rel="noopener noreferrer">Tải CV gốc</a>
              ) : (
                <span className="muted">Không có tệp CV</span>
              )}
              {c.appStage === 'review' && c.appId ? (
                <form
                  action={advanceToInterview}
                  onSubmit={(e) => {
                    const ok = window.confirm(`Đưa hồ sơ này vào phỏng vấn?\n\n${c.name}\n\nMáy sẽ soạn câu hỏi và thư mời chờ bạn duyệt.`);
                    if (!ok) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="appId" value={c.appId} />
                  <button className="btn ok" type="submit">Đưa vào phỏng vấn</button>
                </form>
              ) : null}
              {c.appStage === 'interview' ? <span className="muted">Đã vào phỏng vấn</span> : null}
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 ? <p className="muted">Không có hồ sơ khớp bộ lọc.</p> : null}
    </>
  );
}
