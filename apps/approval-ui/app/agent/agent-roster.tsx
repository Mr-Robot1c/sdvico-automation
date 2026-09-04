import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { loadAgentDefs, ago, fmtDT } from '../../lib/agent-defs';

// 28/8 (user: "chi dung 1 dashboard the hien tat ca cac Agent"): bo 9 AI card tach ra
// component dung chung — trang /agent va trang Nguon hoc du lieu (/kho-tri-thuc tab Tong
// quan) cung render, khong con 2 bo agent cu/moi lech nhau. Server component tu query.
// 4/9: dinh nghia 10 AI chuyen sang lib/agent-defs.ts (dung chung voi AgentHeadCard o moi
// tab AI cua /kho-tri-thuc).

export default async function AgentRoster() {
  const client = getServerClient();
  const agents = await loadAgentDefs(client);

  return (
    <div className="agent-grid">
      {agents.map((a) => (
        <div key={a.name} className="agent-card" style={a.boss ? { borderColor: 'var(--brand-red)', background: 'var(--brand-red-bg)' } : undefined}>
          <div className="ag-head">
            <span className="ag-name">{a.icon} {a.name}</span>
            {/* 1/9 (user hỏi): "Lỗi" chỉ dành cho error thật; skipped = bỏ qua có mục đích (xanh),
                null = chưa từng chạy (xám). */}
            {(() => {
              const s = a.last.state;
              const tone = s === 'ok' || s === 'skipped' ? 'tone-ok' : s === 'error' ? 'tone-no' : 'tone-demo';
              const label = s === 'ok' ? 'Đang chạy' : s === 'skipped' ? 'Đang chạy' : s === 'error' ? 'Lỗi' : s === 'warn' ? 'Cảnh báo' : 'Chưa chạy';
              const title = s === 'skipped' ? 'Có lịch chạy đều — lần này bỏ qua có mục đích (đã đủ việc/hết trong ngày)' : undefined;
              return <span className={`badge ${tone}`} title={title}>{label}</span>;
            })()}
          </div>
          <p className="ag-role" style={{ margin: 0 }}>{a.role}</p>
          <p className="ag-role" style={{ margin: 0, fontSize: '.76rem' }}>🧩 <b>Model:</b> {a.model}</p>
          <p className="ag-role" style={{ margin: 0, fontSize: '.76rem' }}>📍 <b>Chạy tại:</b> {a.runsAt}</p>
          <div className="ag-last">
            {/* 1/9: đổi "Học lần cuối" -> "Chạy lần cuối" cho đúng — AI làm việc chứ đâu chỉ học. */}
            {a.last.at ? `Chạy lần cuối ${ago(a.last.at)} (${fmtDT(a.last.at)}) — ${a.last.note}` : a.last.note}
            {a.href ? <> · <Link className="src" href={a.href}>Chi tiết →</Link></> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
