import { ago, fmtDT, type AgentDef } from '../../lib/agent-defs';

// 4/9 (user): thẻ đầu mỗi tab AI ở /kho-tri-thuc — cùng layout thẻ AI Video + Giọng
// (icon, tên, mô tả, Model, Chạy tại) và THÊM dòng giờ hoạt động (lịch + lần chạy cuối).
export default function AgentHeadCard({ a, extra }: { a: AgentDef; extra?: React.ReactNode }) {
  const s = a.last.state;
  const tone = s === 'ok' || s === 'skipped' ? 'tone-ok' : s === 'error' ? 'tone-no' : 'tone-demo';
  const label = s === 'ok' || s === 'skipped' ? 'Đang chạy' : s === 'error' ? 'Lỗi' : s === 'warn' ? 'Cảnh báo' : 'Chưa chạy';
  return (
    <div className="need-item" style={{ marginBottom: 12 }}>
      <span aria-hidden="true">{a.icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b>{a.name}</b> <span className={`badge ${tone}`}>{label}</span>
        </span>
        <span style={{ display: 'block', marginTop: 2 }}>{a.role}</span>
        <span className="sub" style={{ display: 'block', fontSize: '.82rem', marginTop: 4 }}>
          🧩 <b>Model:</b> {a.model}
          <br />📍 <b>Chạy tại:</b> {a.runsAt}
          <br />⏱ <b>Hoạt động:</b> {a.last.at ? `chạy lần cuối ${ago(a.last.at)} (${fmtDT(a.last.at)}) — ${a.last.note}` : a.last.note}
          {extra ? <><br />{extra}</> : null}
        </span>
      </span>
    </div>
  );
}
