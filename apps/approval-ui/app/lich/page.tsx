import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { formatRelative } from '../labels';

// Lịch phỏng vấn đã tự sắp. Đọc các mục thư mời trong hàng đợi, gom khung giờ theo trạng thái.
export const dynamic = 'force-dynamic';

type Row = {
  status: string;
  title: string;
  created_at: string;
  payload: {
    ung_vien?: string;
    vi_tri?: string;
    email?: string;
    khung_gio?: string[];
  } | null;
};

const statusLabel: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối'
};

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('approval_queue')
    .select('status, title, created_at, payload')
    .eq('kind', 'hr_interview')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data || []) as Row[];
  const active = rows.filter((r) => r.status !== 'rejected');

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Lịch phỏng vấn</h1>
          <p className="sub">Khung giờ máy tự sắp, không trùng nhau. Người duyệt và gửi thư mời cho ứng viên.</p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {!error && active.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📅</div>
          <p>Chưa có lịch phỏng vấn nào.</p>
          <p className="sub">Khi bạn đưa một hồ sơ vào phỏng vấn, máy sẽ sắp khung giờ và hiện ở đây.</p>
        </div>
      ) : null}

      <ul className="list">
        {active.map((r, i) => (
          <li key={i} className="card tone-hr">
            <div className="head">
              <span className="cand-name">{r.payload?.ung_vien || r.title}</span>
              <span className="row-right">
                <span className={`stage tone-${r.status === 'approved' ? 'ok' : 'mkt'}`}>
                  {statusLabel[r.status] || r.status}
                </span>
                <time className="time" dateTime={r.created_at}>{formatRelative(r.created_at)}</time>
              </span>
            </div>
            <dl className="fields">
              <div className="field"><dt>Vị trí</dt><dd>{r.payload?.vi_tri || '—'}</dd></div>
              <div className="field"><dt>Email</dt><dd>{r.payload?.email || '—'}</dd></div>
              <div className="field field-long">
                <dt>Khung giờ đề xuất</dt>
                <dd>
                  {(r.payload?.khung_gio || []).length ? (
                    <ol className="slots">
                      {(r.payload?.khung_gio || []).map((s, j) => <li key={j}>{s}</li>)}
                    </ol>
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
