'use client';

import { useMemo, useState } from 'react';
import { formatRelative, stageMeta, sourceLabel } from './labels';
import { advanceToInterview, saveNote, rejectSourced, decideCandidate, markInterviewed, deleteCandidate } from './actions';

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
  interviewedAt: string | null;
  sourced: boolean;
  note: string;
  score: number | null;
  scoreAxes: { label: string; diem: number }[];
  summary: string;
  strengths: string[];
  clarifications: string[];
  interview: { kyThuat: string; hanhVi: string; baiVeNha: string; khungGio: string[] } | null;
  rawLen: number;
  raw: string;
  cvUrl: string | null;
};

// Bộ chọn khung giờ phỏng vấn: người duyệt chọn ngày + giờ (gợi ý theo khung đã lưu),
// hoặc để trống cho hệ thống tự chọn. Bấm xác nhận là soạn thư mời ngay.
function InterviewApprove({ appId, name, windows }: { appId: string; name: string; windows: string[] }) {
  const times = windows.length ? windows : ['09:00', '10:30', '14:00', '15:30'];
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ date: string; time: string }[]>([
    { date: '', time: times[0] },
    { date: '', time: times[0] },
    { date: '', time: times[0] },
  ]);

  if (!open) {
    return <button className="btn ok" type="button" onClick={() => setOpen(true)}>Xét duyệt vào phỏng vấn</button>;
  }

  const setRow = (i: number, patch: Partial<{ date: string; time: string }>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.date);

  return (
    <div className="settings-box" style={{ margin: 0, padding: 12, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: '0.9em', fontWeight: 600 }}>Chọn khung giờ đề xuất cho {name}</span>
      <span className="muted" style={{ fontSize: '0.82em' }}>Chọn ngày + giờ cho từng khung. Để trống hết thì hệ thống tự chọn.</span>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: 6, alignItems: 'center' }}>
          <input className="note" type="date" value={r.date} onChange={(e) => setRow(i, { date: e.target.value })} style={{ flex: 1 }} />
          <select className="note" value={r.time} onChange={(e) => setRow(i, { time: e.target.value })}>
            {times.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      ))}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost" style={{ fontSize: '0.85em' }} onClick={() => setRows((rs) => [...rs, { date: '', time: times[0] }])}>+ Thêm khung</button>
        <form action={advanceToInterview} style={{ display: 'inline' }}>
          <input type="hidden" name="appId" value={appId} />
          {chosen.map((r, i) => <input key={i} type="hidden" name="slot" value={`${r.date}|${r.time}`} />)}
          <button className="btn ok" type="submit">{chosen.length ? `Soạn thư mời (${chosen.length} khung)` : 'Soạn thư mời (tự chọn giờ)'}</button>
        </form>
        <button type="button" className="btn ghost" style={{ fontSize: '0.85em' }} onClick={() => setOpen(false)}>Đóng</button>
      </div>
    </div>
  );
}

// Một thẻ hồ sơ, có tab chi tiết mở khi bấm để giao diện gọn gàng.
function CandidateCard({ c, windows }: { c: CandView; windows: string[] }) {
  const [tab, setTab] = useState<string | null>(null);
  const toggle = (t: string) => setTab((cur) => (cur === t ? null : t));

  const hasScore = c.score !== null;
  const hasCv = c.raw.length > 0;
  const hasInterview = c.interview !== null;

  return (
    <li className="card tone-hr">
      <div className="head">
        <span className="cand-name">{c.name}</span>
        <span className="row-right">
          {hasScore ? <span className="score" title="Điểm chấm tự động">{c.score}/100</span> : null}
          <time className="time" dateTime={c.createdAt} suppressHydrationWarning>{formatRelative(c.createdAt)}</time>
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
        <div className="field"><dt>Đồng ý / lưu tới</dt><dd>{c.consent}</dd></div>
      </dl>

      {/* Tab chi tiết. Bấm mở, bấm lại đóng. Chỉ hiện tab có nội dung. */}
      <div className="cand-tabs" role="tablist">
        {hasCv ? (
          <button className={`cand-tab ${tab === 'cv' ? 'on' : ''}`} onClick={() => toggle('cv')}>Xem CV</button>
        ) : null}
        {hasScore ? (
          <button className={`cand-tab ${tab === 'diem' ? 'on' : ''}`} onClick={() => toggle('diem')}>Điểm từng phần</button>
        ) : null}
        {hasInterview ? (
          <button className={`cand-tab ${tab === 'pv' ? 'on' : ''}`} onClick={() => toggle('pv')}>Câu hỏi phỏng vấn</button>
        ) : null}
        {c.appId ? (
          <button className={`cand-tab ${tab === 'ghichu' ? 'on' : ''}`} onClick={() => toggle('ghichu')}>Ghi chú{c.note ? ' •' : ''}</button>
        ) : null}
      </div>

      {tab === 'cv' ? (
        <div className="cand-panel">
          <div className="muted" style={{ marginBottom: 6 }}>Nội dung CV đã trích ({c.rawLen} ký tự)</div>
          <pre>{c.raw}</pre>
        </div>
      ) : null}

      {tab === 'diem' ? (
        <div className="cand-panel">
          {c.scoreAxes.map((a, i) => (
            <div className="axis-row" key={i}>
              <span className="muted">{a.label}</span>
              <span className="axis-bar"><i style={{ width: `${a.diem * 10}%` }} /></span>
              <span className="axis-n">{a.diem}/10</span>
            </div>
          ))}
          {c.summary ? <p className="cand-sum"><b>Tóm tắt:</b> {c.summary}</p> : null}
          {c.strengths.length ? (
            <div className="cand-sub"><b>Điểm mạnh</b><ul>{c.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          ) : null}
          {c.clarifications.length ? (
            <div className="cand-sub"><b>Cần làm rõ khi phỏng vấn</b><ul>{c.clarifications.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          ) : null}
        </div>
      ) : null}

      {tab === 'pv' && c.interview ? (
        <div className="cand-panel">
          {c.interview.khungGio.length ? (
            <div className="cand-sub"><b>Khung giờ đã sắp</b><ol className="slots">{c.interview.khungGio.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
          ) : null}
          {c.interview.kyThuat ? <div className="cand-sub"><b>Câu hỏi kỹ thuật</b><pre>{c.interview.kyThuat}</pre></div> : null}
          {c.interview.hanhVi ? <div className="cand-sub"><b>Câu hỏi hành vi</b><pre>{c.interview.hanhVi}</pre></div> : null}
          {c.interview.baiVeNha ? <div className="cand-sub"><b>Bài về nhà</b><pre>{c.interview.baiVeNha}</pre></div> : null}
        </div>
      ) : null}

      {tab === 'ghichu' && c.appId ? (
        <div className="cand-panel">
          <form action={saveNote}>
            <input type="hidden" name="appId" value={c.appId} />
            <textarea className="note-area" name="note" defaultValue={c.note} placeholder="Ghi chú về ứng viên này..." />
            <div style={{ marginTop: 8 }}><button className="btn ok" type="submit">Lưu ghi chú</button></div>
          </form>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        {c.cvUrl ? (
          <a className="btn ghost" href={c.cvUrl} target="_blank" rel="noopener noreferrer">Tải CV gốc</a>
        ) : null}
        {c.appStage === 'review' && c.appId ? (
          <InterviewApprove appId={c.appId} name={c.name} windows={windows} />
        ) : null}
        {c.appStage === 'interview' && c.appId && !c.interviewedAt ? (
          <>
            <span className="muted" style={{ alignSelf: 'center' }}>Đã đưa vào phỏng vấn — thư mời ở tab Duyệt</span>
            <form
              action={markInterviewed}
              onSubmit={(e) => { if (!window.confirm(`Đánh dấu ĐÃ PHỎNG VẤN XONG cho:\n\n${c.name}\n\nSau bước này mới hiện nút Nhận / Không nhận.`)) e.preventDefault(); }}
            >
              <input type="hidden" name="appId" value={c.appId} />
              <button className="btn ghost" type="submit">Đánh dấu đã phỏng vấn xong</button>
            </form>
          </>
        ) : null}
        {c.appStage === 'interview' && c.appId && c.interviewedAt ? (
          <>
            <span className="muted" style={{ alignSelf: 'center', marginRight: 2 }}>Đã phỏng vấn — quyết định:</span>
            <form
              action={decideCandidate}
              onSubmit={(e) => { if (!window.confirm(`Nhận ứng viên này?\n\n${c.name}\n\nMáy soạn thư mời nhận việc, bạn duyệt trên trang Duyệt rồi mới gửi.`)) e.preventDefault(); }}
            >
              <input type="hidden" name="appId" value={c.appId} />
              <input type="hidden" name="decision" value="offer" />
              <button className="btn ok" type="submit">Nhận</button>
            </form>
            <form
              action={decideCandidate}
              onSubmit={(e) => { if (!window.confirm(`Không nhận ứng viên này?\n\n${c.name}\n\nMáy soạn thư từ chối, bạn duyệt trên trang Duyệt rồi mới gửi.`)) e.preventDefault(); }}
            >
              <input type="hidden" name="appId" value={c.appId} />
              <input type="hidden" name="decision" value="reject" />
              <button className="btn no" type="submit">Không nhận</button>
            </form>
          </>
        ) : null}
        {c.appStage === 'offer' ? <span className="stage tone-ok">Đã nhận</span> : null}
        {c.appStage === 'rejected' ? <span className="muted">Đã từ chối</span> : null}
        {c.sourced ? (
          <form
            action={rejectSourced}
            onSubmit={(e) => {
              const ok = window.confirm(`Từ chối và XOÁ khỏi cơ sở dữ liệu?\n\n${c.name}\n\nỨng viên nguồn ngoài chưa có consent, từ chối sẽ xoá hẳn thông tin (Nghị định 13).`);
              if (!ok) e.preventDefault();
            }}
          >
            <input type="hidden" name="candidateId" value={c.id} />
            <button className="btn no" type="submit">Từ chối &amp; xoá</button>
          </form>
        ) : null}
        {!c.sourced && c.id ? (
          <form
            action={deleteCandidate}
            onSubmit={(e) => { if (!window.confirm(`XÓA VĨNH VIỄN hồ sơ này?\n\n${c.name}\n\nXóa cả điểm, thư mời và dữ liệu liên quan. Không khôi phục được.`)) e.preventDefault(); }}
          >
            <input type="hidden" name="candidateId" value={c.id} />
            <button className="btn del" type="submit" style={{ fontSize: '0.85em' }}>Xóa hồ sơ</button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

// Danh sách hồ sơ: tìm kiếm, lọc theo trạng thái, sắp xếp theo mới nhất hoặc điểm.
export default function CandidateList({ candidates, windows }: { candidates: CandView[]; windows: string[] }) {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  const [sort, setSort] = useState<'moi' | 'diem'>('moi');

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) for (const s of c.stages) m.set(s, (m.get(s) || 0) + 1);
    return [...m.entries()];
  }, [candidates]);

  const FINISHED = ['offer', 'rejected', 'pool'];
  const activeCount = useMemo(() => candidates.filter((c) => !(c.appStage && FINISHED.includes(c.appStage))).length, [candidates]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = candidates.filter((c) => {
      // Mặc định (chưa chọn trạng thái): chỉ hồ sơ đang xử lý, ẩn "đã nhận/từ chối/lưu nguồn".
      const okStage = stage ? c.stages.includes(stage) : !(c.appStage && FINISHED.includes(c.appStage));
      const okText = !t || [c.name, c.email, c.phone, c.dedupKey, c.subject].some((v) => (v || '').toLowerCase().includes(t));
      return okStage && okText;
    });
    return [...list].sort((a, b) => {
      if (sort === 'diem') return (b.score ?? -1) - (a.score ?? -1);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [candidates, q, stage, sort]);

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

      <div className="sortbar">
        <span className="muted">Sắp xếp:</span>
        <button className={`chip ${sort === 'moi' ? 'on' : ''}`} onClick={() => setSort('moi')}>Mới nhất</button>
        <button className={`chip ${sort === 'diem' ? 'on' : ''}`} onClick={() => setSort('diem')}>Điểm cao</button>
      </div>

      <nav className="filters" aria-label="Lọc theo trạng thái">
        <button className={`chip ${!stage ? 'on' : ''}`} onClick={() => setStage(null)}>
          Đang xử lý <span className="n">{activeCount}</span>
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
        {filtered.map((c) => <CandidateCard key={c.id} c={c} windows={windows} />)}
      </ul>

      {filtered.length === 0 ? <p className="muted">Không có hồ sơ khớp bộ lọc.</p> : null}
    </>
  );
}
