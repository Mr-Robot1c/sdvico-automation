import { ago, type AgentDef } from '../../lib/agent-defs';

// Thẻ đầu mỗi tab AI ở /kho-tri-thuc. 23/10 (user: bỏ thông tin thừa): chỉ còn tên, trạng thái, việc làm, lần chạy cuối;
// bỏ dòng model, nơi chạy và ghi chú kỹ thuật (extra vẫn nhận để chỗ gọi cũ không vỡ, không hiển thị).
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
          {a.last.at ? `Chạy lần cuối ${ago(a.last.at)}` : a.last.note}
        </span>
      </span>
    </div>
  );
}
