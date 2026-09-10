import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { loadAgentDefs, type AgentDef } from '../../lib/agent-defs';
import { loadQa, QA_GROUPS } from '../../lib/hoi-dap-bot';
import AgentHeadCard from '../agent/agent-head-card';
import { addProductQa } from '../actions';
import BotChat from './bot-chat';
import QaRowActions from './qa-row-actions';

// Trang /hoi-dap — KHO KIẾN THỨC HỎI ĐÁP + BOT (lệnh sếp Long 9/9/2026 15:12: kênh online tự trả
// lời, tự chốt; mọi hỏi đáp gom thành kiến thức từng sản phẩm, đầu vào cho Bot Live Stream phase 2.
// Thanh: "được thì tạo 1 con bot trên web, nếu tôi quên thì hỏi nó").
// Bot chỉ trả lời từ kho (lib/hoi-dap-bot.ts). Người nạp, người xác nhận; máy không tự nhắn khách.
export const dynamic = 'force-dynamic';

function fmtDT(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
const shortGroup = (g: string) => g.replace(/^\d+\.\s*/, '');

export default async function Page({ searchParams }: { searchParams?: { group?: string; q?: string } }) {
  const client = getServerClient();
  const group = searchParams?.group && QA_GROUPS.includes(searchParams.group) ? searchParams.group : '';
  const prefillQ = String(searchParams?.q || '').slice(0, 300);
  const [rows, allRows, defs, botLog] = await Promise.all([
    loadQa(client, group || undefined),
    loadQa(client),
    loadAgentDefs(client),
    client.from('run_log').select('detail, created_at').eq('task', 'mkt.hoi_dap_bot').eq('status', 'warn').order('created_at', { ascending: false }).limit(8),
  ]);
  const agent = (defs as AgentDef[]).find((a) => a.key === 'hoi-dap');
  const counts: Record<string, number> = {};
  for (const r of allRows) counts[r.product_group] = (counts[r.product_group] || 0) + 1;
  const unverified = allRows.filter((r) => !r.verified).length;
  const missed = ((botLog.data || []) as any[]).map((l) => String(l.detail?.question || '')).filter(Boolean);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kho hỏi đáp và bot</h1>
          <p className="sub">
            Mọi câu khách hỏi và câu trả lời đã dùng nạp vào đây theo từng sản phẩm. Bot hỏi gì cũng trả lời, nhưng giá, thông số, bảo hành của SDVICO chỉ lấy từ kho này, không có thì nói chưa có. Đây là dữ liệu đầu vào cho Bot Live Stream giai đoạn 2.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn ghost sm" href="/api/hoi-dap?export=1" style={{ textDecoration: 'none' }}>⬇ Xuất JSON cho bot live</a>
          <Link className="btn ghost sm" href="/khach-hang" style={{ textDecoration: 'none' }}>👥 Khách hàng</Link>
          <Link className="btn ghost sm" href="/agent" style={{ textDecoration: 'none' }}>🤖 Agent</Link>
        </div>
      </header>

      {agent ? (
        <AgentHeadCard a={agent} extra={<>📚 <b>Kho:</b> {allRows.length} hỏi đáp, {allRows.length - unverified} đã xác nhận, {unverified} chờ xác nhận</>} />
      ) : null}

      <BotChat />

      {missed.length ? (
        <details className="plan-card" style={{ marginBottom: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>❓ Câu bot chưa trả lời được gần đây ({missed.length})</summary>
          <ul className="sub" style={{ margin: '8px 0 0 18px' }}>
            {missed.map((m, i) => (
              <li key={i}>
                {m} <Link href={`/hoi-dap?q=${encodeURIComponent(m)}#them`} style={{ marginLeft: 6 }}>nạp câu trả lời</Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="plan-card" style={{ marginBottom: 14 }} open={!!prefillQ} id="them">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>➕ Thêm hỏi đáp vào kho</summary>
        <form action={addProductQa} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <select name="product_group" className="note" defaultValue={group || 'Chung'}>
            {QA_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input name="source" className="note" placeholder="Nguồn: văn bản nào, ai nói, ngày nào" />
          <input name="question" className="note" placeholder="Câu hỏi (như khách hay hỏi)" defaultValue={prefillQ} required style={{ gridColumn: '1 / -1' }} />
          <textarea name="answer" className="note" rows={4} placeholder="Câu trả lời đúng, đủ số liệu" required style={{ gridColumn: '1 / -1' }} />
          <input name="confirmed_by" className="note" placeholder="Ai xác nhận (Tiến, Hòa, Linh, Thanh...)" />
          <label className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" name="verified" value="1" /> Đã xác nhận đúng (bot ưu tiên dòng này)
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn ok" type="submit">Lưu vào kho</button>
          </div>
        </form>
      </details>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href="/hoi-dap" className={`btn sm ${group === '' ? 'ok' : 'ghost'}`} style={{ textDecoration: 'none' }}>Tất cả ({allRows.length})</Link>
        {QA_GROUPS.filter((g) => counts[g]).map((g) => (
          <Link key={g} href={`/hoi-dap?group=${encodeURIComponent(g)}`} className={`btn sm ${group === g ? 'ok' : 'ghost'}`} style={{ textDecoration: 'none' }}>
            {shortGroup(g)} ({counts[g]})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📚</div>
          <p>Kho chưa có hỏi đáp nào{group ? ` cho ${shortGroup(group)}` : ''}.</p>
          <p className="sub">Nạp ở khung "Thêm hỏi đáp" phía trên, hoặc bấm "📚 Lưu hỏi đáp" ngay tại từng khách trong trang Khách hàng.</p>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="datatable">
            <thead>
              <tr><th>Sản phẩm</th><th>Hỏi</th><th>Đáp</th><th>Nguồn</th><th style={{ width: 90 }}>Trạng thái</th><th style={{ width: 60 }}>Dùng</th><th style={{ width: 160 }}></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="sub" style={{ whiteSpace: 'nowrap' }}>{shortGroup(r.product_group)}</td>
                  <td style={{ maxWidth: 220, fontWeight: 600 }}>{r.question}</td>
                  <td style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{r.answer}</td>
                  <td className="sub" style={{ maxWidth: 180 }}>
                    {r.source || '—'}
                    {r.confirmed_by ? <div>xác nhận: {r.confirmed_by}</div> : null}
                    <div>{fmtDT(r.created_at)}</div>
                  </td>
                  <td><span className={`badge ${r.verified ? 'tone-ok' : 'tone-demo'}`}>{r.verified ? '✔ Đã xác nhận' : '? Chờ'}</span></td>
                  <td className="sub" style={{ textAlign: 'center' }}>{r.used_count || 0}</td>
                  <td>
                    <QaRowActions id={r.id} verified={r.verified} question={r.question} answer={r.answer} source={r.source || ''} confirmedBy={r.confirmed_by || ''} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
