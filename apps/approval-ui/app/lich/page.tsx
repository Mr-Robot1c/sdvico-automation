import { headers } from 'next/headers';
import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';
import { saveWindows, saveCapacity } from '../actions';
import DismissInterviewButton from './dismiss-interview-button';

// Lịch phỏng vấn đã tự sắp. Sắp theo người gần đến giờ nhất.
export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  status: string;
  title: string;
  created_at: string;
  ref_id: string | null;
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
    .select('id, status, title, created_at, ref_id, payload')
    .eq('kind', 'hr_interview')
    .limit(100);

  const rows = (data || []) as Row[];

  // Token + giờ ứng viên đã chọn / đã đề xuất khác (cột có thể chưa migrate — đọc an toàn).
  type AppInfo = { schedule_token: string | null; chosen_slot: string | null; proposed_slot: string | null; proposed_note: string | null };
  const appMap = new Map<string, AppInfo>();
  const refIds = rows.map((r) => r.ref_id).filter(Boolean) as string[];
  if (refIds.length) {
    const { data: apps } = await client.from('hr_applications').select('id, schedule_token, chosen_slot, proposed_slot, proposed_note').in('id', refIds);
    for (const a of (apps || []) as Array<{ id: string } & AppInfo>) {
      appMap.set(a.id, { schedule_token: a.schedule_token, chosen_slot: a.chosen_slot, proposed_slot: a.proposed_slot, proposed_note: a.proposed_note });
    }
  }
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const baseUrl = host ? `${h.get('x-forwarded-proto') || 'https'}://${host}` : '';
  // Sắp theo khung giờ gần nhất, người sắp đến phỏng vấn lên đầu.
  const active = rows
    .filter((r) => r.status !== 'rejected')
    .map((r) => ({ r, near: nearest(r.payload?.khung_gio || []) }))
    .sort((a, b) => (a.near?.ts ?? Infinity) - (b.near?.ts ?? Infinity));

  const [{ data: cfg }, { data: capCfg }] = await Promise.all([
    client.from('app_config').select('value').eq('key', 'interview_windows').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'interview_capacity').maybeSingle(),
  ]);
  const windows: string[] = Array.isArray(cfg?.value) ? (cfg!.value as string[]) : ['09:00', '10:30', '14:00', '15:30'];
  const capacity: number = Number(capCfg?.value) >= 1 ? Number(capCfg?.value) : 3;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Lịch phỏng vấn</h1>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {/* Cấu hình khung giờ và sức chứa — gập lại mặc định để danh sách phỏng vấn nằm ngay dưới
          tiêu đề. Ai chỉnh cấu hình bấm mở, chỉnh xong đóng lại. */}
      <details className="settings-details">
        <summary>
          Cấu hình khung giờ và sức chứa
          <span className="settings-summary-note">
            {windows.length} khung · {capacity} người/khung
          </span>
        </summary>

        <form action={saveWindows} className="settings-box">
          <label htmlFor="windows"><b>Khung giờ phỏng vấn mong muốn</b></label>
          <p className="muted" style={{ margin: '2px 0 8px' }}>Máy tự sắp lịch trong các khung này, các ngày làm việc. Nhập giờ cách nhau bằng dấu phẩy.</p>
          <div className="row">
            <input className="note" id="windows" name="windows" defaultValue={windows.join(', ')} placeholder="09:00, 10:30, 14:00, 15:30" />
            <button className="btn ok" type="submit">Lưu khung giờ</button>
          </div>
        </form>

        <form action={saveCapacity} className="settings-box">
          <label htmlFor="capacity"><b>Sức chứa mỗi khung</b></label>
          <p className="muted" style={{ margin: '2px 0 8px' }}>
            Số ứng viên tối đa cùng được đề xuất một khung giờ. 1 nghĩa là một kèm một. Đặt cao hơn
            để phỏng vấn nhóm hoặc chạy song song nhiều phòng.
          </p>
          <div className="row">
            <input className="note" id="capacity" name="capacity" type="number" min={1} max={20} step={1} defaultValue={capacity} style={{ maxWidth: 120 }} />
            <button className="btn ok" type="submit">Lưu sức chứa</button>
          </div>
        </form>
      </details>

      {!error && active.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📅</div>
          <p>Chưa có lịch phỏng vấn nào.</p>
          <p className="sub">Khi bạn đưa một hồ sơ vào phỏng vấn (nút Xét duyệt bên Hồ sơ), máy sắp khung giờ và hiện ở đây.</p>
        </div>
      ) : null}

      {active.length ? <p className="sub">Có {active.length} ứng viên trong lịch, xếp theo giờ gần nhất.</p> : null}

      <ul className="list">
        {active.map(({ r, near }, i) => {
          const passed = near ? near.ts < Date.now() : false;
          const candName = r.payload?.ung_vien || r.title;
          return (
            <li key={i} className="card tone-hr">
              <div className="head">
                <span className="cand-name">{candName}</span>
                <span className="row-right">
                  {passed ? <span className="stage tone-default" title="Khung giờ đã qua">Đã qua</span> : null}
                  <span className={`stage tone-${r.status === 'approved' ? 'ok' : 'mkt'}`}>{statusLabel[r.status] || r.status}</span>
                  <time className="time" dateTime={r.created_at}>{formatRelative(r.created_at)}</time>
                </span>
              </div>
              <dl className="fields">
                <div className="field"><dt>Gần nhất</dt><dd><b>{near?.label || 'Chưa có khung'}</b></dd></div>
                <div className="field"><dt>Vị trí</dt><dd>{r.payload?.vi_tri || 'Chưa gắn vị trí'}</dd></div>
                <div className="field"><dt>Email</dt><dd>{r.payload?.email || 'Chưa có'}</dd></div>
                <div className="field field-long">
                  <dt>Các khung đề xuất</dt>
                  <dd>
                    {(r.payload?.khung_gio || []).length ? (
                      <ol className="slots">{(r.payload?.khung_gio || []).map((s, j) => <li key={j}>{s}</li>)}</ol>
                    ) : 'Chưa có khung'}
                  </dd>
                </div>
                <div className="field">
                  <dt>Ứng viên đã chọn</dt>
                  <dd>{r.ref_id && appMap.get(r.ref_id)?.chosen_slot
                    ? <b style={{ color: 'var(--ok)' }}>{appMap.get(r.ref_id)!.chosen_slot}</b>
                    : <span className="muted">Chưa chọn</span>}</dd>
                </div>
                {r.ref_id && appMap.get(r.ref_id)?.proposed_slot ? (
                  <div className="field field-long">
                    <dt>⚠ Ứng viên đề xuất giờ khác</dt>
                    <dd>
                      <b style={{ color: 'var(--warn, #8a6a00)' }}>{appMap.get(r.ref_id)!.proposed_slot}</b>
                      {appMap.get(r.ref_id)?.proposed_note ? (
                        <div className="muted" style={{ fontSize: '0.85em', marginTop: 4 }}>
                          Ghi chú: {appMap.get(r.ref_id)!.proposed_note}
                        </div>
                      ) : null}
                      <div className="muted" style={{ fontSize: '0.8em', marginTop: 4 }}>
                        Liên hệ ứng viên qua email để chốt lịch cụ thể.
                      </div>
                    </dd>
                  </div>
                ) : null}
                {r.ref_id && appMap.get(r.ref_id)?.schedule_token ? (
                  <div className="field field-long">
                    <dt>Link gửi ứng viên tự chọn giờ</dt>
                    <dd><code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{baseUrl}/phong-van/{appMap.get(r.ref_id)!.schedule_token}</code></dd>
                  </div>
                ) : null}
              </dl>

              <div className="card-danger-row">
                <DismissInterviewButton queueId={r.id} candName={candName} passed={passed} />
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
