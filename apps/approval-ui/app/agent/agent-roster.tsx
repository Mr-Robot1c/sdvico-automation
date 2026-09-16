import Link from 'next/link';
import { ago, fmtDT } from '../../lib/agent-defs';
import { AGENT_SCHEDULE } from '../../lib/agent-schedule';
import { cachedAgentActivity, cachedAgentDefs } from '../../lib/cached';

// 28/8 (user: "chi dung 1 dashboard the hien tat ca cac Agent"): bo 9 AI card tach ra
// component dung chung — trang /agent va trang Nguon hoc du lieu (/kho-tri-thuc tab Tong
// quan) cung render, khong con 2 bo agent cu/moi lech nhau. Server component tu query.
// 4/9: dinh nghia 10 AI chuyen sang lib/agent-defs.ts (dung chung voi AgentHeadCard o moi
// tab AI cua /kho-tri-thuc).
// 15/9 (sếp: "muốn biết các Agent hoạt động vào thời gian nào, thời điểm nào"): mỗi thẻ thêm LỊCH CHẠY
// thật (lib/agent-schedule.ts, chép từ file cron) + dải 7 NGÀY (số lần chạy / lỗi mỗi ngày từ run_log).

export default async function AgentRoster() {
  // 16/9 (Thanh: "web chậm và lag... ưu tiên nhất"): 12 truy vấn định nghĩa AI đi qua cache 2 phút.
  const [agents, activity] = await Promise.all([cachedAgentDefs(), cachedAgentActivity()]);

  return (
    <div className="agent-grid">
      {agents.map((a) => {
        const sch = AGENT_SCHEDULE[a.key];
        const act = activity[a.key];
        const max = Math.max(1, ...act.days.map((d) => d.ok + d.err + d.warn));
        return (
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
            <p className="ag-role" style={{ margin: 0, fontSize: '.76rem' }}>📍 <b>Chạy tại:</b> {sch?.where || a.runsAt}</p>
            {sch?.when?.length ? (
              <div className="ag-sched">
                <b>🕒 Lịch chạy:</b>
                <ul>{sch.when.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            ) : null}
            {/* 16/9 (Thanh: "bấm vô ô đỏ cũng không được"): cả dải 7 ngày là link sang trang Chi
                tiết của AI đó — nơi liệt kê lần chạy + lỗi. */}
            {(() => {
              const strip = (
                <>
                  <span className="ag-strip-lbl">7 ngày: <b>{act.total}</b> lần{act.errors ? <span className="err-note" style={{ marginLeft: 4 }}>· {act.errors} lỗi</span> : ''}</span>
                  <span className="ag-bars">
                    {act.days.map((d) => {
                      const n = d.ok + d.err + d.warn;
                      const h = n ? Math.max(3, Math.round((n / max) * 18)) : 2;
                      return <span key={d.date} className={`ag-bar ${d.err ? 'err' : n ? 'ok' : 'none'}`} style={{ height: h }} title={`${d.label}: ${n} lần${d.err ? `, ${d.err} lỗi` : ''}${d.warn ? `, ${d.warn} cảnh báo` : ''}`} />;
                    })}
                  </span>
                  <span className="ag-strip-days">{act.days[0]?.label} → {act.days[6]?.label}</span>
                </>
              );
              const title = `Số lần chạy mỗi ngày trong 7 ngày gần nhất (đỏ = có lỗi)${a.href ? ' — bấm để xem chi tiết' : ''}`;
              return a.href
                ? <Link href={a.href} className="ag-strip" style={{ textDecoration: 'none', color: 'inherit' }} title={title}>{strip}</Link>
                : <div className="ag-strip" title={title}>{strip}</div>;
            })()}
            <div className="ag-last">
              {/* 1/9: đổi "Học lần cuối" -> "Chạy lần cuối" cho đúng — AI làm việc chứ đâu chỉ học. */}
              {a.last.at ? `Chạy lần cuối ${ago(a.last.at)} (${fmtDT(a.last.at)}) — ${a.last.note}` : a.last.note}
              {act.lastErr ? <div className="err-note" style={{ whiteSpace: 'normal', fontWeight: 400 }}>Lỗi gần nhất: {act.lastErr}</div> : null}
              {a.href ? <> · <Link className="src" href={a.href}>Chi tiết →</Link></> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
