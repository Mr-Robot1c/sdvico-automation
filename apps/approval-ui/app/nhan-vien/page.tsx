import Link from 'next/link';
import { requireEmployeeAdmin, listEmployees } from '../../lib/employees';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: 'Đang làm', tone: 'ok' },
  probation: { label: 'Thử việc', tone: 'mkt' },
  left: { label: 'Đã nghỉ', tone: 'no' },
};

export default async function Page() {
  const guard = await requireEmployeeAdmin();

  if ('error' in guard) {
    return (
      <main>
        <header className="head-row"><div><h1>Nhân viên</h1></div></header>
        <div className="err" role="alert">{guard.error}</div>
      </main>
    );
  }

  const employees = await listEmployees(guard);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Nhân viên</h1>
          <p className="sub">
            Hồ sơ nhân viên được tạo khi bấm &quot;Xác nhận đã nhận việc&quot; ở trang Hồ sơ ứng viên.
            Tổng: {employees.length} người.
          </p>
        </div>
      </header>

      {employees.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🧑‍💼</div>
          <p>Chưa có nhân viên nào.</p>
          <p className="sub">Vào trang Hồ sơ ứng viên, tìm hồ sơ đang ở trạng thái &quot;Mời nhận việc&quot;, bấm xác nhận sau khi họ đã thật sự đi làm.</p>
        </div>
      ) : (
        <table className="run-log" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Chức danh</th>
              <th>Phòng ban</th>
              <th>Trạng thái</th>
              <th>Ngày bắt đầu</th>
              <th>Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const st = STATUS_LABEL[e.trang_thai] || STATUS_LABEL.active;
              return (
                <tr key={e.id}>
                  <td><Link href={`/nhan-vien/${e.id}`}><b>{e.full_name || 'Chưa rõ tên'}</b></Link></td>
                  <td>{e.chuc_danh || <span className="muted">—</span>}</td>
                  <td>{e.phong_ban || <span className="muted">—</span>}</td>
                  <td><span className={`stage tone-${st.tone}`}>{st.label}</span></td>
                  <td className="muted">{e.ngay_bat_dau ? new Date(e.ngay_bat_dau).toLocaleDateString('vi-VN') : '—'}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleDateString('vi-VN')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
