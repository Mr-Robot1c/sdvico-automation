import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';
import { saveWindows } from '../actions';

// Lịch phỏng vấn đã tự sắp. Sắp theo người gần đến giờ nhất.
export const dynamic = 'force-dynamic';

type Row = {
  status: string;
  title: string;
  created_at: string;
  payload: { ung_vien?: string; vi_tri?: string; email?: string; khung_gio?: string[] } | null;
};

const statusLabel: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };

// Đổi chuỗi khung giờ "Thứ Tư, 12/08/2026, 09:00" thành mốc thời gian.
function slotTs(s: string): number {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})/);
  if (!m) return Infinity;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
}
// Khung giờ gần nhất chưa qua, không có thì lấy sớm nhất.
function nearest(slots: string[]): { label: string; ts: number } | null {
  const now = Date.now();
  const parsed = slots.map((s) => ({ label: s, ts: slotTs(s) })).filter((x) => isFinite(x.ts)).sort((a, b) => a.ts - b.ts);
  if (!parsed.length) return null;
  return parsed.find((x) => x.ts >= now) || parsed[0];
}

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('approval_queue')
    .select('status, title, created_at, payload')
    .eq('kind', 'hr_interview')
    .limit(100);

  const rows = (data || []) as Row[];
  // Sắp theo khung giờ gần nhất, người sắp đến phỏng vấn lên đầu.
  const active = rows
    .filter((r) => r.status !== 'rejected')
    .map((r) => ({ r, near: nearest(r.payload?.khung_gio || []) }))
    .sort((a, b) => (a.near?.ts ?? Infinity) - (b.near?.ts ?? Infinity));

  const { data: cfg } = await client.from('app_config').select('value').eq('key', 'interview_windows').maybeSingle();
  const windows: string[] = Array.isArray(cfg?.value) ? (cfg!.value as string[]) : ['09:00', '10:30', '14:00', '15:30'];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Lịch phỏng vấn</h1>
          <p className="sub">Mỗi hồ sơ vào phỏng vấn được cấp ba khung giờ không trùng ai. Danh sách sắp theo người gần đến giờ nhất.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <form action={saveWindows} className="settings-box">
        <label htmlFor="windows"><b>Khung giờ phỏng vấn mong muốn</b></label>
        <p className="muted" style={{ margin: '2px 0 8px' }}>Máy tự sắp lịch trong các khung này, các ngày làm việc. Nhập giờ cách nhau bằng dấu phẩy.</p>
        <div className="row">
          <input className="note" id="windows" name="windows" defaultValue={windows.join(', ')} placeholder="09:00, 10:30, 14:00, 15:30" />
          <button className="btn ok" type="submit">Lưu khung giờ</button>
        </div>
      </form>

      {!error && active.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📅</div>
          <p>Chưa có lịch phỏng vấn nào.</p>
          <p className="sub">Khi bạn đưa một hồ sơ vào phỏng vấn (nút Xét duyệt bên Hồ sơ), máy sắp khung giờ và hiện ở đây.</p>
        </div>
      ) : null}

      {active.length ? <p className="sub">Có {active.length} ứng viên trong lịch, xếp theo giờ gần nhất.</p> : null}

      <ul className="list">
        {active.map(({ r, near }, i) => (
          <li key={i} className="card tone-hr">
            <div className="head">
              <span className="cand-name">{r.payload?.ung_vien || r.title}</span>
              <span className="row-right">
                <span className={`stage tone-${r.status === 'approved' ? 'ok' : 'mkt'}`}>{statusLabel[r.status] || r.status}</span>
                <time className="time" dateTime={r.created_at}>{formatRelative(r.created_at)}</time>
              </span>
            </div>
            <dl className="fields">
              <div className="field"><dt>Gần nhất</dt><dd><b>{near?.label || '—'}</b></dd></div>
              <div className="field"><dt>Vị trí</dt><dd>{r.payload?.vi_tri || '—'}</dd></div>
              <div className="field"><dt>Email</dt><dd>{r.payload?.email || '—'}</dd></div>
              <div className="field field-long">
                <dt>Các khung đề xuất</dt>
                <dd>
                  {(r.payload?.khung_gio || []).length ? (
                    <ol className="slots">{(r.payload?.khung_gio || []).map((s, j) => <li key={j}>{s}</li>)}</ol>
                  ) : '—'}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </main>
  );
}
